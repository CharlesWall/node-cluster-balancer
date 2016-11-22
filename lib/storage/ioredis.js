'use strict';

const Promise = require('bluebird');
const Redis = require('ioredis');
const uuid = require('uuid');
const util = require('util');
const EventEmitter = require('events').EventEmitter;
const url = require('url');

const Status = require('../Status');

const DEFAULT_STATUS_TTL = 60 * 1000 /* 1 minute */;

function RedisInterface(options) {
    let _redis;
    let _closeRedisWhenStopped = false;

    if (options.redis) {
        _redis = options.redis;
        _closeRedisWhenStopped = false;
    } else if (options.url) {
        let _url = url.parse(options.url);
        _redis = new Redis(_url.port, _url.host);
    } else {
        throw new Error('Invald Redis url: ' + options.url);
    }

    if (!options.clusterName) {
        throw new Error('Invalid clusterName: ' + options.clusterName);
    }

    /* private variables */
    const _selfName = uuid.v4();
    const _clusterName = options.clusterName;
    const _clusterPath = `nodeClusterBalancer:${_clusterName}`;
    const _selfPath = `${_clusterPath}_${_selfName}`;
    const _statusTtl = options.statusTtl || DEFAULT_STATUS_TTL;
    const _failedHashGets = {};

    let _stopped = false;

    this.ready = function() {
        return (_redis.status === 'ready') ?
            Promise.resolve() :
            new Promise((resolve, reject) => {
                _redis.once('ready', resolve);
                _redis.once('error', reject);
            });
    };

    /* public functions */
    this.getPeerStatuses = function() {
        return _getPeerList().then(_getPeerStatuses);
    };

    this.publishSelfStatus = function(selfStatus) {
        return Promise.all([
            _setSelfHashKey(),
            _setSelfStatus(selfStatus)
        ]).then(() => { return selfStatus; });
    };

    this.stop = function() {
        if (_stopped) { return Promise.resolve(); }

        _stopped = true;

        return Promise.resolve().then(() => {
            return _removeHash(_selfName);
        }).then(() => {
            // Only close Redis client if we created the client for provided URL
            // (and the client was not given to us)
            if (_closeRedisWhenStopped) {
                return _redis.quit();
            }
        });
    };

    /* private functions */
    function _getPeerList() {
        return new Promise((resolve, reject) => {
            _redis.hgetall(_clusterPath, function(err, peerHash) {
                if (err) { return reject(err); }
                let peerKeys = [];
                for(let peerName in peerHash) {
                    if (peerName === _selfName) { continue; }
                    let peerKey = peerHash[peerName];
                    peerKeys.push({
                        peerName: peerName,
                        peerKey: peerKey
                    });
                }
                resolve(peerKeys);
            });
        });
    }

    function _getPeerStatuses(peerKeys) {
        return Promise.map(peerKeys, _getPeerStatus).then((statuses) => {
            return statuses.filter((status) => {
                return (status != null);
            });
        });
    }

    function _setSelfHashKey() {
        return _redis.hset(_clusterPath, _selfName, _selfPath);
    }

    function _setSelfStatus(status) {
        let statusString = status.serialize();
        let ttl = Math.ceil(_statusTtl / 1000);
        return _redis.set(_selfPath, statusString, 'EX', ttl);
    }

    function _getPeerStatus(parameters) {
        let {peerName, peerKey} = parameters;
        return new Promise((resolve, reject) => {
            _redis.get(peerKey, function(err, result) {
                if(result === null) {
                    _failedHashGets[peerKey] = _failedHashGets[peerKey] || 0;
                    _failedHashGets[peerKey]++;

                    // allow 2 misses before we remove the missing server from
                    // further calculations
                    if (_failedHashGets[peerKey] > 2) {
                        delete _failedHashGets[peerKey];
                        _removeHash(peerName).then(() => {
                            resolve(null);
                        });
                        return;
                    }
                    resolve(null);
                    return;
                }
                try {
                    resolve(Status.deserialize(result));
                    return;
                } catch (error) {
                    reject(error);
                }
            });
        });
    }

    function _removeHash(peerName) {
        return _redis.hdel(_clusterPath, peerName);
    }
}

util.inherits(RedisInterface, EventEmitter);

exports.create = function(options, advisor) {
    return new RedisInterface(options);
};
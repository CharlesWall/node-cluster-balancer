'use strict';

const Promise = require('bluebird');
const uuid = require('uuid');
const zookeeper = require('node-zookeeper-client');
const CreateMode = zookeeper.CreateMode;
const Status = require('../Status');

const DEFAULT_MAX_CONSECUTIVE_FAILURES = 10;

function ZookeeperInterface(options) {
    if (!options.url)   {
        throw new Error('Invald Zookeeper url: ' + options.url);
    }

    if (!options.clusterName) {
        throw new Error('Invalid clusterName: ' + options.clusterName);
    }

    /* private variables */
    const _selfName = options.selfName || uuid.v4();
    const _url = options.url;
    const _clusterName = options.clusterName;
    const _maxConsecutiveFailures = options.maxConsecutiveFailures ||
        DEFAULT_MAX_CONSECUTIVE_FAILURES;

    const _clusterPath = `/nodeClusterBalancer/${_clusterName}`;
    const _selfPath = `${_clusterPath}/${_selfName}`;

    let _setupPromise = null; //this only has to happen once
    let _clientPromise = null;
    let _closed = false;

    /* public functions */
    this.getPeerStatuses = function() {
        return _getPeerList().then((children) => {
            return Promise.map(children, _getChildStatus);
        });
    };

    this.publishSelfStatus = function(selfStatus) {
        return _setup().then(_setStatus(selfStatus));
    };

    this.ready = function() {
        // If we started initializing the ZooKeeper client then return that.
        // Otherwise, we are waiting on setup so return the setup promise.
        return _clientPromise || _setupPromise;
    };

    this.stop = function() {
        _closed = true;
        if(_clientPromise) {
            return _clientPromise.then(client => {
                if (client.state.code) {
                    _clientPromise = null;
                    client.close();
                    return new Promise((resolve, reject) => {
                        client.once('disconnected', resolve);
                        // sometimes we don't get the disconnected event
                        setTimeout(() => {
                            if(client.state.code === 0) {
                                resolve();
                            }
                        }, 1000);
                    });
                }
            });
        } else { return Promise.resolve(); }
    };

    /* private functions */
    function _setup() {
        function _getClient() {
            if (_closed) { throw new Error('Zookeeper connection is closed'); }
            _clientPromise = _clientPromise || new Promise((resolve, reject) => {
                let client = zookeeper.createClient(_url, {
                    sessionTimeout: options.sessionTimeout
                });
                let consecutiveFailures = 0;

                client.once('connected', function() {
                    consecutiveFailures = 0;
                    resolve(client);
                });

                client.once('error', retryConnection);
                client.once('disconnected', retryConnection);
                client.once('expired', retryConnection);
                client.once('authenticationFailed', retryConnection);

                client.connect();

                function retryConnection() {
                    if (_closed) { return; }
                    client.close();
                    if (consecutiveFailures > _maxConsecutiveFailures) {
                        let error = new Error('Too many consecutive zookeeper client failures');
                        return reject(error);
                    }
                    _clientPromise = _getClient();
                    ++consecutiveFailures;
                }
            });
            return _clientPromise;
        }

        function _createSelfNode(client) {
            return new Promise((resolve, reject) => {
                client.create(
                    _selfPath,
                    JSON.stringify({}),
                    CreateMode.EPHEMERAL,
                    function(error, path) {
                        if (error) { return reject(error); }
                        resolve(path);
                    }
                );
            });
        }

        function _ensureDirectory(client) {
            return new Promise((resolve, reject) => {
                client.mkdirp(_clusterPath, function(err, path) {
                    if (err) { return reject(err); }
                    resolve(path);
                });
            });
        }

        _setupPromise = _setupPromise || _getClient()
            .tap((client) => {
                return _ensureDirectory(client);
            }).tap((client) => {
                return _createSelfNode(client);
            });

        //get the client again in case the promise has gone stale
        return _setupPromise.then(_getClient);
    }

    function _setStatus(status) {
        return function () {

            return _setup().then((client) => {
                return new Promise((resolve, reject) => {
                    client.setData(
                        _selfPath,
                        new Buffer(status.serialize()),
                        -1,
                        function(error, stat) {
                            if (error) { return reject(error); }
                            resolve(status);
                        }
                    );
                });
            });

        };
    }

    function _getPeerList() {
        return _setup().then((client) => {
            return new Promise((resolve, reject) => {
                client.getChildren(_clusterPath, function(error, peers) {
                    if (error) { return reject(error); }
                    peers = peers.filter((peer) => {
                        return peer !== _selfName;
                    });
                    resolve(peers);
                });
            });
        });
    }

    function _getChildStatus(child) {
        let childPath = `${_clusterPath}/${child}`;
        return _setup().then((client) => {
            return new Promise((resolve, reject) => {
                client.getData(childPath, (err, statusString) => {
                    if (err) {
                        if (err.message === 'Exception: NO_NODE[-101]') {
                            return resolve(null);
                        }
                        else { return reject(err); }
                    }
                    if (!statusString) { return resolve(null); }
                    let status;
                    try {
                        status = Status.deserialize(statusString);
                    } catch (error) {
                        return reject(error);
                    }
                    resolve(status);
                });
            });
        });
    }

    _setup();
}

exports.create = function(options, advisor) {
    return new ZookeeperInterface(options);
};
'use strict';

const {EventEmitter} = require('events');
const Promise = require('bluebird');
const util = require('util');
const ZookeeperInterface = require('./lib/ZookeeperInterface');
const RedisInterface = require('./lib/RedisInterface');
const Status = require('./lib/Status');
const uuid = require('uuid');

function Advice(parameters) {
    this.change = parameters.change;
    this.targets = parameters.targets;
    this.meanDelta = parameters.meanDelta;
}


const DEFAULT_STEP_SIZE = 2;
const DEFAULT_INTERVAL = 5000;
const DEFAULT_PRECISION = 10;

function Advisor(options) {
    if(!options || typeof options !== 'object') {
        throw new Error('Initialization options are required');
    }

    if(typeof options.getSelfStatus !== 'function') {
        throw new Error('Invalid self status getter');
    }

    /* private variables */
    const _getSelfStatus = options.getSelfStatus;
    const _stepSize = options.stepSize || DEFAULT_STEP_SIZE;
    const _interval = options.interval || DEFAULT_INTERVAL;
    const _precision = options.precision || DEFAULT_PRECISION;
    const _selfName = options.selfName || uuid.v4();
    const _clusterName = options.clusterName;
    const _address = options.address;
    const _advisor = this;
    let _peerStatuses = null;
    let _selfStatus = null;
    let _getStatusTimeoutId = null;
    let _closed = false;

    let dbInterface;

    if(options.zookeeper && typeof options.zookeeper === 'object') {
        options.zookeeper.sessionTimeout = options.zookeeper.sessionTimeout || _interval * 2;
        options.zookeeper.clusterName = _clusterName;
        dbInterface = new ZookeeperInterface(options.zookeeper);
    } else if (options.redis && typeof options.redis === 'object') {
        options.redis.statusTtl = options.redis.statusTtl || _interval * 2;
        options.redis.clusterName = _clusterName;
        dbInterface = new RedisInterface(options.redis);
    } else if (options.dbInterface) {
        dbInterface = options.dbInterface;
    }

    dbInterface.on('connected', function() {
        _advisor.emit('ready');
    });

    /* public functions */
    this.start = function() {
        if(_getStatusTimeoutId) {
            throw new Error('Advisor already started');
        }
        (function _scheduleAdvise() {
            if(_closed) { return; }
            // use setTimeout instead of interval in case getting self status takes
            // any significant amount of time
            _getStatusTimeoutId = setTimeout(function() {
                Promise.all([
                    _publishSelfStatus(),
                    _peerStatusGetter()
                ])
                    .spread(_generateAdvise)
                    .then(_scheduleAdvise)
                    .catch(error => { _advisor.emit('error', error); });
            }, _interval);
        })();
    };

    this.stop = function() {
        clearTimeout(_getStatusTimeoutId);
        this._getStatusTimeoutId = null;
    };

    this.getSelfStatus = function() {
        return _selfStatus;
    };

    this.getPeerStatuses = function() {
        return _peerStatuses;
    };

    this.getSelfName = function() {
        return _selfName;
    };

    this.getAddress = function() {
        return _address;
    };

    this.close = function() {
        _closed = true;
        this.stop();
        return dbInterface.close();
    };

    /* private functions */
    function _publishSelfStatus(){
        return _getSelfStatus()
            .then((statusParameters) => {
                let status = new Status(statusParameters);
                _selfStatus = status;
                status.validate();
                return dbInterface.publishSelfStatus(status);
            });
    }

    function _peerStatusGetter(){
        return dbInterface.getPeerStatuses()
            .tap(function(peerStatuses) { _peerStatuses = peerStatuses; });
    }

    function _generateAdvise(selfStatus, peerStatuses) {
        let allStatuses = [selfStatus].concat(peerStatuses);
        if (allStatuses.length < 2) {
            _advisor.emit('advice', null);
            return null;
        }

        let maxStatus = null;
        let minStatus = null;
        let sum = 0;
        allStatuses.forEach(function(status) {
            if (!status) { return; }
            let value = status.value;
            if (maxStatus === null || value > maxStatus.value) {
                maxStatus = status;
            }

            if (minStatus === null || value < minStatus.value) {
                minStatus = status;
            }

            sum += value;
        });

        let mean = sum / allStatuses.length;
        let delta = maxStatus.value - minStatus.value;

        let change = 0;
        if (delta > _precision && selfStatus.value > mean) {
            change = 0 - _stepSize;
        }

        let advice = new Advice({
            change: change,
            targets: [minStatus],
            meanDelta: selfStatus.value - mean
        });
        _advisor.emit('advice', advice);
    }

    this.start();
}

util.inherits(Advisor, EventEmitter);

Advisor.intervals = {
    HYPER_REALTIME: 100,
    REALTIME: 1000,
    ACTIVE: 5000,
    PASSIVE: 30000,
    GLACIAL: 60000
};

Advisor.precisions = {
    HIGH: 5,
    NORMAL: 10,
    LOW: 50
};

Advisor.stepSizes = {
    // AUTO: -1, //TODO
    LARGE: 5,
    MEDIUM: 2,
    SMALL: 1
};

module.exports = Advisor;

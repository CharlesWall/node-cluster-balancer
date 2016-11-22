'use strict';

const {EventEmitter} = require('events');
const util = require('util');
const uuid = require('uuid');
const Promise = require('bluebird');

const Status = require('./Status');
const Advice = require('./Advice');
const Change = require('./Change');

const DEFAULT_STEP_SIZE = 2;
const DEFAULT_ADVICE_INTERVAL = 5000;
const DEFAULT_REPORT_INTERVAL = 2500;
const DEFAULT_PRECISION = 10;

function statusValueSorter(status1, status2) {
    return status1.value - status2.value;
}

function Advisor(options) {
    EventEmitter.call(this);

    if(!options || typeof options !== 'object') {
        throw new Error('Initialization options are required');
    }

    if(typeof options.getSelfStatus !== 'function') {
        throw new Error('Invalid self status getter');
    }

    const _getSelfStatus_provided = options.getSelfStatus;
    const _stepSize = options.stepSize || DEFAULT_STEP_SIZE;
    const _precision = options.precision || DEFAULT_PRECISION;
    const _selfName = options.selfName || uuid.v4();
    const _selfAddress = options.selfAddress;
    const _clusterName = options.clusterName;
    const _advisor = this;
    const _healthyThreshold = options.healthyThreshold;

    let _adviceInterval = options.adviceInterval || options.interval;
    let _reportInterval = options.advisingInterval || options.interval;

    if (_adviceInterval == null) {
        _adviceInterval = DEFAULT_ADVICE_INTERVAL;
    }

    if (_reportInterval == null) {
        _reportInterval = DEFAULT_REPORT_INTERVAL;
    }

    let _peerStatuses = null;
    let _selfStatus = null;
    let _reportTimer = null;
    let _adviceTimer = null;
    let _reporting = false;
    let _advising = false;
    let _storageStopped = true;
    let _storage;

    /* private variables */
    const _getSelfStatus = () => {
        // The user-provided `getSelfStatus` function can return a `Promise`
        // or a raw object so we use `Promise.resolve(...)` to normalize.
        return Promise.resolve(_getSelfStatus_provided()).then((selfStatus) => {
            // Update our `_selfStatus` when the user's `getSelfStatus` function
            // is called.
            if (selfStatus.constructor === Number) {
                selfStatus = {
                    value: selfStatus
                };
            }
            selfStatus.name = _selfName;
            selfStatus.address = _selfAddress;
            selfStatus.timestamp = Date.now();
            return (_selfStatus = selfStatus);
        });
    };

    let storage = options.storage;
    if (storage.type === 'ioredis') {
        storage.statusTTL = storage.statusTTL || _reportInterval * 2;
        storage.clusterName = _clusterName;
        _storage = require('./storage/ioredis').create(storage, this);
    } else if (storage.type === 'zookeeper') {
        storage.sessionTimeout = storage.sessionTimeout || _reportInterval * 2;
        storage.clusterName = _clusterName;
        _storage = require('./storage/zookeeper').create(storage, this);
    } else if (storage.type === 'custom' || storage.type == null) {
        _storage = storage;
    } else {
        throw new Error(`Unknown storage type: ${storage.type}`);
    }

    this.ready = function() {
        return _storage.ready().then(() => {
            return _advisor;
        });
    };

    const _handleAdviceIntervalTick = function() {
        // If there was a pending timeout then it must have elapsed if this
        // function was invoked so we reset the timer handle
        if (_adviceTimer) {
            // If we were asked to force update then clear any existing timers
            clearTimeout(_adviceTimer);
            _adviceTimer = null;
        }

        return _advisor.getAdvice().then(advice => {
                _advisor.emit('advice', advice);
            })
            .catch(error => { _advisor.emit('error', error); })
            .finally(() => {
                // use `setTimeout` instead of `setInterval` in case getting
                // self status takes any significant amount of time
                if (_advising && _adviceInterval) {
                    _adviceTimer = setTimeout(_handleAdviceIntervalTick, _adviceInterval);
                }
            });
    };

    const _handleReportIntervalTick = function() {
        // If there was a pending timeout then it must have elapsed if this
        // function was invoked so we reset the timer handle
        if (_reportTimer) {
            // If we were asked to force update then clear any existing timers
            clearTimeout(_reportTimer);
            _reportTimer = null;
        }

        return _publishSelfStatus()
            .catch(error => { _advisor.emit('error', error); })
            .finally(() => {
                // use `setTimeout` instead of `setInterval` in case getting
                // self status takes any significant amount of time
                if (_reporting && _reportInterval) {
                    _reportTimer = setTimeout(_handleReportIntervalTick, _reportInterval);
                }
            });
    };

    /**
     * `this.update()` can be called at any time to force an update
     */
    this.update = () => {
        return Promise.all([
            _publishSelfStatus(),
            _fetchPeerStatuses()
        ]);
    };

    this.startAdvising = () => {
        if (_advising) {
            return;
        }

        if (_adviceInterval) {
            _advising = true;
            _handleAdviceIntervalTick();
        }
    };

    this.startReporting = () => {
        if (_reporting) {
            return;
        }

        if (_reportInterval) {
            _reporting = true;
            _handleReportIntervalTick();
        }
    };

    /* public functions */
    this.start = function() {
        if (_adviceInterval) {
            this.startAdvising();
        }

        if (_reportInterval) {
            this.startReporting();
        }

        _storageStopped = false;

        return _storage.ready();
    };

    this.stopAdvising = () => {
        if (!_advising) {
            return;
        }

        _advising = false;

        if (_adviceTimer) {
            clearTimeout(_adviceTimer);
            _adviceTimer = null;
        }
    };

    this.stopReporting = () => {
        if (!_reporting) {
            return;
        }

        _reporting = false;

        if (_reportTimer) {
            clearTimeout(_reportTimer);
            _reportTimer = null;
        }
    };

    this.stop = function() {
        this.stopReporting();
        this.stopAdvising();

        if (_storageStopped) {
            return Promise.resolve();
        } else {
            _storageStopped = true;
            return _storage.stop();
        }
    };

    this.getSelfStatus = function() {
        return _selfStatus;
    };

    this.getPeerStatuses = function() {
        return _peerStatuses;
    };

    this.getAllStatuses = function() {
        return _peerStatuses.concat(_selfStatus);
    };

    this.getSelfName = function() {
        return _selfName;
    };

    //on demand function for getting advice
    this.getAdvice = function() {
        return this.update().then(_getCurrentAdvice);
    };

    /**
     * Convenience method that can be used to find the least utilized
     * instance on demand.
     *
     * @return {Promise<Status>}
     */
    this.getLeastUtilizedTarget = (forceUpdate) => {
        let statuses = this.getAllStatuses().filter((status) => {
            return _isTargetHealthy(status);
        });

        if (statuses.length === 0) {
            // we can always return ourself (not great but better than
            // throwing error?)
            return _selfStatus;
        } else {
            statuses.sort(statusValueSorter);
            return statuses[0];
        }
    };

    /* private functions */
    function _publishSelfStatus(){
        return _getSelfStatus()
            .then((statusParameters) => {
                let status = new Status(statusParameters);
                status.validate();

                // put address of this instance into status
                status.address = _selfAddress;

                // put name of this instance into status
                status.name = _selfName;

                // record our current timestamp in status
                status.timestamp = Date.now();

                if (_storageStopped) {
                    return Promise.resolve(status);
                } else {
                    return _storage.publishSelfStatus(status);
                }
            });
    }

    function _fetchPeerStatuses(){
        if (_storageStopped) {
            return Promise.resolve([]);
        }

        return _storage.getPeerStatuses().tap(function(peerStatuses) {
            peerStatuses.forEach((status) => {
                if (status == null) {
                    throw new Error('peer status is null');
                }
            });
            _peerStatuses = peerStatuses;
        });
    }

    function _isTargetHealthy(target) {
        if (target.maxCapacity === 0) {
            return false;
        }

        if (_healthyThreshold) {
            let timeDiff = Math.abs(Date.now() - target.timestamp);
            if (timeDiff > _healthyThreshold) {
                // skip this instance because it appears unhealthy
                // according to the constraints we were given
                return false;
            }
        }

        return true;
    }

    function _getCurrentAdvice() {
        // Use the last fetched value for self status
        let selfStatus = _selfStatus;

        // Use the last fetched value for peer status
        let peerStatuses = _peerStatuses;

        if (!peerStatuses || !peerStatuses.length) {
            // Return a `targets` array that only contains `selfStatus`
            // (since `peerStatuses` is empty)
            return new Advice({
                // no changes since we have no peers
                changes: [],

                // Since we are the only instance reporting status
                // our `value` is the average which means that the
                // `meanDelta` is `0`
                meanDelta: 0
            });
        }

        // The lowest `value` among _all_ instances
        let minValue;

        // The highest `value` among _all_ instances
        let maxValue;

        // `Status` of _peer_ associated with highest number of connections
        let maxPeerStatus = null;

        // `Status` of _peer_ associated with lowest number of connections
        let minPeerStatus = null;

        // The sum of the `value` property across _all_ instances
        let sum;

        // Number of instances that have `maxCapacity` greater than 0.
        // We ignore instances that have `maxCapacity` of 0 because these
        // instances are out-of-service for some reason.
        let numInstances = 1;

        // Initialize `sum`, `minValue`, and `maxValue` to `value` for
        // this instance in the cluster
        sum = minValue = maxValue = selfStatus.value;

        peerStatuses.forEach(function(status) {
            // ignore instances that are "out-of-service"
            if (!_isTargetHealthy(status)) {
                return;
            }

            let value = status.value;
            if (value > maxValue) {
                maxValue = value;
                maxPeerStatus = status;
            } else if (maxPeerStatus === null) {
                maxPeerStatus = status;
            }

            if (value < minValue) {
                minPeerStatus = status;
                minValue = value;
            } else if (minPeerStatus === null) {
                minPeerStatus = status;
            }

            sum += value;
            numInstances++;
        });

        let changes = [];

        // The `mean` is the average of the `value` property across all statuses
        let mean = sum / numInstances;

        // Is there a peer instance with a connection count lower than ours?
        if (minPeerStatus) {
            // The `range` is the difference between the highest `value` and
            // the lowest `value` among the statuses that have been reported.
            let range = maxValue - minValue;

            if (range > _precision && selfStatus.value > mean) {
                let delta = 0 - _stepSize;
                changes.push(new Change(delta, minPeerStatus));
            }
        }

        return new Advice({
            // The advice provides a `delta` which is a negative number.
            // The `Change` object will negate this value and make it available
            // as the `reduction` property.
            changes: changes,

            // The `meanDelta` is extra information that we provide
            meanDelta: selfStatus.value - mean
        });
    }

    // If there are any intervals provided then start those...
    this.start();
}

util.inherits(Advisor, EventEmitter);

module.exports = Advisor;

'use strict';

const assert = require('assert');

function Status(parameters) {
    /**
     * The current capacity of the instance (e.g. number of connections)
     * @type {Number}
     */
    this.value = parameters.value;

    /**
     * The address that other instances can use to find this instance
     * (e.g. a domain name such "instance1.myservice.com")
     * @type {String}
     */
    this.address = parameters.address;

    /**
     * A unique name for the instance (e.g. a UUID)
     * @type {String}
     */
    this.name = parameters.name;

    /**
     * The maximum capacity of the instance.
     *
     * `0` is used to indicate that the service is not accepting new connections.
     *
     * When looking for the least utilized instance, if the current `value`
     * is greater than or equal to `maxCapacity` then this instance will not
     * be used.
     *
     * If `null` or `undefined` is provided then this means that the instance
     * has no upper bound for capacity.
     *
     * @type {Number}
     */
    this.maxCapacity = parameters.maxCapacity;

    /**
     * The `timestamp` property is used to keep track of the time at which
     * the instance reported its status (according to the clock of the
     * instance). This value is the number of milliseconds elapsed since
     * `1 January 1970 00:00:00 UTC`.
     *
     * @type {Number}
     */
    this.timestamp = parameters.timestamp;
}

Status.prototype.validate = function() {
    try {
        assert(typeof this.value === 'number', 'a value must be provided');
    } catch (error) {
        console.error(error);
        console.error(this);
    }
    return this;
};

Status.prototype.serialize = function() {
    return JSON.stringify(this);
};

Status.deserialize = function(serialized) {
    try {
        return new Status(JSON.parse(serialized));
    } catch (cause) {
        let err = new Error('Failed to parse status');
        err.cause = cause;
        console.error(serialized.toString(), cause);
        throw err;
    }
};

module.exports = Status;

'use strict';

function Advice(parameters) {
    /**
     * The `changes` property is an array of `Change` operations that
     * describe the proposed changes (if any)
     *
     * @type {Array<Change>}
     */
    this.changes = parameters.changes;

    /**
     * The `meanDelta` is the difference between the `value` reported by
     * this instance and the average `value` across all in-service instances.
     *
     * @type {Number}
     */
    this.meanDelta = parameters.meanDelta;
}

module.exports = Advice;

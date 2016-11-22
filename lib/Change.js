'use strict';

function Change(delta, target) {
    /**
     * The `delta` describes the proposed change. If the value of `delta`
     * is negative then this is the number of connections that should be
     * redirected to the given `target`.
     *
     * @type {Number}
     */
    this.delta = delta;

    /**
     * The `reduction` will be a positive number which is the number of
     * connections that should be redirected to the given `target`.
     * If the value is `0` then no connections should be redirected.
     *
     * @type {Number}
     */
    this.reduction = (delta < 0) ? 0 - delta : 0;

    /**
     * The target instance to which connections should be redirected.
     * The value will be a `Status` object.
     *
     * @type {Status}
     */
    this.target = target;
}

module.exports = Change;
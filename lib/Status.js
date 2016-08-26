'use strict';

const assert = require('assert');

function Status(parameters) {
    this.value = parameters.value;
    this.address = parameters.address;
    this.name = parameters.name;
}

Status.prototype.validate = function() {
    try {
        assert(typeof this.value === 'number', 'a value must be provided');
        assert(this.address, 'a server address must be provided');
        assert(this.name, 'a server name must be provided');
    } catch (error) {
        console.error(error);
        console.error(this);
    }
    return this;
};

Status.prototype.serialize = function() {
    return JSON.stringify({
        value: this.value,
        address: this.address,
        name: this.name
    });
};

Status.deserialize = function(serial) {
    try {
        let status = new Status(JSON.parse(serial));
        status.validate();
        return status;
    } catch (cause) {
        let err = new Error('Failed to parse status');
        err.cause = cause;
        console.error(serial.toString(), cause);
        throw err;
    }
};

module.exports = Status;

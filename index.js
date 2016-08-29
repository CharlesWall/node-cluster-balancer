'use strict';

const Advisor = require('./lib/Advisor');


function _createAdvisor(options) {
    return new Advisor(options);
}

module.exports = {
    createAdvisor: _createAdvisor,
    intervals: {
        HYPER_REALTIME: 100,
        REALTIME: 1000,
        ACTIVE: 5000,
        PASSIVE: 30000,
        GLACIAL: 60000
    },
    precisions: {
        HIGH: 5,
        NORMAL: 10,
        LOW: 50
    },
    stepSizes: {
        // AUTO: -1, //TODO
        LARGE: 5,
        MEDIUM: 2,
        SMALL: 1
    }
};

'use strict';

const BluebirdPromise = require('bluebird');
global.Promise = BluebirdPromise;
BluebirdPromise.config({
    warnings: true,
    longStackTraces: true,
    cancellation: true,
    monitoring: true
});

require('mocha/bin/_mocha');
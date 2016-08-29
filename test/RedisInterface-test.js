'use strict';

const Promise = require('bluebird');
const uuid = require('uuid');
const RedisInterface = require('../lib/RedisInterface');
const ClusterBalancer = require('..');

const REDIS_URL = '127.0.0.1:6379';

describe('RedisInterface', () => {
    //run the standard interface test
    require('./DbInterface-test')(function createRedisInterface(options) {
        options = options || {};
        return new Promise((resolve, reject) => {
            let redisInterface = new RedisInterface({
                clusterName: options.clusterName,
                selfName: options.selfName || uuid.v4(),
                url: REDIS_URL
            });
            redisInterface.on('connected', () => {
                resolve(redisInterface);
            });
        });
    });

    require('./simulations/clusterBalancing-test')({
        redis: { url: REDIS_URL },
        clusterName: uuid.v4(),
        interval: ClusterBalancer.intervals.HYPER_REALTIME,
        precision: ClusterBalancer.precisions.HIGH,
        stepSize: ClusterBalancer.stepSizes.MEDIUM
    });
});

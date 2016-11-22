'use strict';

const Redis = require('ioredis');
const uuid = require('uuid');
const ClusterBalancer = require('..');

describe('ioredis-test', () => {
    //run the standard interface test
    let storageFactory = function(options) {
        options = options || {};
        let redis = new Redis(6379, '127.0.0.1');
        let ioredisStorage = require('../lib/storage/ioredis').create({
            clusterName: options.clusterName,
            selfName: options.selfName || uuid.v4(),
            redis: redis
        });

        return ioredisStorage;
    };

    require('./lib/createStorageTestSuite')(storageFactory);

    require('./simulations/createClusterBalancerTestSuite')({
        storage: {
            type: 'ioredis',
            // use URL for this test
            url: '127.0.0.1:6379'
        },
        clusterName: uuid.v4(),
        interval: ClusterBalancer.intervals.HYPER_REALTIME,
        precision: ClusterBalancer.precisions.HIGH,
        stepSize: ClusterBalancer.stepSizes.MEDIUM
    });
});

'use strict';

const uuid = require('uuid');
const ClusterBalancer = require('..');

const ZOOKEEPER_URL = '127.0.0.1:2181';

describe('zookeeper-test', () => {
    let storageFactory = function(options) {
        options = options || {};
        return require('../lib/storage/zookeeper').create({
            clusterName: options.clusterName,
            selfName: options.selfName || uuid.v4(),
            url: ZOOKEEPER_URL
        });
    };

    //run the standard interface test
    require('./lib/createStorageTestSuite')(storageFactory);

    require('./simulations/createClusterBalancerTestSuite')({
        storage: {
            type: 'zookeeper',
            url: ZOOKEEPER_URL
        },
        clusterName: uuid.v4(),
        interval: ClusterBalancer.intervals.HYPER_REALTIME,
        precision: ClusterBalancer.precisions.HIGH,
        stepSize: ClusterBalancer.stepSizes.MEDIUM
    });
});

'use strict';

const ZookeeperInterface = require('../lib/ZookeeperInterface');
const uuid = require('uuid');
const Promise = require('bluebird');
const Advisor = require('..');

const ZOOKEEPER_URL = '127.0.0.1:2181';

describe('ZookeeperInterface', () => {
    function createZookeeperInterface(options) {
        options = options || {};
        return new Promise((resolve, reject) => {
            let zookeeperInterface = new ZookeeperInterface({
                clusterName: options.clusterName,
                selfName: options.selfName || uuid.v4(),
                url: ZOOKEEPER_URL
            });
            zookeeperInterface.on('connected', () => {
                resolve(zookeeperInterface);
            });
        });
    }

    //run the standard interface test
    require('./DbInterface-test')(createZookeeperInterface);

    require('./simulations/clusterBalancing-test')({
        zookeeper: { url: ZOOKEEPER_URL },
        clusterName: uuid.v4(),
        interval: Advisor.intervals.HYPER_REALTIME,
        precision: Advisor.precisions.HIGH,
        stepSize: Advisor.stepSizes.MEDIUM
    });
});

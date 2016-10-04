'use strict';

const proxyquire = require('proxyquire');
const {expect} = require('chai');
const uuid = require('uuid');
const Promise = require('bluebird');
const util = require('util');
const {EventEmitter} = require('events');

const Status = require('../lib/Status');

describe('Advisor', function() {
    function testScenario(scenario, expectations) {
        let mockDbInterface = null;

        let MockDbInterface = function(options) {
            mockDbInterface = this;

            this.options = options;

            this.getPeerStatuses = function() {
                return Promise.resolve(scenario.peerStatuses);
            };
            this.publishSelfStatus = function(status) {
                return Promise.resolve(status);
            };

            setImmediate(() => {
                mockDbInterface.emit('ready', mockDbInterface);
            });
        };

        util.inherits(MockDbInterface, EventEmitter);

        const Advisor = proxyquire('../lib/Advisor', {
            './RedisInterface': MockDbInterface,
            './ZookeeperInterface': MockDbInterface
        });


        scenario.advisorOptions.getSelfStatus = function() {
            return Promise.resolve(scenario.selfStatus);
        };

        let advisor = new Advisor(scenario.advisorOptions);

        return new Promise((resolve, reject) => {
            advisor.once('advice', advice => {
                resolve(advice);
            });
        });
    }

    function createStatus(value) {
        return new Status({
            name: uuid.v4(),
            address: uuid.v4(),
            value: value
        });
    }

    function createPeerStatuses(values) {
        return values.map(createStatus);
    }

    function createScenario(options) {
        options = options || {};
        return {
            advisorOptions: options.advisorOptions || {
                zookeeper: { url: 'localhost:2181' },
                clusterName: uuid.v4(),
                interval: 10,
                stepSize: 1
            },
            peerStatuses: options.peerStatuses || [],
            selfStatus: options.selfStatus || new Status({
                value: 100,
                name: uuid.v4(),
                address: uuid.v4()
            })
        };
    }

    context('when there are no peers', function() {
        it('should give no change', function() {
            let scenario = createScenario({});
            return testScenario(scenario).then(advice => {
                expect(advice.change).to.equal(0);
            });
        });
    });
    context('when there are peers', function() {
        context('when the maximum disparity is within the threshold', function() {
            context('when the local instance has a higher value that the mean', function() {
                it('should advise not advise', function() {
                    return testScenario(createScenario({
                        peerStatuses: createPeerStatuses([20, 19, 21]),
                        selfStatus: createStatus(22)
                    })).then(advice => {
                        expect(advice.change).to.equal(0);
                    });
                });
            });
            context('when the local instance has less that the mean', function() {
                it('should advise not change', function() {
                    return testScenario(createScenario({
                        peerStatuses: createPeerStatuses([20, 22, 21]),
                        selfStatus: createStatus(19)
                    })).then(advice => {
                        expect(advice.change).to.equal(0);
                    });
                });
            });
        });

        context('when the maximum disparity exceeds the threshold', function() {
            context('when the local instance has a higher value that the mean', function() {
                it('should advise a stepSize change', function() {
                    return testScenario(createScenario({
                        peerStatuses: createPeerStatuses([20, 22, 21]),
                        selfStatus: createStatus(100)
                    })).then(advice => {
                        expect(advice.change).to.equal(-1);
                        expect(advice.reduction).to.equal(1);
                    });
                });
            });
            context('when the local instance has less that the mean', function() {
                it('should advise no change', function() {
                    return testScenario(createScenario({
                        peerStatuses: createPeerStatuses([5, 22, 21]),
                        selfStatus: createStatus(6)
                    })).then(advice => {
                        expect(advice.change).to.equal(0);
                    });
                });
            });
        });
    });
});

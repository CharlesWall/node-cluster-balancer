'use strict';

const {expect} = require('chai');
const uuid = require('uuid');
const Status = require('../lib/Status');
const Advisor = require('../lib/Advisor');

function MockStorage(options) {
    let _peerStatuses = options.peerStatuses || [];

    this.getPeerStatuses = function() {
        return Promise.resolve(_peerStatuses);
    };
    this.publishSelfStatus = function(status) {
        return Promise.resolve(status);
    };

    this.ready = function() {
        return Promise.resolve();
    };
}

describe('Advisor', function() {
    function testScenario(scenario) {
        scenario.advisorOptions.getSelfStatus = function() {
            return Promise.resolve(scenario.selfStatus);
        };

        let advisor = new Advisor(scenario.advisorOptions);

        return advisor.getAdvice();
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
                storage: new MockStorage({
                    peerStatuses: options.peerStatuses
                }),
                clusterName: uuid.v4(),
                interval: 0,
                stepSize: 1
            },
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
                expect(advice.changes.length).to.equal(0);
            });
        });
    });
    context('when there are peers', function() {
        context('when the maximum disparity is within the threshold', function() {
            context('when the local instance has a higher value than the mean', function() {
                it('should advise not advise', function() {
                    return testScenario(createScenario({
                        peerStatuses: createPeerStatuses([20, 19, 21]),
                        selfStatus: createStatus(22)
                    })).then(advice => {
                        expect(advice.changes.length).to.equal(0);
                    });
                });
            });
            context('when the local instance has less than the mean', function() {
                it('should advise not change', function() {
                    return testScenario(createScenario({
                        peerStatuses: createPeerStatuses([20, 22, 21]),
                        selfStatus: createStatus(19)
                    })).then(advice => {
                        expect(advice.changes.length).to.equal(0);
                    });
                });
            });
        });

        context('when the maximum disparity exceeds the threshold', function() {
            context('when the local instance has a higher value than the mean', function() {
                it('should advise a stepSize change', function() {
                    return testScenario(createScenario({
                        peerStatuses: createPeerStatuses([20, 22, 21]),
                        selfStatus: createStatus(100)
                    })).then(advice => {
                        expect(advice.changes[0].delta).to.equal(-1);
                        expect(advice.changes[0].reduction).to.equal(1);
                    });
                });
            });
            context('when the local instance has less than the mean', function() {
                it('should advise no change', function() {
                    return testScenario(createScenario({
                        peerStatuses: createPeerStatuses([5, 22, 21]),
                        selfStatus: createStatus(6)
                    })).then(advice => {
                        expect(advice.changes.length).to.equal(0);
                    });
                });
            });
        });
    });

    it('should allow on-demand requests of statuses', function() {
        let selfValue = 10;

        let advisor = new Advisor({
            selfName: 'a0',
            interval: 0,

            getSelfStatus() {
                return selfValue++;
            },

            storage: new MockStorage({
                peerStatuses: [
                    new Status({
                        name: 'a1',
                        value: 1
                    }),

                    new Status({
                        name: 'a2',
                        value: 2
                    }),

                    new Status({
                        name: 'a3',
                        value: 3
                    })
                ]
            })
        });

        return advisor.ready().then(() => {
            return advisor.update();
        }).then(() => {
            let statuses = advisor.getAllStatuses();
            statuses.sort((s1, s2) => {
                return s1.name.localeCompare(s2.name);
            });

            statuses = statuses.map((status) => {
                return {
                    name: status.name,
                    value: status.value
                };
            });

            expect(statuses).to.deep.equal([
                {
                    name: 'a0',
                    value: 10
                },
                {
                    name: 'a1',
                    value: 1
                },
                {
                    name: 'a2',
                    value: 2
                },
                {
                    name: 'a3',
                    value: 3
                }
            ]);

            return advisor.update();
        }).then(() => {
            let statuses = advisor.getAllStatuses();
            statuses.sort((s1, s2) => {
                return s1.name.localeCompare(s2.name);
            });

            statuses = statuses.map((status) => {
                return {
                    name: status.name,
                    value: status.value
                };
            });

            expect(statuses).to.deep.equal([
                {
                    name: 'a0',
                    value: 11
                },
                {
                    name: 'a1',
                    value: 1
                },
                {
                    name: 'a2',
                    value: 2
                },
                {
                    name: 'a3',
                    value: 3
                }
            ]);
        });
    });

    it('should allow finding least utilized target', function() {
        let selfValue = 10;

        let advisor = new Advisor({
            selfName: 'a0',
            interval: 0,
            healthyThreshold: 1000,

            getSelfStatus() {
                return selfValue++;
            },

            storage: new MockStorage({
                peerStatuses: [
                    // this instance is unhealthy because its timestamp
                    // compared to now will be higher than allowed threshold
                    new Status({
                        name: 'a1',
                        value: 1,
                        timestamp: Date.now() - 1500
                    }),

                    // this instance is out-of-service because `maxCapacity` is 0
                    new Status({
                        name: 'a2',
                        value: 2,
                        timestamp: Date.now() - 500,
                        maxCapacity: 0

                    }),

                    // this instance is healthy
                    new Status({
                        name: 'a3',
                        value: 3,
                        timestamp: Date.now() - 100,
                    }),

                    // this instance is healthy
                    new Status({
                        name: 'a4',
                        value: 1,
                        timestamp: Date.now() - 500,
                    })
                ]
            })
        });

        return advisor.ready().then(() => {
            return advisor.update();
        }).then(() => {
            let target = advisor.getLeastUtilizedTarget();
            expect({
                name: target.name,
                value: target.value
            }).to.deep.equal({
                name: 'a4',
                value: 1
            });
        });
    });
});

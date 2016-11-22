'use strict';

const uuid = require('uuid');
const ClusterBalancer = require('../..');
const Promise = require('bluebird');

module.exports = function(advisorOptions) {
    describe('simulations', () => {
        let test;

        function createAdvisor(options, getSelfStatus) {
            options.getSelfStatus = getSelfStatus;

            let advisor = ClusterBalancer.createAdvisor(options);
            test.advisors.push(advisor);
            return advisor.ready();
        }

        function createAdvisors(inintialValues) {
            let clusterName = uuid.v4();
            return Promise.map(inintialValues, initialValue => {
                let options = Object.assign({}, advisorOptions);
                let selfName = options.selfName = uuid.v4();
                options.selfAddress = uuid.v4();

                options.clusterName = clusterName;

                let values = test.values;
                values[selfName] = initialValue;

                return createAdvisor(options, () => {
                    return {
                        value: values[selfName]
                    };
                });
            });
        }

        beforeEach(function() {
            test = {};
            test.advisors = [];
            test.clusterName = uuid.v4();
            test.values = {};
            this.timeout(10000);
        });

        afterEach(() => {
            return Promise.map(test.advisors, advisor => {
                return advisor.stop();
            });
        });

        function logValues(values) {
            // console.log();
            // for (let advisorName in values) {
            //     let value = values[advisorName];
            //     console.log(`  ${advisorName} : ${value}`);
            // }
        }

        function executeAdvice(options) {
            let {advisor, advice, values} = options;

            if ((advice == null) || !advice.changes.length) {
                return;
            }

            let change = advice.changes[0];

            let advisorName = advisor.getSelfName();
            let targetName;
            if (test.targetedReconnection) {
                targetName = change.target.name;
            } else {
                targetName = chooseRandom(Object.keys(values));
            }
            values[advisorName] += change.delta;
            values[targetName] -= change.delta;
            logValues(values);
        }

        function checkIfBalanced(values, threshold) {
            let min;
            let max;
            for (let prop in values) {
                let value = values[prop];

                if (max == null || value > max ) {
                    max = value;
                }
                if (min == null || value < min) {
                    min = value;
                }
            }
            let result = (max - min) <= threshold;
            if (result) {
                logValues(values);
            }
            return result;
        }

        function chooseRandom(array) {
            var index = Math.floor(Math.random() * array.length);
            return array[index];
        }

        function assertEventuallyBalances(advisors, options) {
            return new Promise((resolve, reject) => {
                setTimeout(() => {
                    reject(new Error('did not balance in time'));
                }, 20000);

                advisors.forEach(advisor => {
                    advisor.on('advice', advice => {
                        executeAdvice({
                            advisor: advisor,
                            targetedReconnection: options.targetedReconnection,
                            advice: advice,
                            values: options.values
                        });
                        if (checkIfBalanced(test.values, advisorOptions.precision)) {
                            advisors.forEach(advisor => {
                                advisor.removeAllListeners('advice');
                            });
                            resolve();
                        }
                    });
                });
            });
        }

        function testScenarios() {
            context ('unbalanced cluster', function() {
                it('should send connections to new instances', function() {
                    this.timeout(20000);
                    // similar to after deploying new instances
                    let initialPeerValues = [25, 26, 25, 25, 26, 25, 25, 0, 0];

                    return createAdvisors(initialPeerValues).then(advisors => {
                        return assertEventuallyBalances(advisors, {
                            targeted: test.targetedReconnection,
                            values: test.values
                        });
                    });
                });

                it('should send connections away from over populated instances', function() {
                    this.timeout(20000);
                    // similar to after deploying new instances
                    let initialPeerValues = [25, 26, 25, 25, 26, 25, 25, 50];
                    return createAdvisors(initialPeerValues).then(advisors => {
                        return assertEventuallyBalances(advisors, {
                            targeted: test.targetedReconnection,
                            values: test.values
                        });
                    });
                });
            });
        }

        describe('targetedReconnection', () => {
            beforeEach(() => { test.targetedReconnection = true; });
            testScenarios();
        });

        describe('randomReconnection', () => {
            beforeEach(() => { test.targetedReconnection = false; });
            testScenarios();
        });
    });
};

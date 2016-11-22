'use strict';

const uuid = require('uuid');
const {expect} = require('chai');
const Promise = require('bluebird');

module.exports = function(_createDbInterface) {
    describe('DbInterface-test', () => {
        let clusterName = null;
        let selfName = null;
        let createdInterfaces;

        function createDbInterface(options) {
            //hijack the creation of interfaces so we can close them all when the
            //test completes
            return Promise.resolve(_createDbInterface(options)).tap(dbInterface => {
                createdInterfaces.push(dbInterface);
            });
        }
        const createPeerInterfaces = require('../lib/createPeerInterfaces')(createDbInterface);

        beforeEach(() => {
            clusterName = uuid.v4();
            createdInterfaces = [];
        });

        const closeDbInterface = dbInterface => {
            return dbInterface.stop().catch((error) => { /* Don't care... */ });
        };

        afterEach(() => {
            return Promise.map(createdInterfaces, closeDbInterface);
        });

        describe('DbInterface test', function() {
            describe('publishSelfStatus / getPeerStatuses', function() {
                it('should return no peer statuses if there are no peers connected', function() {
                    clusterName = uuid.v4();
                    selfName = uuid.v4();
                    return createDbInterface({
                        clusterName: clusterName,
                        selfName: selfName
                    }).then((dbInterface) => {
                        return dbInterface.getPeerStatuses().then(peerStatuses => {
                            expect(peerStatuses.length).to.equal(0);
                        });
                    });
                });

                it('should return the statuses of all peers', function() {
                    let peerValues = [10, 20, 15, 12];
                    clusterName = uuid.v4();
                    selfName = uuid.v4();
                    return createPeerInterfaces(peerValues, clusterName).then(() => {
                        return createDbInterface({
                            clusterName: clusterName,
                            selfName: selfName
                        });
                    }).then(dbInterface => {
                        return dbInterface.getPeerStatuses();
                    }).then(peerStatuses => {
                        peerValues.forEach(expectedPeerValue => {
                            let peerStatus = peerStatuses.find(peerStatus => {
                                return peerStatus && (peerStatus.value === expectedPeerValue);
                            });
                            expect(peerStatus).to.exist;
                        });
                    });
                });
            });

            describe('unplanned termination or loss of connection', function() {
                it('should identify instances that have gone missing and remove them from results');
            });

            describe('close', function() {
                it('should remove the closed instance from view of the rest of the cluster', () => {
                    let peerValues = [10, 20, 30, 40, 50, 60];

                    return createPeerInterfaces(peerValues, clusterName)
                        .then(dbInterfaces => {
                            let lastDbInterface = dbInterfaces.pop();

                            return (function verifyInstanceRemoval() {
                                return dbInterfaces.shift().stop().then(() => {
                                    return lastDbInterface.getPeerStatuses();
                                }).then(peerStatuses => {
                                    expect(peerStatuses.length).to.equal(dbInterfaces.length);
                                    if(dbInterfaces.length) {
                                        return verifyInstanceRemoval();
                                    }
                                });
                            })();
                        });
                });
            });

        });
    });

};

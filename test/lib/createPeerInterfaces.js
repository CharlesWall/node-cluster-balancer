'use strict';

const uuid = require('uuid');
const Status = require('../../lib/Status');

module.exports = function(createDbInterface) {
    function createPeerInterface(options) {
        let peerName = options.selfName || uuid.v4();
        let peerInterface;

        return createDbInterface({
            selfName: peerName,
            clusterName: options.clusterName
        }).then(dbInterface => {
            peerInterface = dbInterface;
            return dbInterface.publishSelfStatus(new Status({
                value: options.value,
                address: options.address || uuid.v4(),
                name: peerName
            }));
        }).then(() => { return peerInterface; });
    }

    function createPeerInterfaces(values, clusterName) {
        let promise = Promise.resolve();
        let dbInterfaces = [];
        values.forEach(function(value, i) {
            let selfName = 'peer' + i;

            promise = promise.then(() => {
                return createPeerInterface({
                    value: value,
                    selfName: selfName,
                    clusterName: clusterName
                }).then(dbInterface => {
                    dbInterfaces.push(dbInterface);
                });
            });
        });

        return promise.then(() => { return dbInterfaces; });
    }

    return createPeerInterfaces;
};

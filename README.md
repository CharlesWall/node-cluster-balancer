cluster-balancer
=====================
This module is used to orchestrate how connections should be best distributed in a clustered environment when each instance in the cluster can receive direct connections.

It is used primarily to answer these two questions:

- When a new client needs to connect, which instance should receive the connection?
- How many client connections should an instance redirect and to where if there is an uneven distribution of connections?

While flexible, this module was specifically developed to handle evenly distributing WebSocket connections throughout instances in a clustered environment. In this scenario, each instance in the cluster can receive direct WebSocket connections. To make routing more intelligent, each instance periodically reports its _status_ which includes its current number of connections. When a new client wishes to establish a WebSocket connection, a pre-connection request is made to find the _least utilized_ instance which will become the target for the WebSocket connection. Also, periodically, each instance will check to see if there is an imbalance in the distribution of connections and slowly redirect existing connections to other instances that are under-utilized.

# Prerequisites

This module should be used with versions of **Node.js** that support modern JavaScript features such as:

- `let` / `const`
- Function arrow notation (e.g. `(blah) => { /* do something */ }`)
- Destructuring (e.g. `let {blah} = options`)

This module does not get published with a transpiled version of the source files.

# Installation

```bash
npm install cluster-balancer@latest --save
```

# Usage

Create an instance of an _advisor_ that will periodically report status and
also receive advice about when to redirect existing client connections.

```javascript
let clusterAdvisor = require('cluster-balancer').createAdvisor({
    // The interval (in milliseconds) at which we will publish our status
    reportInterval: 100,

    // The interval (in milliseconds) at which we will emit `advice` events
    adviceInterval: 100,

    // The `precision` property is used to describe the threshold at
    // which corrective measures will be made when redistributing clients.
    // As this value gets closer to `0` there will be more churn of client
    // connections as the cluster tries to maintain _perfect_ balance.
    // It is better to not anything lower than 2 because there is typically
    // no need for perfect distribution of connections.
    precision: 3,

    // The maximum number of clients to redirect in one iteration
    stepSize: 1,

    // The `healthyThreshold` value describes the tolerance for determining
    // if an instance is healthy when looking at its last reported timestamp.
    // When examining the statuses reported by each peer, we find the
    // difference of `Date.now()` and the status `timestamp` and if it is
    // above the `healthyThreshold` then we assume that the peer instance
    // is not healthy. This value needs to tolerate clock skew because
    // we are comparing timestamps reported by two different machines.
    healthyThreshold: 2000,

    // You must provide a unique name to the cluster which will
    // be used to uniquely scope the statuses reported by instances
    // within this cluster.
    clusterName: 'my-cluster',

    // A unique name of this instance that is using the advisor
    selfName: 'server1',

    // The address of this instance
    selfAddress: 'server1.myservice.com',

    // The storage mechanism (Redis in this example)
    storage: {
        // Use `ioredis` client that will store state information in Redis
        type: 'ioredis',

        // An existing `ioredis` instance of type `Redis` or `Redis.Cluster`
        redis: ioredisClient,

        // The amount of time
        statusTTL: 60 * 1000 /* 6 seconds */
    },

    // Instances must implement `getSelfStatus` method which will be invoked
    // periodically to get the latest status for _this_ instance
    getSelfStatus: () => {
        return {
            // The current number of connections for this instance
            value: numConnections,

            // `null` indicates unbounded capacity.
            // `0` indicates that instance is out-of-service.
            // Positive number indicates that instance has a max capacity.
            maxCapacity: null
        };
    }
});

// The process will receive advice at the interval defined above which
// describes how many clients connected to this instance should be
// directed to different targets.
clusterAdvisor.on('advice', (advice) => {
    advice.changes.forEach((change) => {
        // redirect `change.reduction` connections to `change.target.address`
    });
});

// Error handling
clusterAdvisor.on('error', (err) => {
    console.error('cluster-balancer advisor error.', (err.stack || err));
});
```

In addition to the **Redis** storage mechanism, **Apache ZooKeeper** can also be used via the following:

```javascript
storage: {
    type: 'zookeeper',
    url: '127.0.0.1:2181'
}
```

The `Status` type is used to keep track of a status and contains the following:

- `value`: The number of connections
- `address`: The address of instance
- `name`: The name of instance
- `maxCapacity`: The maximum capacity of instance
- `timestamp`: The timestamp of instance

You can also get on-demand access to the status of the cluster via:

```javascript
let allStatuses = clusterAdvisor.getAllStatuses();
// `allStatuses` will be an an array of `Status` objects
```

Similarly, you can also get the statuses of all peer instances:

```javascript
let peerStatuses = clusterAdvisor.getPeerStatuses();
// `peerStatuses` will be an array of `Status` objects
```

If you just want the least utilized target, then you can use
the following:

```javascript
let target = clusterAdvisor.getLeastUtilizedTarget();
// `target` is the `Status` as reported by the least utilized instance
```
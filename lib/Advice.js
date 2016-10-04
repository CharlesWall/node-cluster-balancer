'use strict';

module.exports = function Advice(parameters) {
    this.change = parameters.change;
    this.targets = parameters.targets;
    this.meanDelta = parameters.meanDelta;
    this.reduction = parameters.reduction;
};

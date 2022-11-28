let inputConfig = require('./inputConfig');
let toDriverMapping = Object.assign(inputConfig.toDriverMapping.expectedEvents, inputConfig.toDriverMapping.expectedCommands);
let fromDriverMapping = Object.assign(inputConfig.fromDriverMapping.requiredMapping, inputConfig.fromDriverMapping.optionalMapping);

let EventEmitter = require('events').EventEmitter;
let serverEmitter = new EventEmitter;

let driverEmitter = require('./' + inputConfig.driver)(Object.keys(inputConfig.fromDriverMapping.optionalMapping), Object.values(toDriverMapping));
// Help class to process driver data to server needed data.
let preprocessor = require('./' + inputConfig.controller);

// Preprocessing data from driver (driverEmitter) to server (serverEmitter).
for (let driverEvent in fromDriverMapping) {
  driverEmitter.from.on(driverEvent, function (data, backCallback) {
    serverEmitter.emit(
        fromDriverMapping[driverEvent],
        preprocessor.handleDriverData(driverEvent, data),
        backCallback
      );
    });
}

// Preprocessing data from server (serverEmitter) to driver (driverEmitter).
for (let event in toDriverMapping) {
  serverEmitter.on(event, function (data) {
    driverEmitter.to.emit(
      toDriverMapping[event],
      preprocessor.handleServerData(toDriverMapping[event], data),
    );
  });
}

module.exports = serverEmitter;

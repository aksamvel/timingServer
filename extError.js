// Input emitter.
let input = require('./input/inputMiddleware');

// Callbacks to backend.
let callbacks = require('./callbacks');

let Logger = require('./Logger');

module.exports = class ExtError extends Error {
    constructor(code, type, message, context = null) {
        super();

        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, ExtError)
        }

        this.message = message;
        this.code = code;
        this.type = type;
        this.name = 'ExtError';
        this.context = context;
    }

    static handleErrors(error) {
        if (error.name === 'ExtError') {
            if (error.type === 'client_error' && error.context.socketId !== undefined) {
                input.emit('info', {
                    socketId : error.context.socketId,
                    data : {status : 'error', code : error.code, message : error.message}
                });
            }
        }
        Logger.logErrorMessage(error.stack, error.context);
    }
};

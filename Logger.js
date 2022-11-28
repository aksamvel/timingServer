// Callbacks to backend.
let callbacks = require('./callbacks');

module.exports = class Logger {

    static logErrorMessage(message, context = null) {
        let date = new Date();
        let formattedDate = date.getDate() + ' ' + (date.getMonth() + 1) + ' '
          + date.getFullYear() + ' ' + (date.getHours() + 7) + ':' + date.getMinutes()
          + ':' + date.getSeconds() + ':' + date.getMilliseconds();
        callbacks.slackLog(message, context);
        console.log(formattedDate + ' ' + message);
        if (context) {
            console.log('Context: ', context);
        }
    }

    static logDebugMessage(message, context = null, sendToSlack = false) {
        let date = new Date();
        let formattedDate = date.getDate() + ' ' + (date.getMonth() + 1) + ' '
          + date.getFullYear() + ' ' + (date.getHours() + 7) + ':' + date.getMinutes()
          + ':' + date.getSeconds() + ':' + date.getMilliseconds();
        if (sendToSlack) {
            callbacks.slackLog(message, context);
        }
        console.log(formattedDate + ' ' + message);
    }
};

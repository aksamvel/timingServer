// States.
const states = require('./states');

module.exports = class TimeOperation {
    constructor(event, id, timeCondition, data) {
        this.event = event;
        this.id = id;
        this.data = data;
        this.timeCondition = timeCondition;

    }

    checkTimeCondition () {
        let date = new Date();
        return (date >= this.timeCondition);
    }

    static addTimeOperationToGlobal (timeOp) {
        timeOperations.push(timeOp);
    }

    static removeTimeOperation (event, id) {
        if (timeOperations !== undefined) {
            timeOperations.forEach(function (timeOp, key, value) {
                if (timeOp.event === event && timeOp.id === id) {
                    delete timeOperations[key];
                }
            });
        }
    }
};
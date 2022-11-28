// Config variables
let config = require('./staticConfig');

/**
 * Get common round time in seconds.
 */
exports.commonRoundTime = function(battleCase) {
    if (battleCase !== undefined && battleCase.case_type !== undefined && battleCase.case_type.common_round_time !== undefined) {
        return battleCase.case_type.common_round_time;
    }
    return process.env.COMMON_ROUND_TIME;
};

exports.refereeingTime = function(battleCase) {
    if (battleCase !== undefined && battleCase.case_type !== undefined && battleCase.case_type.refereeing_time !== undefined) {
        return battleCase.case_type.refereeing_time;
    }
    return process.env.REFEREEING_TIME;
};


exports.breakTime = function(battleCase) {
    if (battleCase !== undefined && battleCase.case_type !== undefined && battleCase.case_type.break_time !== undefined) {
        return battleCase.case_type.break_time;
    }
    return process.env.BREAK_TIME;
};

exports.tossTime = function(battleCase) {
    if (battleCase !== undefined && battleCase.case_type !== undefined && battleCase.case_type.toss_time !== undefined) {
        return battleCase.case_type.toss_time;
    }
    return process.env.TOSS_TIME;
};

exports.joinTime = function(battleCase) {
    if (battleCase !== undefined && battleCase.case_type !== undefined && battleCase.case_type.join_time !== undefined) {
        return battleCase.case_type.join_time;
    }
    return process.env.JOIN_TIME;
};

exports.waitingTime = function(battleCase) {
    if (battleCase !== undefined && battleCase.case_type !== undefined && battleCase.case_type.preparing_time !== undefined) {
        return battleCase.case_type.preparing_time;
    }
    return process.env.WAITING_TIME;
};

exports.totalRounds = function(battleCase) {
    if (battleCase !== undefined && battleCase.case_type !== undefined && battleCase.case_type.total_rounds !== undefined
      && !isNaN(battleCase.case_type.total_rounds) && battleCase.case_type.total_rounds > 0) {
        return battleCase.case_type.total_rounds;
    }
    return process.env.TOTAL_ROUNDS;
};


// States.
const states = require('./states');

/**
 * Return all sockets in global users.
 * @param userId
 * @returns {*}
 */
exports.findSocketsInGlobalUsers = function(userId) {
  let sockets = [];
  for (let socketId in globalUsers) {
    if (globalUsers[socketId].userId === userId) {
      sockets.push(socketId);
    }
  }
  return sockets;
};

/**
 * Return all sockets in global users.
 * @param userId
 * @returns {*}
 */
exports.getActiveUserSocket = function(userId) {
  for (let socketId in globalUsers) {
    if (globalUsers[socketId].userId === userId && globalUsers[socketId].status === states.userState.ACTIVE) {
      return socketId;
    }
  }
};

/**
 * Return first founded user socket id, it can be disconnected user, if we search in global users.
 * @param userId
 * @param users
 * @returns {*}
 */
exports.findUserInUsers = function(userId, users) {
  for (let socketId in users) {
    if (users[socketId].userId === userId) {
      return socketId;
    }
  }
  return false;
};

/**
 * Mark some user as disconnected.
 */
exports.appendDisconnectedGlobalUser = function(socketId) {
  let date = new Date();

  // Mark user as disconnected, it will be replaced in updateGLobalUsers if user
  // will connect again.
  if (globalUsers[socketId] !== undefined) {
    globalUsers[socketId].status = states.userState.DISCONNECTED;
    globalUsers[socketId].disconnectTime = date;
  }
};

/**
 * Count active users.
 */
exports.getCountActiveUsers = function(workspaceId) {
  let count = 0;
  for (let socketId in globalUsers) {
    if (globalUsers[socketId].status === 'active' && globalUsers[socketId].workspaceId === workspaceId) {
      count++;
    }
  }
  return count;
};

/**
 * Count tournament active users.
 */
exports.getTournamentCountActiveUsers = function(workspaceId, tournamentId, phaseId) {
  let count = 0;
  for (let socketId in globalUsers) {
    if (globalUsers[socketId].status === 'active' && globalUsers[socketId].workspaceId === workspaceId
      && globalUsers[socketId].page === 'tournament' && globalUsers[socketId].pageData !== undefined
      && globalUsers[socketId].pageData.tournamentId === tournamentId && globalUsers[socketId].pageData.phaseId === phaseId) {
      count++;
    }
  }
  return count;
};

/**
 * Check if users already played and when.
 *
 * @param UserId
 *  Current user for whom we search battles.
 * @param opponentUserId
 *  Opponent user id with whom we search battles.
 */
exports.searchBattleInHistory = function(UserId, opponentUserId) {
  if (globalBattlesHistory[UserId] !== undefined && globalBattlesHistory[UserId][opponentUserId] !== undefined) {
    return globalBattlesHistory[UserId][opponentUserId];
  }
  else {
    return  false;
  }
};
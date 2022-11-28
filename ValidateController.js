let ExtError = require('./extError');
let Room = require('./Room');
let Logger = require('./Logger');

// Callbacks to backend.
let callbacks = require('./callbacks');

// States.
const states = require('./states');

module.exports = class ValidateController {
  constructor() {}

  /**
   * Handler throw errors.
   *
   * @param inputData
   * @param sessions
   */
  static sessionsValidate(inputData, sessions) {
    try {
      if (sessions.length < 1) {
        // Empty sessions from backend.
        throw new ExtError('00105','client_error', 'session_not_exist', {socketId : inputData.socketId, inputData : inputData});
      }

      let validSessionIds = [];
      sessions.forEach((item) => {

        // @todo hack to transfer old rooms to broken status. Should be changed to expire time in back-end.
        // if (item.status !== undefined) {
        //     // If room not exist now in nodeJS
        //   let room = Room.getRoom(item.session_id);
        //
        //     if (!room || (room && (!room.getPlayersCount()
        //                           || (room.getPlayersCount() === 1 && globalUsers[Object.keys(room.getPlayers())[0]] === undefined)))) {
        //
        //         // Mark rooms, which not exists in Rooms, as BROKEN.
        //         // @todo need implement in disconnect users plays.
        //         let updateBattlePromise = callbacks.updateBattle(inputData.workspaceId, item.battle_id, {status : 'error'});
        //         updateBattlePromise
        //           .then(() => {
        //             Logger.logDebugMessage('Battle ' + item.battle_id + ' updated with status error ', item, true);
        //           })
        //           .catch(ExtError.handleErrors);
        //
        //         // Remove empty rooms in global allRooms too.
        //         if (room) {
        //           Room.deleteFromGlobalRooms(room.roomName);
        //           room.updateRoomState(states.roomState.ERROR);
        //         }
        //     }
        // }

        validSessionIds.push(item.session_id);
      });

      // After we get valid sessions, we check and init user.
      // If user send to server not existed session id, we don't join him to any room.
      if (!validSessionIds.includes(inputData.sessionId)) {
        // Error when session id from socket not valid.
        throw new ExtError('00100','client_error', 'session_not_exist', {socketId : inputData.socketId, validSessions : validSessionIds, inputData : inputData});
      }
    }
    catch (error) {
      if (error.name !== 'ExtError') {
        error.context = inputData;
      }
      throw error;
    }
  }

  static authValidate(inputData) {
      if (inputData.userId === undefined || !Boolean(inputData.userId)) {
          throw new ExtError('00200', 'client_error', "not_authorized", {socketId : inputData.socketId});
      }
      else if(inputData.userName === undefined || !Boolean(inputData.userName)) {
          throw new ExtError('00201', 'client_error', "not_authorized", {socketId : inputData.socketId});
      }
      else if(inputData.workspaceId === undefined || !Boolean(inputData.workspaceId)) {
          throw new ExtError('00300', 'client_error', "missed_workspace_id", {socketId : inputData.socketId});
      }
      else if(inputData.currentPage === undefined || !Boolean(inputData.currentPage)) {
          throw new ExtError('00400', 'client_error', "missed_current_page", {socketId : inputData.socketId});
      }
  }
  static valueExist(value, code, type, message, context) {
      if (value === undefined || !Boolean(value)) {
          throw new ExtError(code, type, message, context);
      }
  }
};
// Error handler.
let ExtError = require('./extError');
let Logger = require('./Logger');

// Validation handler.
let ValidateController = require('./ValidateController');

// Room handler.
let Room = require('./Room');

// Matching handler.
let MatchingGroup = require('./MatchingGroup');

// Functions for work with global users.
let userCallbacks = require('./user');

// Time operations.
let TimeOperation = require('./TimeOperation');

// Config variables
let staticConfig = require('./staticConfig');
let config = require('./config');

// States.
const states = require('./states');

// Input emitter.
let input = require('./input/inputMiddleware');

/**
 *
 * @param matchedUsers
 * @param backendData
 */
exports.joinNewRoomMultiple = function(matchedUsers, backendData) {
    matchedUsers.forEach(function (matchedUser) {
      try {

          let socketId = userCallbacks.getActiveUserSocket(matchedUser.userId);
          if (!socketId) {
              throw new ExtError('01208', 'internal_error', 'User already fully disconnected and can\'t be joined to room', {socketId : socketId, errorId: '01208'});
          }
          else if (globalUsers[socketId].status === states.userState.DISCONNECTED) {
              throw new ExtError('01209', 'internal_error', 'User disconnected recently and can\'t be joined to room', {socketId : socketId, matchedUser: matchedUser, errorId: '01209'});
          }
          input.emit('join_room',
              {
                  socketId : socketId,
                  room :  backendData.tokbox_session_id,
                  data :  backendData,
                  callback : exports.processNewRoomCallback.bind(null, backendData, null)
              }
          );
      }
      catch (error) {
          // Return user to queue.
        console.log("Error 1: ", error);
        console.log("matchedUser in error stack: ", matchedUser);
        //   if (matchedUser.groupId !== undefined) {
        //     let group = MatchingGroup.getGroup(matchedUser.groupId);
        //     if (group !== undefined) {
        //       group.appendUserToGroup(matchedUser);
        //     }
        //   }

          if (error.name !== 'ExtError') {
              error.context = matchedUser;
          }
          ExtError.handleErrors(error);
      }

  });
};

/**
 *
 * @param backendData
 * @param startState
 * @param data
 */
exports.processNewRoomCallback = function(backendData, startState, data) {

  // Actions after LIGHT joining to room.
  // Update global rooms. Should be executed after joining to room.
  // We need this in battle creation to append user to newly created
  // room.
  exports.createRoomInGlobalIfNeeded({
        socketId : data.socketId,
        rooms : data.rooms,
        battleId : backendData.id,
        workspaceId : data.workspaceId,
        type : backendData.type,
        case : backendData.case,
        startState: startState
      }
  );

  // Append current user to created session.
  exports.appendNewPlayer(data, 'create_battle');

    // Remove user from group, because user already matched.
    let groupId = globalUsers[data.socketId].groupId;
    if (groupId !== undefined && groupId !== null) {
      // Clear grouping flag.
      globalUsers[data.socketId].groupId = null;
    }
    else {
        Logger.logDebugMessage('Internal error - groupId missed in user ' + globalUsers[data.socketId].userName
          + ' (' + globalUsers[data.socketId].userId + ')', globalUsers[data.socketId]);
    }

    // Send to user command to go to battle page.
    input.emit('join_to_battle', {socketId : data.socketId, data : {status : 'success', data : {battle : backendData}}});
};


/**
 * Create new rooms in Global rooms state.
 * @param data
 *  - battleId
 *  - workspaceId
 *  - rooms
 *  - socketId
 */
exports.createRoomInGlobalIfNeeded = function(data) {
    try {
        // @todo When we clear rooms? Nothing?
        // @todo should we still search roomName in socket or we already can take it from battleData
        // If we have rooms in this socket.
        if (data.rooms === undefined) {
            ValidateController.valueExist(data.rooms, '01400', 'internal_error', 'data.rooms empty');
        }

        let roomName = exports.getSocketRoom(data);
        if (!roomName) {
            throw new ExtError('01203', 'internal_error', 'User not in provided battle', {socketId : data.socketId});
        }

        // If in global rooms state we haven't such room, so it's new room,
        // which should be created.
        if (!Room.getRoom(roomName) && data.case !== undefined) {
            // This situation only for creating battle, not for joining to removed battle.

            let newRoom = new Room(roomName, data.battleId, data.workspaceId, data.type, data.case);

            if (data.startState !== undefined && data.startState !== null) {
                newRoom.startState = data.startState;

                if (data.startState === states.roomState.WAITING_USERS) {
                    // Users have some time to connect to room.
                    let JoinRoomOP = new TimeOperation(
                      'join-room-time-left',
                      roomName,
                      new Date(newRoom.stateTime.getTime() + config.joinTime(newRoom.getCase())*1000),
                      {room : newRoom}
                    );

                    TimeOperation.addTimeOperationToGlobal(JoinRoomOP);
                }
            }

            Room.appendToGlobalRooms(newRoom);
        }
    }
    catch (error) {
        if (error.name !== 'ExtError') {
            error.context = data;
        }
        ExtError.handleErrors(error);
    }
};


/**
 * Get room name.
 *
 * @param data
 *  - rooms
 *  - socketId
 *
 * @returns {*}
 */
exports.getSocketRoom = function(data) {
    for (let roomName in data.rooms) {
        if (roomName !== data.socketId) {
            return roomName;
        }
    }
    return false;
};

exports.appendNewPlayer = function(data, type) {
    try {
        if (globalUsers[data.socketId] === undefined) {
            // Send same message for user that he already in this session.
            throw new ExtError('01000', 'internal_error', 'globalUsers havent id: ' + data.socketId);
        }

        let roomName = exports.getSocketRoom(data);
        if (!roomName) {
            throw new ExtError('01202', 'internal_error', 'User not in provided battle', {socketId : data.socketId});
        }

        let room = Room.getRoom(roomName);
        if (!room) {
            throw new ExtError('00103', 'client_error', 'session_not_exist', {socketId : data.socketId});
        }

        let user = globalUsers[data.socketId];

        if (!room.playersExist()) {

            // Append new player.
            user.checkedDevices = false; // By default checking devices screen.
            room.createPlayer(user);
        }
        else {
            let existingUserSocketId = userCallbacks.findUserInUsers(user.userId, room.getPlayers());
            if (!existingUserSocketId) {

                if (room.getPlayersCount() < staticConfig.maxPlayersInRoom) {
                    user.checkedDevices = false; // By default checking devices screen.
                    room.createPlayer(user);
                }
                else {
                    // Send same message for user that he already in this session.
                    input.emit('info', {socketId : data.socketId, data : {status : 'error', message : 'max_players_in_room'}});
                }
            }
        }

        // Send first state to client. At first it is checking devices screen.
        if (type !== 'create_battle') {
            room.updateTimer();
            input.emit('info', {socketId : data.socketId, data : {status : 'success', data : room}});
        }
    }
    catch (error) {
        if (error.name !== 'ExtError') {
            error.context = data;
        }
        ExtError.handleErrors(error);
    }
};

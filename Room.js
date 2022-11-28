let stateHandler = require('./stateHandler');

// Config variables
let config = require('./config');

// States.
const states = require('./states');

// Input emitter.
let input = require('./input/inputMiddleware');
let ExtError = require('./extError');
let Logger = require('./Logger');

// Callbacks to backend.
let callbacks = require('./callbacks');
let TimeOperation = require('./TimeOperation');

// Functions for work with global users.
let userCallbacks = require('./user');

module.exports = class Room {
  constructor(roomName, battleId, workspaceId, battleType, battleCase) {
    this.roomName = roomName;
    this.battleId = battleId;
    this.workspaceId = workspaceId;
    this.state = states.roomState.WAITING_USERS;
    this.battleType = battleType;
    this.stateTime = new Date();
    this.archiveStarted = false;
    this.bothConnected = false;
    this.joinTimer = config.joinTime(battleCase);
    this.waitingTimer = config.waitingTime(battleCase);
    this.tossTimer = config.tossTime(battleCase);
    this.breakTimer = config.breakTime(battleCase);
    this.roundTimer = config.commonRoundTime(battleCase);
    this.refereeingTimer = config.refereeingTime(battleCase);
    this.roundHistory = [];
    this.case = battleCase;
    this.roles = battleCase.roles;
    this.startState = false;
    this.roundsSpentCount = 0;

    // Get workspace settings.
    let room = this;
    let getWorkspaceSettingsPromise = callbacks.getWorkspace(workspaceId);
    getWorkspaceSettingsPromise
        .then((data) => {
          room.workspaceSettings = data;
        })
        .catch(ExtError.handleErrors);
  }

  getCase() {
    return this.case;
  }

  createPlayer(user) {
    if (this.players === undefined || this.players === null) {
      this.players = {};
      this.players[user.socketId] = user;
      // By default devices not checked.
      this.players[user.socketId].checkedDevices = false;

      // Store player ids to save needed sort.
      this.playersFixed = {};
      this.playersFixed.fPlayerUserId = user.userId;

      let room = this;
      process.nextTick(function () {
        stateHandler.emit('room-updated', room);
      });
    }
    else if (this.players[user.socketId] === undefined) {
      this.players[user.socketId] = user;

      // Store player ids to save needed sort.
      if (user.userId !== this.playersFixed.fPlayerUserId) {
        this.playersFixed.sPlayerUserId = user.userId;
      }

      let room = this;
      process.nextTick(function () {
        stateHandler.emit('room-updated', room);
      });
    }
    else {
      // Such user already in players.
      return false;
    }
  }

  playersExist() {
    if (this.players !== undefined) {
      return this.players;
    }
    return false;
  }

  /**
   * Send info for second user about that first was disconnected.
   *
   * @param socketId
   *  Socket id of second user.
   */
  sendInfoSecondUserAboutFirstDisconnected(socketId) {
    // And send second user info, that second user was disconnected.
    input.emit('info', {socketId : socketId, data : {status : 'error', code : '00502', message : 'second_user_disconnected'}});
    Logger.logDebugMessage('Second user in battle ' + this.battleId + ' was disconnected', this, true);
  }

  removePlayer(id) {
    if (this.players[id] !== undefined) {
      this._removePlayer(id);

      return id;
    }
    // If socket already changed.
    // @todo Also one way - change socket in player automatically, when user left battle and connect on other page thru reconnect event.
    else {
      let foundedPlayerData = Room.findMeInOtherForgottenRooms(id);
      if (foundedPlayerData !== undefined && foundedPlayerData.socketId !== undefined) {
        this._removePlayer(foundedPlayerData.socketId);

        return foundedPlayerData.socketId;
      }
    }
    return false;
  }

  _removePlayer(id) {
    delete this.players[id];

    // Ask user to disable reconnect.
    Logger.logDebugMessage('User removed from players, send to user ' + id + ' reconnect event,' +
      ' that user should remove reconnect flag', this);

    input.emit('reconnect',
      {
        socketId : id,
        data : {
          status : 'success',
          data : {
            type : 'reconnect',
            data : {
              enable : false,
            },
          }
        }
      }
    );
  }

  updatePlayer(id, user) {
    if (this.players !== undefined) {
      if (this.players[id] !== undefined) {
        this.players[id] = user;
        let room = this;
        process.nextTick(function () {
          stateHandler.emit('room-updated', room);
        });
        return this.players[id];
      }
    }
    return false;
  }

  getRoomState() {
    return this.state;
  }

  saveInRoundHistory(data) {
    this.roundHistory.push(data);
  }

  updateTimer() {
    let date = new Date();
    let stateEventDate = this.stateTime;

    switch (this.state) {
      case states.roomState.WAITING_USERS:
        // Calculate event date.
        if (this.bothConnected) {
          this.waitingTimer = Math.ceil((stateEventDate.getTime() - date.getTime() + config.waitingTime(this.getCase())*1000)/1000);
        }
        else {
          this.joinTimer = Math.ceil((stateEventDate.getTime() - date.getTime() +  config.joinTime(this.getCase())*1000)/1000)
        }
        break;

      case states.roomState.TOSS:
        // Calculate event date.
        this.tossTimer = Math.ceil((stateEventDate.getTime() - date.getTime() + config.tossTime(this.getCase())*1000)/1000);
        break;

      case states.roomState.ROUND:
      case states.roomState.ROUND_FIRST:
      case states.roomState.ROUND_SECOND:
        // Calculate event date.
        this.roundTimer = Math.ceil((stateEventDate.getTime() - date.getTime() + config.commonRoundTime(this.getCase())*1000)/1000);
        break;

      case states.roomState.BREAK:
        // Calculate event date.
        this.breakTimer = Math.ceil((stateEventDate.getTime() - date.getTime() + config.breakTime(this.getCase())*1000)/1000);
        break;
    }
  }

  updateRoomState(state) {
    this.state = state;
    this.stateTime = new Date();

    (function (room) {
      process.nextTick(function () {
        stateHandler.emit('room-state-updated', room);
        stateHandler.emit('room-updated', room);
      });
    })(this);
  }

  updateRoomParams(params) {
    if (params !== undefined) {
      for (let paramName in params) {
        this[paramName] = params[paramName];
      }
      (function (room) {
        process.nextTick(function () {
          stateHandler.emit('room-updated', room);
        });
      })(this);
    }
    return false;
  }

  getPlayersCount() {
    if (this.players !== undefined) {
      return Object.keys(this.players).length;
    }
    else {
      return 0;
    }
  }

  getPlayers() {
    if (this.players !== undefined && this.players !== {}) {
      return this.players;
    }
    return false;
  }

  getPlayer(id) {
    if (this.players !== undefined) {
      if (this.players[id] !== undefined) {
        return this.players[id];
      }
    }
    return false;
  }

  /**
   * Get socket Id of first player.
   *
   * @returns *|boolean
   */
  getFirstPlayerId() {
    if (this.players !== undefined) {
      for (let id in this.players) {
        if (this.players[id].userId === this.playersFixed.fPlayerUserId) {
          return id;
        }
      }
    }
    return false;
  }

  /**
   * Get socket Id of second player.
   *
   * @returns *|boolean
   */
  getSecondPlayerId() {
    if (this.players !== undefined) {
      for (let id in this.players) {
        if (this.players[id].userId === this.playersFixed.sPlayerUserId) {
          return id;
        }
      }
    }
    return false;
  }

  getSecondPlayer(firstId) {
    for (let id in this.players) {
      if (id !== firstId) {
        return this.players[id];
      }
    }
    return false;
  }

  /**
   * Remove player from battle and cancel battle.
   *
   * @param socketId
   * @param status
   */
  removePlayerAndCancelBattle(socketId, status = states.roomState.ERROR) {
    // Check that user in battle.
    if (!this.getPlayer(socketId)) {

      // If current user socket not in battle - need to check may be he in battle with old sockets.
      let foundedPlayerData = Room.findMeInOtherForgottenRooms(socketId);

      // If we not present in rooms with other socketIds or we present, but not in current room - so we not player and
      // can't cancel it.
      if (foundedPlayerData === undefined || foundedPlayerData.room.battleId !== this.battleId) {
        throw new ExtError('01205', 'internal_error', 'User not in provided battle', {socketId : socketId});
      }
    }

    // Save battle history before users removed from room.
    if (status === states.roomState.CANCELLED) {
      this.saveUsersHistory();
    }

    // Remove first player.
    let removedSocketId = this.removePlayer(socketId);

    if (removedSocketId !== undefined) {
      // Send second user info that first disconnected.
      let secondPlayer = this.getSecondPlayer(removedSocketId);
      if (secondPlayer && secondPlayer.status === states.userState.ACTIVE) {
        this.sendInfoSecondUserAboutFirstDisconnected(secondPlayer.socketId);
      }

      // Remove room and set state ERROR/CANCELLED.
      this.removeRoom(status);
    }
  }

  /**
   * Remove room.
   *
   * @param status
   */
  removeRoom(status) {
    let _self = this;
    Logger.logDebugMessage('Removing room: ' + _self.battleId + ' with status: ' + status, _self);
    _self.updateBattleStatus(status);
    _self.updateRoomState(status);
    TimeOperation.removeTimeOperation('change-room-state', _self.roomName);
    process.nextTick(function () {
      Room.deleteFromGlobalRooms(_self.roomName);
    });

  }

  /**
   * Update battle status in backend.
   *
   * @param status
   */
  updateBattleStatus(status) {
    // Change status to finished after archive ending.
    if (this === "undefined") {
      console.log('status:' + status);
    }
    let updateBattlePromise = callbacks.updateBattle(this.workspaceId, this.battleId, {status : status});
    updateBattlePromise
      .then(() => {
        Logger.logDebugMessage('Battle ' + this.battleId + ' in BACKEND updated with status ' + status, true);
      })
      .catch(ExtError.handleErrors);
  }

  /**
   * Save users history from this battle.
   */
  saveUsersHistory() {
    let firstPlayerId = this.getFirstPlayerId();
    let secondPlayerId = this.getSecondPlayerId();
    let firstPlayer = this.getPlayer(firstPlayerId);
    let secondPlayer = this.getPlayer(secondPlayerId);

    if (globalBattlesHistory[firstPlayer.userId] === undefined) {
      globalBattlesHistory[firstPlayer.userId] = {};
    }
    globalBattlesHistory[firstPlayer.userId][secondPlayer.userId] = Date.now();

    if (globalBattlesHistory[secondPlayer.userId] === undefined) {
      globalBattlesHistory[secondPlayer.userId] = {};
    }
    globalBattlesHistory[secondPlayer.userId][firstPlayer.userId] = Date.now();
  }

  /**
   * Remove room from global AllRooms.
   *
   * @param roomName
   */
  static deleteFromGlobalRooms(roomName) {
    delete allRooms[roomName];
  }

  /**
   * Append room to global AllRooms
   *
   * @param room
   */
  static appendToGlobalRooms(room) {
    if (allRooms[room.roomName] === undefined) {
      allRooms[room.roomName] = room;
    }
  }

  /**
   * Return room by battleId.
   *
   * @param battleId
   *
   * @returns boolean|Object Room
   */
  static getRoomByBattleId(battleId) {
    if (Object.keys(allRooms).length > 0) {
      for (let roomName in allRooms) {
        if (allRooms[roomName].battleId === battleId) {
          return allRooms[roomName];
        }
      }
    }
    return false;
  }

  /**
   * Return room by room name.
   *
   * @param roomName
   *
   * @returns boolean|Object Room
   */
  static getRoom(roomName) {
    if (allRooms[roomName] !== undefined) {

      /** @var Object Room **/
      return allRooms[roomName];
    }
    else {
      return false;
    }
  }

  /**
   * Get object with all rooms.
   *
   * @return Object
   */
  static getRooms() {
    return allRooms;
  }

  /**
   * Get oldest waiting room.
   *
   * @return Object|Boolean.
   */
  static getWaitingRoom(workspaceId) {
    if (Object.keys(allRooms).length > 0) {
      for (let roomName in allRooms) {
        if (allRooms[roomName].getRoomState() === states.roomState.WAITING_USERS
        && allRooms[roomName].workspaceId === workspaceId
        && allRooms[roomName].getPlayersCount() === 1) {
          return allRooms[roomName];
        }
      }
    }
    return false;
  }

  static findMeInOtherForgottenRooms(socketId) {
    let rooms = Room.getRooms();
    for (let roomName in rooms) {
      let room = rooms[roomName];
      // if (room.state !== states.roomState.WAITING_USERS) {
      let players = room.getPlayers();
      if (players) {

        let foundedPlayerSocketId = userCallbacks.findUserInUsers(globalUsers[socketId].userId, players);
        if (foundedPlayerSocketId) {
          if (globalUsers[foundedPlayerSocketId] !== undefined) {
            // @todo in some cases (when wifi disabled) we not get user as disconnected, so
            // user still not disconnected.
            if (globalUsers[foundedPlayerSocketId].status !== states.userState.DISCONNECTED) {
              Logger.logDebugMessage('User ' + globalUsers[foundedPlayerSocketId].userName + '(' + foundedPlayerSocketId +
                  + ') marked as disconnected, because logged in other socketId: ' + socketId);

              // Set user as disconnected, he will be disconnected
              userCallbacks.appendDisconnectedGlobalUser(foundedPlayerSocketId);

              // Mark players as disconnected already now to avoid room processing.
              Room.markPlayersAsDisconnected(foundedPlayerSocketId);
            }

            return {
              socketId : foundedPlayerSocketId,
              room : room,
            };
          }
        }
      }
      // }
    }
    return false;
  }


  /**
   * Mark and process players as disconnected after socket disconnect.
   * @param socketId *
   *
   * @return void
   */
  static markPlayersAsDisconnected(socketId) {
    for (let roomName in Room.getRooms()) {
      let room = Room.getRoom(roomName);
      try {

        if (!room) {
          throw new ExtError('00108', 'client_error', 'session_not_exist', {socketId : socketId});
        }

        let players = room.getPlayers();
        if (!players) {
          throw new ExtError('01207', 'internal_error', 'User not in provided battle', {socketId : socketId});
        }

        for (let playerSocketId in players) {
          if (playerSocketId === socketId) {
            let player = room.getPlayer(playerSocketId);
            player.status = states.userState.DISCONNECTED;
            room.updatePlayer(playerSocketId, player);

            // @todo: Why only these states?
            if ([
              states.roomState.ROUND,
              states.roomState.ROUND_FIRST,
              states.roomState.ROUND_SECOND,
              states.roomState.BREAK,
              states.roomState.TOSS,
              states.roomState.ASSESMENT,
              states.roomState.AS_AND_SR,
              states.roomState.SELF_REFEREEING,
            ].includes(allRooms[roomName].state)) {

              let secondPlayer = room.getSecondPlayer(playerSocketId);
              input.emit('notification', { socketId : secondPlayer.socketId, data : {status : 'success', data : {type : states.notifications.USER_DISCONNECTED}}});
            }
          }
        }
        // }
      }
      catch (error) {
        if (error.name !== 'ExtError') {
          error.context = room;
        }
        ExtError.handleErrors(error);
      }
    }
  }
};

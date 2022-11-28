// Input emitter.
let input = require('./input/inputMiddleware');

// State controller.
let stateHandler = require('./stateHandler');

let TimeOperation = require('./TimeOperation');

// Callbacks to backend.
let callbacks = require('./callbacks');
let BattleOperations = require('./BattleOperations');

// Functions for work with global users.
let userCallbacks = require('./user');

let backEmitter = require('./processor');

let ValidateController = require('./ValidateController');
let Room = require('./Room');
let MatchingGroup = require('./MatchingGroup');

let ExtError = require('./extError');
let Logger = require('./Logger');

// Config variables
let staticConfig = require('./staticConfig');
let config = require('./config');

// States.
const states = require('./states');

// Common environment.
globalBattlesHistory = {}; // Battles history.
globalUsers = {}; // All active users.
allRooms = {};
allGroups = {};
timeOperations = [];

let getStatePromise = new Promise(callbacks.getRoomsState);
getStatePromise
    .then(init)
    .catch(function (e) {
        ExtError.handleErrors(e);
        init({});
    });

function init(json) {
    Logger.logDebugMessage('Initialization', json);
    let needProcessEmptyRooms = false;
    if (json.data !== undefined && Object.keys(json.data).length > 0) {
        allRooms = json.data;

        // Fill globalUsers after get state.
        for (let roomName in allRooms) {
            if (allRooms[roomName].players !== undefined) {
                for (let sockId in allRooms[roomName].players) {
                    let exSockId = userCallbacks.findUserInUsers(allRooms[roomName].players[sockId].userId, globalUsers);
                    if (!exSockId) {
                        globalUsers[sockId] = allRooms[roomName].players[sockId];
                        globalUsers[sockId].status = states.userState.DISCONNECTED;
                    }
                }
            }

        }

        if (allRooms !== undefined && allRooms !== null && allRooms !== {}) {
            needProcessEmptyRooms = true;

            // Clearing rooms after get saved state from backend, but after some
            // time => time to reconnect users after nodeJS restarting.
            // It can cause problem if this will be execute between old player
            // connection and processExistingPlayers function.
            setTimeout(processEmptyRooms, staticConfig.timeBeforeStartAndProcessEmptyRooms * 1000);
        }
    }
    else {
        Logger.logDebugMessage('Saved state is empty', json);
    }

    // Initialize server.
    serverInitialization(needProcessEmptyRooms);
}

function serverInitialization(needProcessEmptyRooms) {
    // Initialize input handlers.
    initializeInputHandlers(input);

    // Initialize input handlers.
    initializeRoomHandlers();

    if (needProcessEmptyRooms) {
        // We start server in 10 seconds.
        Logger.logDebugMessage('Server will start in ' + (staticConfig.timeBeforeStartAndProcessEmptyRooms + 1) + ' seconds', needProcessEmptyRooms);
        setTimeout(serverLoop, staticConfig.timeBeforeStartAndProcessEmptyRooms * 1000 + 1000);
    }
    else {
        setImmediate(serverLoop);
    }
}

/**
 * Join to new room and redirect user to battle page.
 * @param socketId
 * @param startState
 * @param backendData
 */
function joinNewRoomSingle(socketId, startState, backendData) {
    try {
        if (globalUsers[socketId] === undefined) {
            throw new ExtError('01210', 'internal_error', 'User already fully disconnected and can\'t be joined to room', {socketId : socketId, errorId: '01210'});
        }
        else if (globalUsers[socketId].status === states.userState.DISCONNECTED) {
            throw new ExtError('01211', 'internal_error', 'User disconnected recently and can\'t be joined to room', {socketId : socketId, user: globalUsers[socketId], errorId: '01211'});
        }
        input.emit('join_room',
            {
                socketId : socketId,
                room :  backendData.tokbox_session_id,
                data :  backendData,
                callback : BattleOperations.processNewRoomCallback.bind(null, backendData, startState)
            }
        );
    }
    catch (error) {
        if (error.name !== 'ExtError' && data !== undefined) {
            error.context = data.toString();
        }
        ExtError.handleErrors(error);
    }
}

/**
 * Process user with matching groups.
 *
 * @param inputData
 *
 * @param backendData
 *   @param backendData.action
 *   @param backendData.profile_group_id
 *   @param backendData.matching_group_id
 *   @param backendData.matching_opponent_rules
 */
function processMatchingGroups(inputData, backendData) {
    if (backendData.action !== 'find-opponent') {
        throw new ExtError('01505', 'client_error', "Can't start battle", {socketId: inputData.socketId, backendData : backendData});
    }

    ValidateController.valueExist(backendData.profile_group_id, '00619', 'backend_error', "missed_profile_group_id",{backendData});
    ValidateController.valueExist(backendData.matching_group_id, '00620', 'backend_error', "missed_matching_group_id",{backendData});

    if (!Array.isArray(backendData.matching_group_id)) {
        throw new ExtError('00621', 'backend_error', "matching_group_id should be array", backendData);
    }

    let group;
    group = MatchingGroup.getGroup(backendData.profile_group_id);
    if (!group) {
        group = new MatchingGroup(backendData.profile_group_id);
    }

    let user = {
        userId:inputData.userId,
        userName:inputData.userName,
        workspaceId: inputData.workspaceId,
        matchingGroupIds: backendData.matching_group_id,
        matchingRules: backendData.matching_opponent_rules,
    };

    if (inputData.tournamentId !== undefined) {
        user.tournamentId = inputData.tournamentId;
    }
    if (inputData.phaseId !== undefined) {
        user.phaseId = inputData.phaseId;
    }
    if (inputData.caseId !== undefined) {
        user.caseId = inputData.caseId;
    }

    if (backendData.matching_opponent_rules !== undefined) {
        user.matchingRules = backendData.matching_opponent_rules;
    }
    else {
        // Provide default matching rules.
        user.matchingRules = staticConfig.matchingRules;
    }

    group.appendUserToGroup(user);

    // Save groupId in user.
    globalUsers[inputData.socketId].groupId = group.groupId;
}

function initializeRoomHandlers() {
    // Event to change room state
    // @todo change to directly run room.updateRoomState(data.newState) in time Operation.
    stateHandler.on('change-room-state', function(data) {
        try {
            // if status ERROR, then we can't change it.
            if (Room.getRoom(data.room.roomName)
              && data.room.getRoomState() !== states.roomState.ERROR) {
                data.room.updateRoomState(data.newState);
            }
        }
        catch (error) {
            if (error.name !== 'ExtError') {
                error.context = data;
            }
            ExtError.handleErrors(error);
        }
    });

    stateHandler.on('end-rounds', function(room) {
        try {
            // Send round history to Backend.
            callbacks.sendRoundHistory(room);

            // Stop archive recording.
            if (room.archiveStarted) {
                callbacks.stopArchiveRecord(room);
            }
            else {
                room.updateBattleStatus('finished');
            }

            // Set round timer to 0, info will send in room-state-updated.
            room.updateRoomParams({roundTimer : 0});
            room.updateTimer();
        }
        catch (error) {
            if (error.name !== 'ExtError') {
                error.context = room;
            }
            ExtError.handleErrors(error);
        }
    });

    stateHandler.on('matching', function(data) {
        try {
            if (data.currentUserGroupId !== undefined && data.currentUser !== undefined
            && data.currentUser.groupId !== undefined // Still in group.
            ) {
                let group = MatchingGroup.getGroup(data.currentUserGroupId);

                group.runMatching(data.currentUser);
            }
        }
        catch (error) {
            if (error.name !== 'ExtError') {
                error.context = room;
            }
            ExtError.handleErrors(error);
        }
    });

    stateHandler.on('remove-page-visit-status', function(data) {
        try {
            if (data.userId !== undefined) {
                let socketId = userCallbacks.getActiveUserSocket(data.userId);
                if (socketId !== undefined) {
                    delete globalUsers[socketId].page;
                    delete globalUsers[socketId].pageData;
                }
            }
        }
        catch (error) {
            if (error.name !== 'ExtError') {
                error.context = data;
            }
            ExtError.handleErrors(error);
        }
    });

    // Handler to process waiting room time.
    stateHandler.on('waiting-time-left', function(room) {
        try {
            // If waiting time elapsed, then we need force start battle.
            if (room.getRoomState() === states.roomState.WAITING_USERS) {
                // If time left we need run battle.
                let startState = states.roomState.TOSS;

                // Start with provided state.
                if (room.startState !== false && states.ifStateExist(room.startState)) {
                    startState = room.startState;
                }

                room.updateRoomState(startState);
            }
        }
        catch (error) {
            if (error.name !== 'ExtError') {
                error.context = room;
            }
            ExtError.handleErrors(error);
        }
    });

    // Handler to process join room time.
    stateHandler.on('join-room-time-left', function(room) {
        try {

            // If join time elapsed, then we need cancel battle.
            if (room.getRoomState() === states.roomState.WAITING_USERS) {
                // если оба пользователя еще не подключались - отменяем поединок, время вышло
                if (!room.bothConnected) {
                    let players = room.getPlayers();
                    if (players) {
                        for (let sockId in players) {
                            room.removePlayer(sockId);
                        }
                    }
                    room.removeRoom(states.roomState.ERROR);
                }
            }
        }
        catch (error) {
            if (error.name !== 'ExtError') {
                error.context = room;
            }
            ExtError.handleErrors(error);
        }
    });

    stateHandler.on('refereeing-time-end', function(room) {
        try {
            if (room.getRoomState() === states.roomState.SELF_REFEREEING
                || room.getRoomState() === states.roomState.ASSESMENT
                || room.getRoomState() === states.roomState.AS_AND_SR) {
                callbacks.stopRefereeingState(room);
            }
        }
        catch (error) {
            if (error.name !== 'ExtError') {
                error.context = room;
            }
            ExtError.handleErrors(error);
        }
    });

    // Handler which worked only when status changed.
    stateHandler.on('room-state-updated', function(room) {
        try {
            if (Room.getRoom(room.roomName)) {
                Logger.logDebugMessage('Battle ' + room.battleId + ' changed status to: ' + room.getRoomState(), room);

                let firstPlayerId = room.getFirstPlayerId();
                let secondPlayerId = room.getSecondPlayerId();
                let firstPlayer = room.getPlayer(firstPlayerId);
                let secondPlayer = room.getPlayer(secondPlayerId);
                let playersHistory = [];
                let eventDate = null;

                switch (room.getRoomState()) {
                    case states.roomState.TOSS:
                        // When we just switched to TOSS status, then we should change
                        // status of battle and send info to backend about
                        // which users want to record battle.
                        let participants = getParticipants(room);
                        let updateBattlePromise = callbacks.updateBattle(room.workspaceId, room.battleId, {status : 'started', participants: participants});

                        updateBattlePromise
                          .then(() => {
                              Logger.logDebugMessage('Battle ' + room.battleId + ' chanded status to started in Backend', room);

                              try {
                                  room.updateRoomParams({archiveStarted: true});
                                  callbacks.startArchiveRecord(room, processBalanceErrors.bind(null, room));
                              }
                              catch (error) {
                                  if (error.name !== 'ExtError') {
                                      error.context = room;
                                  }
                                  ExtError.handleErrors(error);
                              }
                              // }

                              // Set roles in first time.
                              if (firstPlayer.role == null) {
                                  firstPlayer.role = room.roles[0].id;
                                  room.updatePlayer(firstPlayerId, firstPlayer);
                                  secondPlayer.role = room.roles[1].id;
                                  room.updatePlayer(secondPlayerId, secondPlayer);
                              }

                              // Update timers before sending to client.
                              room.updateTimer();

                              input.emit('info', {socketId : room.roomName, data : {status : 'success', data : room}});

                              // Calculate event date.
                              // Time operation to change status in event date.
                              let round1TimeOp = new TimeOperation(
                                'change-room-state',
                                room.roomName,
                                new Date(room.stateTime.getTime() + config.tossTime(room.getCase())*1000),
                                {newState : states.roomState.ROUND_FIRST, room : room}
                              );
                              TimeOperation.addTimeOperationToGlobal(round1TimeOp);
                          })
                          .catch(ExtError.handleErrors);
                        break;
                    case states.roomState.ROUND:
                    case states.roomState.ROUND_FIRST:
                    case states.roomState.ROUND_SECOND:
                        playersHistory.push({userId : firstPlayer.userId, userName : firstPlayer.userName, role : firstPlayer.role});
                        playersHistory.push({userId : secondPlayer.userId, userName : secondPlayer.userName, role : secondPlayer.role});
                        room.saveInRoundHistory({players : playersHistory});

                        // Update timers before sending to client.
                        room.updateRoomParams({breakTimer: config.breakTime(room.getCase()), tossTimer: 0,  roundsSpentCount: room.roundsSpentCount + 1});
                        room.updateTimer();

                        // Events for client.
                        input.emit('info', {socketId : room.roomName, data : {status : 'success', data : room}});

                        // Messages at the start of round.
                        // In first round it will be 0, in second round it will be 1, ...
                        // @todo Are we sure that room.updateRoomParams above will executed before this moment.
                        if ( (room.roundsSpentCount + 1) % 2) {
                            input.emit('notification', {socketId : firstPlayerId, data : {status : 'success', data : {type : states.notifications.OTHER_PLAYER_STEP}}});
                            input.emit('notification', {socketId : secondPlayerId, data : {status : 'success', data : {type : states.notifications.START_ROUND}}});
                        }
                        else {
                            input.emit('notification', {socketId : firstPlayerId, data : {status : 'success', data : {type : states.notifications.START_ROUND}}});
                            input.emit('notification', {socketId : secondPlayerId, data : {status : 'success', data : {type : states.notifications.OTHER_PLAYER_STEP}}});
                        }

                        // If we have also rounds, then we enable break and next round.
                        if (config.totalRounds(room.getCase()) > room.roundsSpentCount) {
                            // Calculate event date.
                            // Time operation to change status in event date.
                            let breakTimeOp = new TimeOperation(
                              'change-room-state',
                              room.roomName,
                              new Date(room.stateTime.getTime() + config.commonRoundTime(room.getCase())*1000),
                              {newState : states.roomState.BREAK, room : room}
                            );
                            TimeOperation.addTimeOperationToGlobal(breakTimeOp);
                        }
                        // If we haven't more rounds, then we change to completed or assessment after this round.
                        else {
                            // Next step depend to which steps we have in Backend.
                            // @todo in future we should also take steps order from backend.
                            let nextStep = states.roomState.COMPLETED_WAITING_JUDGEMENT;
                            let battleFormatSteps = room.workspaceSettings !== undefined && room.workspaceSettings.configuration.battle.format.steps !== undefined
                              ? room.workspaceSettings.configuration.battle.format.steps
                              : [];
                            if (battleFormatSteps.length !== 0) {
                                nextStep = battleFormatSteps[0].id;
                                if (battleFormatSteps.length > 1) {
                                    if (battleFormatSteps[0].id === states.roomState.ASSESMENT &&
                                      battleFormatSteps[1].id === states.roomState.SELF_REFEREEING
                                    ) {
                                        nextStep = states.roomState.AS_AND_SR;
                                    }
                                }
                            }
                            // Calculate event date.
                            eventDate = new Date(room.stateTime.getTime() + config.commonRoundTime(room.getCase())*1000);

                            // Time operation to change status in event date.
                            let afterRoundsTimeOp = new TimeOperation(
                              'change-room-state',
                              room.roomName,
                              eventDate,
                              {newState : nextStep, room : room}
                            );
                            TimeOperation.addTimeOperationToGlobal(afterRoundsTimeOp);

                            // Time operation to change status in event date.
                            let endRoundsOp = new TimeOperation(
                              'end-rounds',
                              room.roomName,
                              eventDate,
                              room
                            );
                            TimeOperation.addTimeOperationToGlobal(endRoundsOp);

                        }
                        break;
                    case states.roomState.BREAK:
                        // If both users haven't time, then it's BREAK time.

                        // In first round it will be 0, in second round it will be 1, ...
                        let roundIndex = (room.roundsSpentCount + 1) % 2;

                        // Change roles.
                        // Set roles.
                        firstPlayer.role = (roundIndex) ? room.roles[0].id : room.roles[1].id;
                        secondPlayer.role = (roundIndex) ? room.roles[1].id : room.roles[0].id;
                        room.updatePlayer(firstPlayerId, firstPlayer);
                        room.updatePlayer(secondPlayerId, secondPlayer);

                        // Reset round timers.
                        // @todo do we need it here?
                        room.updateRoomParams({roundTimer : config.commonRoundTime(room.getCase())});

                        // Update timers before sending to client.
                        room.updateTimer();
                        input.emit('info', {socketId : room.roomName, data : {status : 'success', data : room}});

                        let roomStateRound = states.roomState.ROUND + '_' + (room.roundsSpentCount + 1);
                        // Calculate event date.
                        // Time operation to change status in event date.
                        let roundNextTimeOp = new TimeOperation(
                          'change-room-state',
                          room.roomName,
                          new Date(room.stateTime.getTime() + config.breakTime(room.getCase())*1000),
                          {newState : roomStateRound, room : room}
                        );
                        TimeOperation.addTimeOperationToGlobal(roundNextTimeOp);
                        break;
                    case states.roomState.ASSESMENT:
                    case states.roomState.SELF_REFEREEING:
                    case states.roomState.AS_AND_SR:
                        // Send info with new states.
                        input.emit('info', {socketId : room.roomName, data : {status : 'success', data : room}});

                        // Calculate event date.
                        eventDate = new Date(room.stateTime.getTime() + config.refereeingTime(room.getCase())*1000);
                        // Time operation to stop refereeing.
                        let stopRefereeingOp = new TimeOperation(
                          'refereeing-time-end',
                          room.roomName,
                          eventDate,
                          room
                        );
                        TimeOperation.addTimeOperationToGlobal(stopRefereeingOp);
                        break;
                    case states.roomState.COMPLETED:
                    case states.roomState.COMPLETED_WAITING_JUDGEMENT:
                        // Ask users to disable reconnect.
                        input.emit('reconnect',
                          {
                              socketId : room.roomName,
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
                        // Ask user to disable reconnect.
                        Logger.logDebugMessage('Send to all users of battle ' + room.battleId + ' reconnect event,' +
                          ' that users should remove reconnect flag', this);


                        input.emit('info', {socketId : room.roomName, data : {status : 'success', data : room}});

                        // Save users battle history.
                        room.saveUsersHistory();

                        Room.deleteFromGlobalRooms(room.roomName);
                        break;
                }
            }
        }
        catch (error) {
            if (error.name !== 'ExtError') {
                error.context = room;
            }
            ExtError.handleErrors(error);
        }
    });

    // Handler which worked when room changed.
    stateHandler.on('room-updated', function (room) {
        try {
            switch (room.getRoomState()) {
                case states.roomState.WAITING_USERS:
                    if (room.getPlayersCount() > 1) {
                        // Set waiting timer.
                        // It should be first time, when both users connected.
                        if (!room.bothConnected) {
                            // Time operation to change status in event date.
                            let battleWaitingOP = new TimeOperation(
                              'waiting-time-left',
                              room.roomName,
                              new Date(room.stateTime.getTime() + config.waitingTime(room.getCase())*1000),
                              room
                            );
                            TimeOperation.addTimeOperationToGlobal(battleWaitingOP);
                            room.updateRoomParams({bothConnected : true})
                        }

                        if (room.getPlayer(room.getFirstPlayerId()).checkedDevices
                          && room.getPlayer(room.getSecondPlayerId()).checkedDevices
                        ) {

                            // If now we have 2 users and was status WAITING, then we switch to
                            // status TOSS.
                            let startState = states.roomState.TOSS;
                            if (room.startState !== false && states.ifStateExist(room.startState)) {
                                startState = room.startState;
                            }
                            room.updateRoomState(startState);
                        }
                    }
                    break;

            }
        }
        catch (error) {
            if (error.name !== 'ExtError') {
                error.context = room;
            }
            ExtError.handleErrors(error);
        }
    });
}

function serverLoop() {
    let serverStartDate = new Date();

    setInterval(function () {
        // Server timer, need to know how long time ago server started.
        let tickDate = new Date();

        // Process disconnected users.
        processDisconnectedUsers();

        // Process time operations.
        if (timeOperations !== undefined) {
            timeOperations.forEach(function (timeOp, key, value) {
                if (timeOp.checkTimeCondition()) {
                    stateHandler.emit(timeOp.event, timeOp.data);
                    delete timeOperations[key];
                }
            });
            timeOperations = timeOperations.filter(function (el) {
                return el != null;
            });
        }

        // Saving state of rooms to file.
        // If at least one authorized user connected to server.
        if (Object.keys(globalUsers).length > 0 && Math.abs(tickDate - serverStartDate) > 5000) {
            callbacks.saveRoomsState();
            serverStartDate = tickDate;
        }
    }, 0);
}

/**
 * Update players, if their socket id was changed.
 * @param data
 *  - socketId
 *  - rooms
 *
 *
 * @return old socket.id or false otherwise.
 */
function updateExistingPlayers(data) {
    let user = globalUsers[data.socketId];
    let result = false;

    // @todo Need process room players if user disconnected from room and go to other.
    // If one user go to other room.
    // @todo надо не давать ему пойти в другую комнату.
    // Если пользователь покинул комнату и там был еще один, то мы его оповещаем о
    // уходе второго.
    // Process all rooms, need remove user from old rooms and update socket in
    // current room.
    let currentRoomName = BattleOperations.getSocketRoom(data);
    if (!currentRoomName) {
        throw new ExtError('01201', 'internal_error', 'User not in provided battle', {socketId : data.socketId});
    }
    for (let roomName in Room.getRooms()) {
        let room = Room.getRoom(roomName);
        let players = room.getPlayers();
        if (players) {
            // If we already in room
            let existingUserSocketId = userCallbacks.findUserInUsers(user.userId, players);
            if (existingUserSocketId) {
                if (room.roomName === currentRoomName) {
                    // User with such socket id already in players, need update socket id if needed.
                    if (existingUserSocketId !== data.socketId) {
                        // Update socket id in players.
                        let oldUserState = Object.assign({}, players[existingUserSocketId]);
                        oldUserState.socketId = data.socketId;
                        oldUserState.disconnectTime = 0;
                        oldUserState.status = states.userState.ACTIVE;

                        // remove old player.
                        room.removePlayer(existingUserSocketId);
                        // Save old state.
                        room.createPlayer(oldUserState);
                        players[data.socketId] = oldUserState;

                        Logger.logDebugMessage('Change socket ' + existingUserSocketId + ' to ' + data.socketId + ' for user ' + oldUserState.userName);
                        result = existingUserSocketId;
                    }
                }
                // This is old room, we should remove user from room.
                // Мы используем такой вариант сейчас, выкидываем из старого поединка при
                // входе в новый, потому что запретить заходить в новый поединок пока что
                // сложнее.
                else {
                    // Set battle as broken.

                    // If there are two users in room
                    if (Object.keys(players).length > 1) {

                        // Then we send for second player notification about fitst player
                        // disconnection.
                        let secondUserPlayerSocketId = getSecondPlayerSocketId(players, existingUserSocketId);
                        // @todo change to ExtError.
                        input.emit('info', { socketId : secondUserPlayerSocketId, data : {status : 'error', code : '00500', message : 'second_user_disconnected'}});
                    }

                    // Remove room.
                    room.removeRoom(states.roomState.ERROR)
                }
            }
        }
        else {
            // Remove room without players.
            room.removeRoom(states.roomState.ERROR);
        }

    }

    return result;
}

function processBalanceErrors(room, errors) {
    for (let userId in errors) {
        let socketId = userCallbacks.findUserInUsers(userId, room.getPlayers());
        // If we have such user.
        if (socketId && errors[userId].code !== undefined) {
            switch(errors[userId].code) {
                case 42220:
                    input.emit('info', { socketId : socketId, data : {
                        status : 'error',
                        code : '01601',
                        message : 'not_enough_balance'
                    }});
                    break;
                default:
                    Logger.logErrorMessage('Request from backend (processBalanceErrors) send undefined error code: ' + errors[userId].code, errors[userId]);
                    break;
            }
        }
        else {
            Logger.logErrorMessage('User from backend (processBalanceErrors) missed in players', errors[userId]);
        }
    }
}

/**
 * Clearing empty rooms.
 *
 * Clear old players in old rooms.
 */
function processEmptyRooms() {
    // Global process old rooms and old players, remove disconnected players from
    // all rooms. After initialization of node server we should wait some time for
    // user reconnection before clearing rooms.

    for (let roomName in Room.getRooms()) {
        let room = Room.getRoom(roomName);
        let players = room.getPlayers();

        // If players in stored rooms state.
        if (players) {
            // Checking that all users still active and present in globalUsers.
            for (let sockId in players) {
                // We have here only one user.
                // If such user not present in global users, it's mean that he
                // already disconnected.
                if (globalUsers[sockId] === undefined || globalUsers[sockId] === null) {

                    // Remove player from room.
                    if (players[sockId] !== undefined) {

                        Logger.logDebugMessage('Removed player (processEmptyRooms) ' + sockId + ' from room ' +
                          + room.battleId + ' because not found in global users.');

                        room.removePlayer(sockId);
                    }
                }
            }

            let playersCount = room.getPlayersCount();

            if (!playersCount) {
                // Update battle status to error, because we already haven't players in room.
                room.removeRoom(states.roomState.ERROR);
                continue; // next room.
            }

            if (playersCount === 1) {

                if (room.getRoomState() !== states.roomState.WAITING_USERS) {
                    // if user only one in room not in waiting status, then second user was disconnected.
                    // We should check all players in room.
                    for (let sockId in players) {
                        // And send second user info, that second user was disconnected.
                        input.emit('info', {socketId : sockId, data : {status : 'error', code : '00502', message : 'second_user_disconnected'}});
                        Logger.logDebugMessage('Second user in battle ' + room.battleId + ' was disconnected', room, true);
                    }

                    room.removeRoom(states.roomState.ERROR);
                }
                else {
                    // if user in waiting status, then it's normal. he should be
                    // active user.
                }

            }
            // else {
            //     // We should check all players in room.
            //     for (let sockId in players) {
            //
            //         // If such user not present in global users, it's mean that he
            //         // already disconnected.
            //         if (globalUsers[sockId] === undefined || globalUsers[sockId] === null) {
            //             // Remove player from room.
            //             if (players[sockId] !== undefined) {
            //
            //                 Logger.logDebugMessage('Removed player (processEmptyRooms) ' + sockId + ' from room ' +
            //                   + room.battleId + ' because not found in global users.', players[sockId]);
            //
            //                 room.removePlayer(sockId);
            //             }
            //
            //             // If in room we have second user, we will say him, that second
            //             // user was disconnected and battle finished (broken).
            //             let secondPlayer = room.getSecondPlayer(sockId);
            //             if (secondPlayer) {
            //                 input.emit('info', {socketId : secondPlayer, data : {status : 'error', code : '00501', message : 'second_user_disconnected'}})
            //             }
            //
            //             // Remove room if there is now only one player or nobody.
            //             removeRoom(room, 'error');
            //             break;
            //         }
            //     }
            // }
        }
        else {
            // Update battle status to error, because we already haven't players in room.
            room.removeRoom(states.roomState.ERROR);
        }
    }
}

/**
 * Process users, which left rooms or website.
 */
function processDisconnectedUsers() {
    let date = new Date();

    // Process global users.
    for (let socketId in globalUsers) {
        // Increase timer of all disconnected users.
        if (globalUsers[socketId].status === states.userState.DISCONNECTED) {

            // If user disconnect time already too much, we should remove it from global
            // users array and process all rooms.
            if (Math.abs(globalUsers[socketId].disconnectTime - date) >= (staticConfig.timeBeforeDisconnect * 1000)) {
                processDisconnectedUser(socketId);
            }
        }
    }
}

/**
 * Process players, which disconnected when 60 secs gone.
 *
 * @param socketId
 */
function processDisconnectedUser(socketId) {
    // Remove user from global users.
    delete globalUsers[socketId];

    // Search user in rooms.
    for (let roomName in Room.getRooms()) {
        let room = Room.getRoom(roomName);

        try {
            if (!room) {
                throw new ExtError('00101', 'client_error', 'session_not_exist', {socketId : socketId});
            }

            // When one minute is gone, then on waiting screen we should remove
            // player and cancel battle if it was first user, and only remove
            // player if it was second user. Not in waiting screen we should
            // remove player and cancel battle.

            // If player present in such room.
            if (room.getPlayer(socketId)) {

                // If we on waiting screen, then we not wait a minute after user
                // disconnect and we not cancel battle, when second user disconnected.
                if (room.getRoomState() === states.roomState.WAITING_USERS) {
                    let firstPlayerId = room.getFirstPlayerId();
                    let secondPlayerId = room.getSecondPlayerId();

                    // If room was with status WAITING, then we should remove player
                    // and cancel battle.
                    if (socketId === firstPlayerId) {
                        room.removePlayerAndCancelBattle(socketId);
                    }
                    else if (socketId === secondPlayerId) {
                        room.removePlayer(socketId);
                    }
                    else {
                        throw new ExtError('01002', 'internal_error', 'Try to cancel battle when such player not first and not second', room);
                    }
                }
                // If we not on waiting screen, then we remove player and cancel battle.
                else {
                    room.removePlayerAndCancelBattle(socketId);
                }
            }
        }
        catch (error) {
            if (error.name !== 'ExtError') {
                error.context = room;
            }
            ExtError.handleErrors(error);
        }

    }
}

/**
 * Update info in globalUsers array.
 *
 * @param data
 */
function updateGlobalUsers(data) {
    globalUsers[data.socketId] = {
        socketId : data.socketId,
        userName : data.userName,
        userId : data.userId,
        workspaceId : data.workspaceId,
        role : null,
        can_talk : true,
        roundTime : staticConfig.userRoundTime,
        status : states.userState.ACTIVE,
        disconnectTime : 0,
        checkedDevices : false,
        self_refereeing : false,
        assessment : false,
        // recordEnabled : null,
    };
}

function getSecondPlayerSocketId(roomUsers, firstSocketId) {
    for (let socket_id in roomUsers) {
        if (socket_id !== firstSocketId) {
            return socket_id;
        }
    }
    return false;
}

function processBattlePage(inputData) {
    // If we in players after INIT, it's mean that NODEJS server
    // was corrupted or page was reloaded and reineted again,
    // so we already exist in players. We should append new socket
    // to room, update socket in players, send opentok credentials
    // to user and append trigger to change-player.
    let room = Room.getRoom(inputData.sessionId);
    if (!room) {
        throw new ExtError('00101', 'client_error', 'session_not_exist', {socketId : inputData.socketId});
    }

    let players = room.getPlayers();
    if (players && userCallbacks.findUserInUsers(inputData.userId, players)) {
        if (globalUsers[inputData.socketId] === undefined) {
            throw new ExtError('01212', 'internal_error', 'User already fully disconnected and can\'t be joined to room', {socketId : inputData.socketId, errorId: '01212'});
        }
        else if (globalUsers[inputData.socketId].status === states.userState.DISCONNECTED) {
            throw new ExtError('01213', 'internal_error', 'User disconnected recently and can\'t be joined to room', {socketId : inputData.socketId, user: globalUsers[inputData.socketId], errorId: '01213'});
        }

        // Join user to room according to session.
        input.emit('join_room',
            {
                socketId : inputData.socketId,
                room :  inputData.sessionId,
                data : inputData,
                callback : processBattlePageCallback.bind(null, room)
            }
        );
    }
    // If we not in players, so it's simple init and we should not
    // join to session.
    else {
        // We on battle page, but not player, so we see button "join to battle".
        // initializeBecomePlayerEvent(socket);

        // It's New status of room for this user.
        input.emit('info', { socketId : inputData.socketId, room :  inputData.sessionId, data : {status : 'success', data : {state : states.roomState.NEW}}});
    }
}

/**
 * Validate and init connected user.
 *
 * @param inputData
 */
function processJoinBattle(inputData) {
    try {
        let room = Room.getRoom(inputData.sessionId);
        if (!room) {
            throw new ExtError('00102', 'client_error', 'session_not_exist', {socketId : inputData.socketId});
        }

        let players = room.getPlayers();

        // If we try to connect to session, we check if we already in
        // room, so connect, or if there is not full room, then connect.
        if (players) {
            let already_inside = userCallbacks.findUserInUsers(globalUsers[inputData.socketId].userId, players);
            if (already_inside || (!already_inside && Object.keys(players).length < staticConfig.maxPlayersInRoom)) {
                if (globalUsers[inputData.socketId] === undefined) {
                    throw new ExtError('01214', 'internal_error', 'User already fully disconnected and can\'t be joined to room', {socketId : inputData.socketId, errorId: '01214'});
                }
                else if (globalUsers[inputData.socketId].status === states.userState.DISCONNECTED) {
                    throw new ExtError('01215', 'internal_error', 'User disconnected recently and can\'t be joined to room', {socketId : inputData.socketId, user: globalUsers[inputData.socketId], errorId: '01215'});
                }

                // Join user to room according to session.
                input.emit('join_room',
                  {
                      socketId : inputData.socketId,
                      room :  inputData.sessionId,
                      data : inputData,
                      callback : processBattleJoinCallback.bind(null, inputData.sessionId)
                  }
                );
            }
            else {
                // Send same message for user that he can't connect.
                throw new ExtError('00800', 'client_error', 'max_players_in_room', {socketId : inputData.socketId});
            }
        }
        else {
            if (globalUsers[inputData.socketId] === undefined) {
                throw new ExtError('01216', 'internal_error', 'User already fully disconnected and can\'t be joined to room', {socketId : inputData.socketId, errorId: '01216'});
            }
            else if (globalUsers[inputData.socketId].status === states.userState.DISCONNECTED) {
                throw new ExtError('01217', 'internal_error', 'User disconnected recently and can\'t be joined to room', {socketId : inputData.socketId, user: globalUsers[inputData.socketId], errorId: '01217'});
            }

            input.emit('join_room',
              {
                  socketId : inputData.socketId,
                  room :  inputData.sessionId,
                  data : inputData,
                  callback : processBattleJoinCallback.bind(null, inputData.sessionId)
              }
            );
        }
    }
    catch (error) {
        if (error.name !== 'ExtError') {
            error.context = inputData;
        }
        ExtError.handleErrors(error);
    }
}

function processBattlePageCallback(room, data) {
    Logger.logDebugMessage('processBattlePageCallback', data);
  // Actions after joining to room.

  // Update player's sockets. Should be executed after updating
  // global rooms, becase we search players in existing rooms.
  updateExistingPlayers(data);

  // Send first time state of room to clients after join_battle and
  // refresh page.
  // @todo recheck.
    process.nextTick(function () {
        stateHandler.emit('room-updated', room);
    });

    // Ask user to reconnect.
    input.emit('reconnect', {
        socketId : data.socketId, data : {
            status : 'success',
            data : {
                type : 'reconnect',
                data : {
                    enable : true,
                },
            }
        }
    });

    // Ask user to disable reconnect.
    Logger.logDebugMessage('Ask user ' + data.socketId + ' reconnect event,' +
        ' that user should ENABLE reconnect flag', this);

    let classList = '';
    if (data.socketId === room.getFirstPlayerId()) {
        classList = 'container__stream--left';
    }
    else if (data.socketId === room.getSecondPlayerId()) {
        classList = 'container__stream--right';
    }

  // Get Opentok credentials from backend and send it to socket.
  callbacks.getOpentokCredentials(
    room.roomName, data.workspaceId, classList,
    sendOpentokDataCallback.bind(null, data.socketId)
  );

  // Update timers before sending to client.
  room.updateTimer();
  input.emit('info', {socketId : room.roomName, data : {status : 'success', data : room}});
}

function processBattleJoinCallback(roomName, inputData) {
    Logger.logDebugMessage('processBattleJoinCallback', inputData);
    // Actions after joining to room.

    // Update global rooms. Should be executed after joining to room.
    BattleOperations.createRoomInGlobalIfNeeded(inputData);

    // Update player's sockets. Should be executed after updating
    // global rooms, because we search players in existing rooms.
    updateExistingPlayers(inputData);

    // Ask user to reconnect.
    input.emit('reconnect', {
        socketId : inputData.socketId, data : {
            status : 'success',
            data : {
                type : 'reconnect',
                data : {
                    enable : true,
                },
            }
        }
    });

    // Ask user to disable reconnect.
    Logger.logDebugMessage('Ask user ' + inputData.socketId + ' reconnect event,' +
        ' that user should ENABLE reconnect flag', this);

    // Get Opentok credentials from backend and send it to socket.
    let room = Room.getRoom(roomName);
    let classList = '';
    if (inputData.socketId === room.getFirstPlayerId()) {
        classList = 'container__stream--left';
    }
    else {
        classList = 'container__stream--right';
    }
    callbacks.getOpentokCredentials(
      roomName, inputData.workspaceId, classList,
      sendOpentokDataCallback.bind(null, inputData.socketId)
    );

    // Fill players only for become player.
    BattleOperations.appendNewPlayer(inputData, 'join_room');
}

function sendOpentokDataCallback(socketId, data) {
  // Send opentok credentials to user.
  input.emit('conf_credentials', {socketId : socketId, data : {status : 'success', data : data}});
}

/**
 *
 * @param input
 */
function initializeInputHandlers(input) {
    // Rest API events.

    // When backend server said as that battle finished.
    backEmitter.on('results-ready', function (inputData) {
        try {
            Logger.logDebugMessage('Backend said that battle ' + inputData.battleId + ' finished refereeing', inputData);
            ValidateController.valueExist(inputData.battleId,'00615', 'backend_error', "missed_battle_id",{socketId : inputData.socketId});

            let room = Room.getRoomByBattleId(inputData.battleId);
            if (!room) {
                throw new ExtError('00616', 'backend_error', 'Room with such battle id already missed in NodeJS server', {inputData : inputData});
            }

            // if status ERROR, then we can't change it.
            if (room.getRoomState() === states.roomState.AS_AND_SR
                || room.getRoomState() === states.roomState.SELF_REFEREEING
            ) {
                room.updateRoomState(states.roomState.COMPLETED);
            }
            else if (room.getRoomState() === states.roomState.ASSESMENT) {
                room.updateRoomState(states.roomState.COMPLETED_WAITING_JUDGEMENT);
            }

        }
        catch (error) {
            if (error.name !== 'ExtError') {
                error.context = inputData;
            }
            ExtError.handleErrors(error);
        }
    });
    // When backend server said that group should be removed.
    backEmitter.on('remove-group', function (inputData) {
        try {
            Logger.logDebugMessage('Backend said that group ' + inputData.groupId + ' should be removed', inputData);
            ValidateController.valueExist(inputData.groupId,'00622', 'backend_error', "missed_group_id",{socketId : inputData.socketId});

            let group = MatchingGroup.getGroup(inputData.groupId);
            if (!group) {
                throw new ExtError('00623', 'backend_error', 'Group not found', {inputData : inputData});
            }

            group.remove();
        }
        catch (error) {
            if (error.name !== 'ExtError') {
                error.context = inputData;
            }
            ExtError.handleErrors(error);
        }
    });

    // SocketIO events.

    // When user connected.
    input.on('connect', function (inputData) {
        try {
            Logger.logDebugMessage('User ' + inputData.userName + '(' + inputData.socketId + ') connected, page: '
                + inputData.currentPage + ', initiator: ' + inputData.initiator, inputData);
            ValidateController.authValidate(inputData);

            // Check if we already in global users and set other sockets as disconnected.
            let foundedOldUsersSockets = userCallbacks.findSocketsInGlobalUsers(inputData.userId);
            if (foundedOldUsersSockets.length > 0) {
                foundedOldUsersSockets.forEach((socketId) => {
                    userCallbacks.appendDisconnectedGlobalUser(socketId);
                });
            }

            // Append new user to globalUsers.
            updateGlobalUsers(inputData);

            // Process simple battle connection.
            if (inputData.currentPage === 'battle-page') {
                // Connect on battle page will return or join to battle.

                ValidateController.valueExist(inputData.sessionId,'00510', 'client_error', "missed_session_id",{socketId : inputData.socketId});
                ValidateController.valueExist(inputData.battleId,'00520', 'client_error', "missed_battle_id",{socketId : inputData.socketId});

                // Join user to room after reconnecting.
                // We are on battle display.
                let getSessionsPromise = callbacks.getSessions(inputData.workspaceId);
                getSessionsPromise
                  .then(ValidateController.sessionsValidate.bind(null, inputData))
                  .then(processBattlePage.bind(null, inputData))
                  .then(() => {
                      input.emit('full-connected', {socketId : inputData.socketId, data : {}});
                  })
                  .catch(ExtError.handleErrors);
            }
            // Reconnect part.
            else if (inputData.currentPage !== 'battle-page' && inputData.initiator === 'reconnect') {
                // Search socket in rooms and send info to user about this.
                let date = new Date();
                let foundedPlayerData = Room.findMeInOtherForgottenRooms(inputData.socketId);
                if (foundedPlayerData) {
                    let remainingTime = staticConfig.timeBeforeDisconnect - Math.floor(Math.abs(globalUsers[foundedPlayerData.socketId].disconnectTime - date)/1000);

                    // // Update players in all rooms, where userId playing.
                    // updateExistingPlayers(inputData);

                    // Send user info about forgotten battle.
                    input.emit('reconnect', {
                        socketId : inputData.socketId,
                        data : {
                            status : 'success',
                            data : {
                                type : 'forgotten-battle',
                                data : {
                                    battleId : foundedPlayerData.room.battleId,
                                    timerBeforeDisconnect : remainingTime,
                                }
                            }
                        }
                    });

                    // Ask user to disable reconnect.
                    Logger.logDebugMessage('Send user ' + inputData.socketId + ' reconnect event,' +
                        ' that battle found', this);
                }
                else {
                    // Ask user to disable reconnect when we not founded
                    // forgotten battles in reconnect mode.
                    input.emit('reconnect',
                      {
                          socketId : inputData.socketId,
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

                    // Ask user to disable reconnect.
                    Logger.logDebugMessage('Ask user ' + inputData.socketId + ' reconnect event,' +
                        ' that user should remove reconnect flag', this);

                }
                input.emit('full-connected', {socketId : inputData.socketId, data : {}});
            }
        }
        catch (error) {
            if (error.name !== 'ExtError') {
                error.context = inputData;
            }
            ExtError.handleErrors(error);
        }
    });

    // When user disconnected
    input.on('disconnect', function(inputData) {
        try {
            Logger.logDebugMessage('User ' + inputData.userName + '(' + inputData.socketId + ') disconnected', inputData);
            // Set user as disconnected, he will be disconnected
            // in TIME_BEFORE_DISCONNECT time in processDisconnectedUsers.
            /** @see processDisconnectedUsers. */
            userCallbacks.appendDisconnectedGlobalUser(inputData.socketId);

            // Mark players as disconnected already now to avoid room processing.
            Room.markPlayersAsDisconnected(inputData.socketId);

            // Remove user from tournaments group if needed.
            if (globalUsers[inputData.socketId] !== undefined && globalUsers[inputData.socketId].groupId !== undefined) {
                let group = MatchingGroup.getGroup(globalUsers[inputData.socketId].groupId);
                if (group) {
                    group.removeUserFromGroup(globalUsers[inputData.socketId].userId);

                    // Remove timeoperations, if they present, because if user left queue, we don't need match them again.
                    TimeOperation.removeTimeOperation('matching', inputData.userId);
                }
            }
        }
        catch (error) {
            if (error.name !== 'ExtError') {
                error.context = inputData;
            }
            ExtError.handleErrors(error);
        }

    });

    // When some page visited.
    input.on('page-visit', function(inputData) {
        Logger.logDebugMessage('User ' + inputData.userName + '(' + inputData.socketId + ') visited page' + inputData.page, inputData);
        try {
            ValidateController.authValidate(inputData);
            ValidateController.valueExist(inputData.page,'00550', 'client_error', "missed_page",{socketId : inputData.socketId});

            if (inputData.page === 'tournament') {
                ValidateController.valueExist(inputData.data,'00551', 'client_error', "missed_data",{socketId : inputData.socketId});
                ValidateController.valueExist(inputData.data.tournamentId,'00552', 'client_error', "missed_tournament_id",{socketId : inputData.socketId});
                ValidateController.valueExist(inputData.data.phaseId,'00553', 'client_error', "missed_phase_id",{socketId : inputData.socketId});

                TimeOperation.removeTimeOperation('remove-page-visit-status', inputData.userId);

                globalUsers[inputData.socketId].page = inputData.page;
                globalUsers[inputData.socketId].pageData = inputData.data;

                // Time operation to remove current page status.
                let eventDate = new Date(Date.now() + 60*10*1000);
                let removePageVisitOp = new TimeOperation(
                  'remove-page-visit-status',
                  inputData.userId,
                  eventDate,
                  {userId : inputData.userId}
                );
                TimeOperation.addTimeOperationToGlobal(removePageVisitOp);

            }
        }
        catch (error) {
            if (error.name !== 'ExtError') {
                error.context = inputData;
            }
            ExtError.handleErrors(error);
        }
    });

    // When battle created.
    input.on('battle', function(inputData) {
        Logger.logDebugMessage('User ' + inputData.userName + '(' + inputData.socketId + ') search opponent with case id ' + inputData.caseId, inputData);
        try {
            ValidateController.authValidate(inputData);
            ValidateController.valueExist(inputData.caseId,'00700', 'client_error', "missed_case_id",{socketId : inputData.socketId});

            // Request to find opponents in case and processing.
            callbacks.findOpponentCase(
              inputData.workspaceId,
              processMatchingGroups.bind(null, inputData),
              globalUsers[inputData.socketId],
              inputData.caseId,
            );
        }
        catch (error) {
            if (error.name !== 'ExtError') {
                error.context = inputData;
            }
            ExtError.handleErrors(error);
        }
    });

    // When user connected to already created battle.
    // @todo - deprecated
    input.on('join-battle', function(inputData) {
        Logger.logDebugMessage('User ' + inputData.userName + '(' + inputData.socketId + ') try to join battle №' + inputData.battleId, inputData);
        try {
            ValidateController.authValidate(inputData);
            ValidateController.valueExist(inputData.sessionId,'00511', 'client_error', "missed_session_id",{socketId : inputData.socketId});
            ValidateController.valueExist(inputData.battleId,'00521', 'client_error', "missed_battle_id",{socketId : inputData.socketId});

            // Validate user session, init socketio handlers, send opentok
            // credentials to user, createRoomInGlobalIfNeeded and updateExistingPlayers
            let getSessionsPromise = callbacks.getSessions(inputData.workspaceId);
            getSessionsPromise
                .then(ValidateController.sessionsValidate.bind(null, inputData))
                .then(processJoinBattle.bind(null, inputData))
                .catch(ExtError.handleErrors);
        }
        catch (error) {
            if (error.name !== 'ExtError') {
                error.context = inputData;
            }
            ExtError.handleErrors(error);
        }
    });

    // When user want left already created battle.
    input.on('cancel-battle', function(inputData) {
        Logger.logDebugMessage('User ' + inputData.userName + '(' + inputData.socketId + ') try to cancel battle №' + inputData.battleId, inputData);
        try {
            ValidateController.authValidate(inputData);
            ValidateController.valueExist(inputData.battleId, '00530', 'client_error', "missed_battle_id",{socketId : inputData.socketId});

            let isReconnect = inputData.initiator === 'reconnect',
                isBattlePage = inputData.currentPage === 'battle-page',
                isCasePage = inputData.currentPage === 'case-page',
                initiatorSocketId = inputData.socketId,
                room = false;

            // If we on battle page, or if we joined to battle from case page thru join button.
            if (isBattlePage || (isCasePage && !isReconnect)) {
                let roomName = BattleOperations.getSocketRoom(inputData);

                if (!roomName) {
                    throw new ExtError('01204', 'internal_error', 'User not in provided battle', {inputData: inputData});
                }

                room = Room.getRoom(roomName);
            }
            else if (isReconnect) {
                let foundedPlayerData = Room.findMeInOtherForgottenRooms(initiatorSocketId);

                if (!foundedPlayerData && !foundedPlayerData.room) {
                    throw new ExtError('01502', 'client_error', 'Cant cancel battle, where are you not a player', {socketId : initiatorSocketId});
                }

                room = foundedPlayerData.room;
            }
            else {
                throw new ExtError('01501', 'client_error', 'Cant cancel battle with such currentPage and initiator params', {socketId : initiatorSocketId});
            }

            if (!room) {
                throw new ExtError('00106', 'client_error', 'session_not_exist', {socketId : initiatorSocketId});
            }

            let firstPlayerId = room.getFirstPlayerId();
            let secondPlayerId = room.getSecondPlayerId();
            // @todo: simplify.
            // @todo: wrong condition.
            if ((initiatorSocketId !== firstPlayerId) || (initiatorSocketId !== secondPlayerId)) {
                // @todo: rephrase message.
                // throw new ExtError('01003', 'internal_error', 'Try to cancel battle by player when such player not first and not second', room);
            }

            // Remove player and cancel battle.
            room.removePlayerAndCancelBattle(initiatorSocketId, states.roomState.CANCELLED);
        }
        catch (error) {
            if (error.name !== 'ExtError') {
                error.context = inputData;
            }
            ExtError.handleErrors(error);
        }
    });

    // Flag that user checked his devices.
    input.on('device-checked', function(inputData) {
        Logger.logDebugMessage('User ' + inputData.userName + '(' + inputData.socketId + ') said that device checked in battle: ' + JSON.stringify(inputData.battleId), inputData);
        try {
            ValidateController.authValidate(inputData);
            ValidateController.valueExist(inputData.battleId, '00540', 'client_error', "missed_battle_id",{socketId : inputData.socketId});

            let roomName = BattleOperations.getSocketRoom(inputData);

            if (!roomName) {
                throw new ExtError('01206', 'internal_error', 'User not in provided battle', {socketId : inputData.socketId});
            }

            let room = Room.getRoom(roomName);
            if (!room) {
                throw new ExtError('00107', 'client_error', 'session_not_exist', {socketId : inputData.socketId});
            }

            let player = room.getPlayer(inputData.socketId);
            if (!player) {
                throw new ExtError('01207', 'internal_error', 'User not in provided battle', {socketId : inputData.socketId});
            }

            player.checkedDevices = true;
            room.updatePlayer(inputData.socketId, player);

            let secondPlayer = room.getSecondPlayer(inputData.socketId);
            if (secondPlayer === false
              || (secondPlayer !== false && !secondPlayer.checkedDevices)) {
                // Send second state to client. We should see waiting screen.
                input.emit('info', {socketId : inputData.socketId, data : {status : 'success', data : room}});
            }
        }
        catch (error) {
            if (error.name !== 'ExtError') {
                error.context = inputData;
            }
            ExtError.handleErrors(error);
        }
    });

    // Flag that user's assessment done.
    input.on('assessment', function(inputData) {
        Logger.logDebugMessage('User ' + inputData.userName + '(' + inputData.socketId + ') said that he finished assessment: ' + JSON.stringify(inputData.battleId), inputData);
        try {
            ValidateController.authValidate(inputData);
            ValidateController.valueExist(inputData.battleId, '00541', 'client_error', "missed_battle_id",{socketId : inputData.socketId});

            let roomName = BattleOperations.getSocketRoom(inputData);

            if (!roomName) {
                throw new ExtError('01206', 'internal_error', 'User not in provided battle', {socketId : inputData.socketId});
            }

            let room = Room.getRoom(roomName);
            if (!room) {
                throw new ExtError('00107', 'client_error', 'session_not_exist', {socketId : inputData.socketId});
            }

            let player = room.getPlayer(inputData.socketId);
            if (!player) {
                throw new ExtError('01207', 'internal_error', 'User not in provided battle', {socketId : inputData.socketId});
            }

            player.assessment = true;
            room.updatePlayer(inputData.socketId, player);

        }
        catch (error) {
            if (error.name !== 'ExtError') {
                error.context = inputData;
            }
            ExtError.handleErrors(error);
        }
    });

    // Flag that user's self-refereeing done.
    input.on('self-refereeing', function(inputData) {
        Logger.logDebugMessage('User ' + inputData.userName + '(' + inputData.socketId + ') said that he finished refereeing: ' + JSON.stringify(inputData.battleId), inputData);
        try {
            ValidateController.authValidate(inputData);
            ValidateController.valueExist(inputData.battleId, '00542', 'client_error', "missed_battle_id",{socketId : inputData.socketId});

            let roomName = BattleOperations.getSocketRoom(inputData);

            if (!roomName) {
                throw new ExtError('01206', 'internal_error', 'User not in provided battle', {socketId : inputData.socketId});
            }

            let room = Room.getRoom(roomName);
            if (!room) {
                throw new ExtError('00107', 'client_error', 'session_not_exist', {socketId : inputData.socketId});
            }

            let player = room.getPlayer(inputData.socketId);
            if (!player) {
                throw new ExtError('01207', 'internal_error', 'User not in provided battle', {socketId : inputData.socketId});
            }

            player.self_refereeing = true;
            room.updatePlayer(inputData.socketId, player);

        }
        catch (error) {
            if (error.name !== 'ExtError') {
                error.context = inputData;
            }
            ExtError.handleErrors(error);
        }
    });

    // Event to create battle with random user and random case.
    input.on('random-battle', function(inputData) {
        Logger.logDebugMessage('User ' + inputData.userName + '(' + inputData.socketId + ') ask random battle', inputData);
        try {
            ValidateController.authValidate(inputData);

            let waitingRoom = Room.getWaitingRoom(inputData.workspaceId);
            if (waitingRoom) {
                if (globalUsers[inputData.socketId] === undefined) {
                    throw new ExtError('01218', 'internal_error', 'User already fully disconnected and can\'t be joined to room', {socketId : inputData.socketId, errorId: '01218'});
                }
                else if (globalUsers[inputData.socketId].status === states.userState.DISCONNECTED) {
                    throw new ExtError('01219', 'internal_error', 'User disconnected recently and can\'t be joined to room', {socketId : inputData.socketId, user: globalUsers[inputData.socketId], errorId: '01219'});
                }

                input.emit('join_room',
                  {
                      socketId : inputData.socketId,
                      room :  waitingRoom.roomName,
                      data : inputData,
                      callback : processBattleJoinCallback.bind(null, waitingRoom.roomName)
                  }
                );

                // Send to user command to go to battle page.
                input.emit('join_to_battle', {socketId : inputData.socketId, data : {status : 'success', data : {battle : {id : waitingRoom.battleId, tokbox_session_id : waitingRoom.roomName}}}});
            }
            else {
                // Request to create battle in backend, join user to battle and
                // ask user redirect to battle page.
                callbacks.createBattle(
                  joinNewRoomSingle.bind(null, inputData.socketId, inputData.startState),
                  {
                      workspaceId: inputData.workspaceId,
                      userId: globalUsers[inputData.socketId].userId,
                      userName: globalUsers[inputData.socketId].userName
                  }
                );
            }


        }
        catch (error) {
            if (error.name !== 'ExtError') {
                error.context = inputData;
            }
            ExtError.handleErrors(error);
        }
    });

    // Event to stay in queue and match user in random tournament.
    input.on('random-tournament-battle', function(inputData) {
        Logger.logDebugMessage('User ' + inputData.userName + '(' + inputData.socketId + ') ask random tournament battle', inputData);
        try {
            ValidateController.authValidate(inputData);

            if (inputData.currentPage !== 'tournament-page') {
                throw new ExtError('01504', 'client_error', 'Unexpected currentPage argument for random-tournament-battle', {currentPage: inputData.currentPage, socketId : inputData.socketId});
            }

            // Request to find opponents in tournament and processing.
            callbacks.findOpponentIos(
                inputData.workspaceId,
                processMatchingGroups.bind(null, inputData),
                globalUsers[inputData.socketId],
            );

        }
        catch (error) {
            if (error.name !== 'ExtError') {
                error.context = inputData;
            }
            ExtError.handleErrors(error);
        }
    });

    // Event to stay in queue and match user in specified tournament.
    input.on('tournament-battle', function(inputData) {
        Logger.logDebugMessage('User ' + inputData.userName + '(' + inputData.socketId + ') ask tournament battle', inputData);
        try {
            ValidateController.authValidate(inputData);
            ValidateController.valueExist(inputData.tournamentId, '00543', 'client_error', "missed_tournament_id",{socketId : inputData.socketId});
            ValidateController.valueExist(inputData.phaseId, '00544', 'client_error', "missed_phase_id",{socketId : inputData.socketId});

            if (inputData.currentPage !== 'tournament-page') {
                throw new ExtError('01504', 'client_error', 'Unexpected currentPage argument for tournament-battle', {currentPage: inputData.currentPage, socketId : inputData.socketId});
            }

            Logger.logDebugMessage('User ' + inputData.userName + '(' + inputData.socketId + '). Tournament battle. Validation passed', inputData);

            // Request to find opponents in tournament and processing.
            callbacks.findOpponentTournament(
                inputData.workspaceId,
                processMatchingGroups.bind(null, inputData),
                globalUsers[inputData.socketId],
                inputData.tournamentId,
                inputData.phaseId,
            );

        }
        catch (error) {
            if (error.name !== 'ExtError') {
                error.context = inputData;
            }
            ExtError.handleErrors(error);
        }
    });

    // Event to left tournament queue.
    input.on('left-tournament-queue', function(inputData) {
        try {
            Logger.logDebugMessage('User ' + inputData.userName + '(' + inputData.socketId + ') ask left tournament queue', inputData);

            ValidateController.authValidate(inputData);

            if (inputData.currentPage !== 'tournament-page') {
                throw new ExtError('01504', 'client_error', 'Unexpected currentPage argument for left-tournament-queue', {currentPage: inputData.currentPage, socketId : inputData.socketId});
            }

            // Remove user from group, because user already matched.
            let groupId = globalUsers[inputData.socketId].groupId;
            if (groupId !== undefined && groupId !== null) {
                let group = MatchingGroup.getGroup(groupId);
                if (group) {
                    // Remove from group.
                    group.removeUserFromGroup(inputData.userId);
                    // Remove timeoperations, if they present, because if user left queue, we don't need match them again.
                    TimeOperation.removeTimeOperation('matching', inputData.userId);

                    // Clear flag.
                    globalUsers[inputData.socketId].groupId = null;
                }
                else {
                    throw new ExtError('01507', 'client_error', "Can't left tournament queue, because not in queue now", {groupId : groupId, socketId : inputData.socketId});
                }
            }
            else {
                throw new ExtError('01506', 'client_error', "Can't left tournament queue, because not in queue now", {user : globalUsers[inputData.socketId], socketId : inputData.socketId});
            }
        }
        catch (error) {
            if (error.name !== 'ExtError') {
                error.context = inputData;
            }
            ExtError.handleErrors(error);
        }
    });

    // Event to left battle queue.
    input.on('left-battle-queue', function(inputData) {
        try {
            Logger.logDebugMessage('User ' + inputData.userName + '(' + inputData.socketId + ') ask left battle queue', inputData);

            ValidateController.authValidate(inputData);

            // Remove user from group, because user already matched.
            let groupId = globalUsers[inputData.socketId].groupId;
            if (groupId !== undefined && groupId !== null) {
                let group = MatchingGroup.getGroup(groupId);
                if (group) {
                    // Remove from group.
                    group.removeUserFromGroup(inputData.userId);
                    // Clear flag.
                    globalUsers[inputData.socketId].groupId = null;
                }
                else {
                    throw new ExtError('01509', 'client_error', "Can't left battle queue, because not in queue now", {groupId : groupId, socketId : inputData.socketId});
                }
            }
            else {
                throw new ExtError('01510', 'client_error', "Can't left battle queue, because not in queue now", {user : globalUsers[inputData.socketId], socketId : inputData.socketId});
            }
        }
        catch (error) {
            if (error.name !== 'ExtError') {
                error.context = inputData;
            }
            ExtError.handleErrors(error);
        }
    });

    // Event to get active users count.
    input.on('active-users-count', function(inputData, backCallback) {
        try {
            Logger.logDebugMessage('User ' + inputData.userName + '(' + inputData.socketId + ') ask count of active users', inputData);

            ValidateController.authValidate(inputData);

            if (inputData.type !== undefined && inputData.type === 'tournament') {
                ValidateController.valueExist(inputData.data, '00545', 'client_error', "missed_data",{socketId : inputData.socketId});
                ValidateController.valueExist(inputData.data.tournamentId, '00546', 'client_error', "missed_tournament_id",{socketId : inputData.socketId});
                ValidateController.valueExist(inputData.data.phaseId, '00547', 'client_error', "missed_phase_id",{socketId : inputData.socketId});
                backCallback(userCallbacks.getTournamentCountActiveUsers(inputData.workspaceId, inputData.data.tournamentId, inputData.data.phaseId));
            }
            else {
                backCallback(userCallbacks.getCountActiveUsers(inputData.workspaceId));
            }
        }
        catch (error) {
            if (error.name !== 'ExtError') {
                error.context = inputData;
            }
            ExtError.handleErrors(error);
        }
    });

    // Special event, don't touch.
    input.on('call-callback', function (inputData) {
        inputData.callback(inputData);
    });
}

/**
 * Send players to backend (save to battle).
 * @param room
 */
function getParticipants(room) {
    // Send players to backend.
    try {
        let participants = [];
        if (room !== undefined) {
            // We can't take players property, because there bad order.
            let firstPlayerSocketId = room.getFirstPlayerId();
            if (firstPlayerSocketId) {
                let firstPlayer = room.getPlayer(firstPlayerSocketId);
                participants.push({
                    profile_id : firstPlayer.userId,
                    username : firstPlayer.userName,
                });
            }

            let secondPlayerSocketId = room.getSecondPlayerId();
            if (secondPlayerSocketId) {
                let secondPlayer = room.getPlayer(secondPlayerSocketId);
                participants.push({
                    profile_id : secondPlayer.userId,
                    username : secondPlayer.userName,
                });
            }

            if (participants.length > 0) {
                return participants;
            }
            else {
                throw new ExtError('01002', 'internal_error', 'getParticipants error, FirstPlayerId and SecondPlayerId in room param empty' + JSON.stringify(room), room);
            }
        }
        else {
            throw new ExtError('01001', 'internal_error', 'getParticipants error, room param empty' + JSON.stringify(room), room);
        }
    }
    catch (error) {
        ExtError.handleErrors(error);
    }

    return false;
}

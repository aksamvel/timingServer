let https = require('https');
let fs = require('fs');
let ExtError = require('./extError');
let Logger = require('./Logger');

let userCallbacks = require('./user');
let MatchingGroup = require('./MatchingGroup');

// @todo integrate promises polyfill for old browsers.
// Promises library.
// let Promise = require('promise');

/**
 * Create new battle in backend and append user to created battle.
 *
 * @param createBattleCallback
 *  Success callback.
 *
 * @param params
 *   @param params.firstUser
 *    Should be null for random and tournament
 *   @param params.caseId
 *   @param params.type
 *   @param params.tournamentId
 *    should present only for tournament
 *   @param params.phaseId
 *    should present only for tournament
 *   @param params.secondUser
 */
exports.createBattle = function(createBattleCallback, params) {
  let raw_data = {
    participants : [{profile_id : params.firstUser.userId, username : params.firstUser.userName}],
  };
  if (params.secondUser !== undefined) {
    raw_data.participants.push({profile_id : params.secondUser.userId, username : params.secondUser.userName});
  }
  if (params.caseId) {
    raw_data.case_id = params.caseId;
  }
  if (params.type !==undefined && params.type === 'invite') {
    raw_data.type = 'invite';
  }
  else {
    raw_data.type = 'default';
  }

  if (params.tournamentId) {
    raw_data.tournament_id = params.tournamentId;
  }

  if (params.phaseId) {
    raw_data.phase_id = params.phaseId;
  }

  Logger.logDebugMessage('createBattle - params', params);
  Logger.logDebugMessage('createBattle - raw_data', JSON.stringify(raw_data));

  const data = JSON.stringify(raw_data);
  let url = '/api/v1/battle';

  const options = {
    hostname: DRUPAL_HOST,
    port: 443,
    path: url,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-WORKSPACE-ID' : params.firstUser.workspaceId,
      'X-API-AUTHORIZATION' : DRUPAL_BYPASS_AUTHORIZATION_TOKEN,
      // 'Content-Length': data.length
    }
  };

  const req = https.request(options, (res) => {

    let chunks = [];

    res.on('data', (chunk) => {
      chunks.push(chunk);
    }).on('end', function () {

      let data;
      try {
        data = Buffer.concat(chunks);
        let json = JSON.parse(data);

        if (json.status !== 'success') {
          throw new ExtError('00610', 'backend_error', 'Request to get answer from battle creation - status not success -' + json.status, json);

        }

        if (json.data === undefined) {
          throw new ExtError('00609', 'backend_error', 'Request to get answer from battle creation - data empty', json);
        }

        createBattleCallback(json.data);
      }
      catch (error) {
        // Return users to queue.
        if (params.firstUser.groupId !== undefined) {
          let group = MatchingGroup.getGroup(params.firstUser.groupId);
          if (group !== undefined) {
            group.appendUserToGroup(params.firstUser);
          }
        }
        if (params.secondUser.groupId !== undefined) {
          let group = MatchingGroup.getGroup(params.secondUser.groupId);
          if (group !== undefined) {
            group.appendUserToGroup(params.secondUser);
          }
        }

        if (error.name !== 'ExtError' && data !== undefined) {
          error.context = data.toString();
        }
        ExtError.handleErrors(error);
      }
    });
  });

  req.on('error', (error) => {
    // Return users to queue.
    if (params.firstUser.groupId !== undefined) {
      let group = MatchingGroup.getGroup(params.firstUser.groupId);
      if (group !== undefined) {
        group.appendUserToGroup(params.firstUser);
      }
    }
    if (params.secondUser.groupId !== undefined) {
      let group = MatchingGroup.getGroup(params.secondUser.groupId);
      if (group !== undefined) {
        group.appendUserToGroup(params.secondUser);
      }
    }

    Logger.logErrorMessage(error.stack);
  });

  req.write(data);
  req.end();
};

/**
 * Find groups for user in Tournament context.
 *
 * @param workspaceId
 *
 * @param user
 *  user fields (userId and userName)
 *
 * @param tournamentId
 * @param phaseId
 *
 * @param processGroupsCallback
 */
exports.findOpponentTournament = function(workspaceId, processGroupsCallback, user, tournamentId, phaseId) {
  const data = JSON.stringify({profile_id : user.userId});
  let url = '/api/v1/tournament/' + tournamentId + '/phase/' + phaseId + '/find-opponent';

  const options = {
    hostname: DRUPAL_HOST,
    port: 443,
    path: url,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-WORKSPACE-ID' : workspaceId,
      'X-API-AUTHORIZATION' : DRUPAL_BYPASS_AUTHORIZATION_TOKEN,
      // 'Content-Length': data.length
    }
  };

  const req = https.request(options, (res) => {

    let chunks = [];

    res.on('data', (chunk) => {
      chunks.push(chunk);
      // Logger.logDebugMessage('Find Opponent Tournament (T: ' + tournamentId + ', P: ' + phaseId + '): pushing chunks');

    }).on('end', function () {


      let data;
      try {
        data = Buffer.concat(chunks);
        let json = JSON.parse(data);

        Logger.logDebugMessage('Find Opponent Tournament (T: ' + tournamentId + ', P: ' + phaseId + '): data: ' + data);

        if (json.status !== 'success') {
          throw new ExtError('00617', 'backend_error', 'Request to get answer from findOpponentTournament - status not success -' + json.status, json);
        }

        if (json.data === undefined) {
          throw new ExtError('00618', 'backend_error', 'Request to get answer from findOpponentTournament - data empty', json);
        }

        processGroupsCallback(json.data);
      }
      catch (error) {
        if (error.name !== 'ExtError' && data !== undefined) {
          error.context = data.toString();
        }
        ExtError.handleErrors(error);
      }
    });
  });

  req.on('error', (error) => {
    Logger.logErrorMessage(error.stack);
  });

  req.write(data);
  req.end();
};


/**
 * Find groups for user in case context.
 *
 * @param workspaceId
 *
 * @param user
 *  user fields (userId and userName)
 *
 * @param caseId
 *
 * @param processGroupsCallback
 */
exports.findOpponentCase = function(workspaceId, processGroupsCallback, user, caseId) {
  const data = JSON.stringify({profile_id : user.userId});
  let url = '/api/v1/case/' + caseId + '/find-opponent';

  const options = {
    hostname: DRUPAL_HOST,
    port: 443,
    path: url,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-WORKSPACE-ID' : workspaceId,
      'X-API-AUTHORIZATION' : DRUPAL_BYPASS_AUTHORIZATION_TOKEN,
      // 'Content-Length': data.length
    }
  };

  const req = https.request(options, (res) => {

    let chunks = [];

    res.on('data', (chunk) => {
      chunks.push(chunk);
    }).on('end', function () {

      let data;
      try {
        data = Buffer.concat(chunks);
        let json = JSON.parse(data);

        if (json.status !== 'success') {
          throw new ExtError('00617', 'backend_error', 'Request to get answer from findOpponentTournament - status not success -' + json.status, json);
        }

        if (json.data === undefined) {
          throw new ExtError('00618', 'backend_error', 'Request to get answer from findOpponentTournament - data empty', json);
        }

        processGroupsCallback(json.data);
      }
      catch (error) {
        if (error.name !== 'ExtError' && data !== undefined) {
          error.context = data.toString();
        }
        ExtError.handleErrors(error);
      }
    });
  });

  req.on('error', (error) => {
    Logger.logErrorMessage(error.stack);
  });

  req.write(data);
  req.end();
};

/**
 * Find groups for user in Tournament context (for IOS).
 *
 * @param workspaceId
 *
 * @param user
 *  user fields (userId and userName)
 *
 * @param processGroupsCallback
 */
exports.findOpponentIos = function(workspaceId, processGroupsCallback, user) {
  const data = JSON.stringify({profile_id : user.userId});
  let url = '/api/v1/tournament/find-opponent-ios';

  const options = {
    hostname: DRUPAL_HOST,
    port: 443,
    path: url,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-WORKSPACE-ID' : workspaceId,
      'X-API-AUTHORIZATION' : DRUPAL_BYPASS_AUTHORIZATION_TOKEN,
      // 'Content-Length': data.length
    }
  };

  const req = https.request(options, (res) => {

    let chunks = [];

    res.on('data', (chunk) => {
      chunks.push(chunk);
    }).on('end', function () {

      let data;
      try {
        data = Buffer.concat(chunks);
        let json = JSON.parse(data);

        if (json.status !== 'success') {
          throw new ExtError('00617', 'backend_error', 'Request to get answer from findOpponentIOS - status not success -' + json.status, json);
        }

        if (json.data === undefined) {
          throw new ExtError('00618', 'backend_error', 'Request to get answer from findOpponentIOS - data empty', json);
        }

        processGroupsCallback(json.data);
      }
      catch (error) {
        if (error.name !== 'ExtError' && data !== undefined) {
          error.context = data.toString();
        }
        ExtError.handleErrors(error);
      }
    });
  });

  req.on('error', (error) => {
    Logger.logErrorMessage(error.stack);
  });

  req.write(data);
  req.end();
};

exports.getOpentokCredentials = function(session_id, workspaceId, classList, successCallback) {
  let url = '/api/v1/stream/credentials?session_id=' + session_id + '&class_list=' + classList;
  const options = {
    hostname: DRUPAL_HOST,
    path: url,
    method: 'GET',
    port: 443,
    headers: {
      'Content-Type': 'application/json',
      'X-API-WORKSPACE-ID' : workspaceId,
    }
  };

  const req = https.request(options, function(res) {

    let chunks = [];

    res.on('data', function(chunk) {
      // push part of answer to buffer.
      chunks.push(chunk);
    }).on('end', function () {

      let data;
      try {
        data = Buffer.concat(chunks);
        let json = JSON.parse(data);

        if (json.status !== 'success') {
          throw new ExtError('00611', 'backend_error', 'Request getOpentokCredentials - status not success - ' + json.status, json);
        }

        successCallback(json.data);
      }
      catch (error) {
        if (error.name !== 'ExtError' && data !== undefined) {
          error.context = data.toString();
        }
        ExtError.handleErrors(error);
      }
    });
  });

  req.on('error', (error) => {
    Logger.logErrorMessage(error.stack);
  });

  req.end();
};
//
// exports.getUserBalance = function(userId, workspaceId, successCallback) {
//   let url = '/api/v1/user/' + userId + '/balance';
//   const options = {
//     hostname: DRUPAL_HOST,
//     path: url,
//     method: 'GET',
//     port: 443,
//     headers: {
//       'Content-Type': 'application/json',
//       'X-API-WORKSPACE-ID' : workspaceId,
//       'X-API-AUTHORIZATION' : DRUPAL_BYPASS_AUTHORIZATION_TOKEN,
//     }
//   };
//
//   const req = https.request(options, function(res) {
//
//     let chunks = [];
//
//     res.on('data', function(chunk) {
//       // push part of answer to buffer.
//       chunks.push(chunk);
//     }).on('end', function () {
//
//       let data;
//       try {
//         data = Buffer.concat(chunks);
//         let json = JSON.parse(data);
//
//         if (json.status === 'success') {
//           successCallback(json.data);
//         }
//         else {
//           throw new ExtError('00605', 'backend_error', 'Request to get user balance:' + JSON.stringify(json));
//         }
//       }
//       catch (error) {
//         if (error.name !== 'ExtError' && data !== undefined) {
//           error.context = data.toString();
//         }
//         ExtError.handleErrors(error);
//       }
//     });
//   });
//
//   req.on('error', (error) => {
//     Logger.logErrorMessage(error.stack);
//   });
//
//   req.end();
// };

exports.sendRoundHistory = function(room) {
  let url = '/api/v1/battle/' + room.battleId + '/rounds';
  const options = {
    hostname: DRUPAL_HOST,
    path: url,
    method: 'POST',
    port: 443,
    headers: {
      'Content-Type': 'application/json',
      'X-API-WORKSPACE-ID' : room.workspaceId,
      'X-API-AUTHORIZATION' : DRUPAL_BYPASS_AUTHORIZATION_TOKEN,
    }
  };
  const req = https.request(options, function (res) {

    let chunks = [];

    res.on('data', function(chunk) {
      chunks.push(chunk);
    }).on('end', function () {

      let data;
      try {
        data = Buffer.concat(chunks);
        let json = JSON.parse(data);

        if (json.status !== 'success') {
          if (json.error === undefined) {
            throw new ExtError('00602', 'backend_error', 'request to backend -  missed data in JSON: ' + JSON.stringify(json));
          }

          throw new ExtError('00613', 'backend_error', 'Request sendRoundHistory error:' + JSON.stringify(json));
        }
      }
      catch (error) {
        if (error.name !== 'ExtError' && data !== undefined) {
          error.context = data.toString();
        }
        ExtError.handleErrors(error);
      }
    });
  });

  req.write(JSON.stringify(room.roundHistory));

  req.on('error', (error) => {
    Logger.logErrorMessage(error.stack);
  });
  req.end()
};

exports.stopRefereeingState = function(room) {
  let url = '/api/v1/battle/' + room.battleId + '/results';
  const options = {
    hostname: DRUPAL_HOST,
    path: url,
    method: 'PUT',
    port: 443,
    headers: {
      'Content-Type': 'application/json',
      'X-API-WORKSPACE-ID' : room.workspaceId,
      'X-API-AUTHORIZATION' : DRUPAL_BYPASS_AUTHORIZATION_TOKEN,
    }
  };
  const req = https.request(options, function (res) {

    let chunks = [];

    res.on('data', function(chunk) {
      chunks.push(chunk);
    }).on('end', function () {

      let data;
      try {
        data = Buffer.concat(chunks);
        let json = JSON.parse(data);

        if (json.status !== 'success') {
          if (json.error === undefined) {
            throw new ExtError('00602', 'backend_error', 'request to backend -  missed data in JSON: ' + JSON.stringify(json));
          }

          throw new ExtError('00614', 'backend_error', 'Request stopRefereeingState error:' + JSON.stringify(json));
        }
      }
      catch (error) {
        if (error.name !== 'ExtError' && data !== undefined) {
          error.context = data.toString();
        }
        ExtError.handleErrors(error);
      }
    });
  });

  req.on('error', (error) => {
    Logger.logErrorMessage(error.stack);
  });
  req.end()
};

exports.startArchiveRecord = function(room, processBalanceErrors) {
  let url = '/api/v1/battle/' + room.battleId + '/stream/start';
  const options = {
    hostname: DRUPAL_HOST,
    path: url,
    method: 'POST',
    port: 443,
    headers: {
      'Content-Type': 'application/json',
      'X-API-WORKSPACE-ID' : room.workspaceId,
    }
  };
  const req = https.request(options, function (res) {

    let chunks = [];

    res.on('data', function(chunk) {
      chunks.push(chunk);
    }).on('end', function () {

      let data;
      try {
        data = Buffer.concat(chunks);
        let json = JSON.parse(data);

        if (json.status === 'success') {

          if (json.data === undefined) {
            throw new ExtError('00602', 'backend_error', 'request to backend -  missed data in JSON: ' + JSON.stringify(json));
          }

          if (json.data.errors !== undefined) {
            processBalanceErrors(json.data.errors);
          }
          else {
            // All users have enough balance.
          }
        }
        else {
          room.updateRoomParams({archiveStarted : false});

          if (json.error === undefined) {
            throw new ExtError('00602', 'backend_error', 'request to backend -  missed data in JSON: ' + JSON.stringify(json));
          }

          if (json.error.code === 50000) {

            if (json.error.details === undefined) {
              throw new ExtError('00606', 'backend_error', 'request to backend - missed errors in JSON during error status code');
            }

            processBalanceErrors(json.error.details)
          }
          else {
            throw new ExtError('00604', 'backend_error', 'Request to start archive error:' + JSON.stringify(json));
          }

        }
      }
      catch (error) {
        if (error.name !== 'ExtError' && data !== undefined) {
          error.context = data.toString();
        }
        ExtError.handleErrors(error);
      }
    });
  });

  req.on('error', (error) => {
    Logger.logErrorMessage(error.stack);
  });
  req.end()
};

exports.stopArchiveRecord = function(room) {
  let url = '/api/v1/battle/' + room.battleId + '/stream/stop';
  const options = {
    hostname: DRUPAL_HOST,
    path: url,
    method: 'POST',
    port: 443,
    headers: {
      'Content-Type': 'application/json',
      'X-API-WORKSPACE-ID' : room.workspaceId,
    }
  };

  const req = https.request(options, function(res) {

    let chunks = [];
    res.on('data', function(chunk) {
      // push part of answer to buffer.
      chunks.push(chunk);
    }).on('end', function () {

      let data;
      try {
        data = Buffer.concat(chunks);
        let json = JSON.parse(data);

        if (json.status !== 'success') {
          throw new ExtError('00612', 'backend_error', 'Request stopArchiveRecord - status not success - ' + json.status, json);
        }

        // Preparing status needed to process video in Backend.
        room.updateBattleStatus('preparing');
        Logger.logDebugMessage('Archive record for battle '+ room.battleId + ' stopped');
      }
      catch (error) {
        if (error.name !== 'ExtError' && data !== undefined) {
          error.context = data.toString();
        }
        ExtError.handleErrors(error);
      }
    });
  });

  req.on('error', (error) => {
    Logger.logErrorMessage(error.stack);
  });

  req.end();
};

/**
 * Update battle with params updateData.
 *
 * @param workspaceId
 * @param battleId
 * @param updateData
 * @returns {Promise}
 */
exports.updateBattle = function(workspaceId, battleId, updateData) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(updateData);
    let url = '/api/v1/battle/' + battleId;
    const options = {
      hostname: DRUPAL_HOST,
      path: url,
      method: 'PUT',
      port: 443,
      headers: {
        'Content-Type': 'application/json',
        'X-API-WORKSPACE-ID' : workspaceId,
        'X-API-AUTHORIZATION' : DRUPAL_BYPASS_AUTHORIZATION_TOKEN,
      }
    };

    const req = https.request(options, function(res) {

      let chunks = [];
      res.on('data', function(chunk) {
        // push part of answer to buffer.
        chunks.push(chunk);
      }).on('end', function () {

        let data;
        try {
          data = Buffer.concat(chunks);
          let json = JSON.parse(data);

          if (json.status !== 'success') {
            reject('Request to update battle with data: ' + JSON.stringify(updateData) + ' error:');
          }
          else {
            resolve();
          }
        }
        catch (error) {
          if (error.name !== 'ExtError' && data !== undefined) {
            error.context = data.toString();
          }
          reject(error);
        }
      });
    });

    req.on('error', (error) => {
      reject(error)
    });

    req.write(data);

    req.end();
  });
};

exports.saveRoomsState = function() {
  fs.writeFile('store/roomsStateDB.json', JSON.stringify(allRooms), function(error) {
    try {
      if (error) throw new ExtError('01300', 'internal_error', error.toString());
    }
    catch (error) {
      ExtError.handleErrors(error);
    }
  });
};

exports.getRoomsState = function(resolve, reject) {
  if (fs.existsSync("store/roomsStateDB.json")) {
    fs.readFile("store/roomsStateDB.json", "utf8",
      function(error,data) {
        if (error) {
          reject(error);
        }

        try {
          let json = JSON.parse(data);
          resolve(json);
        }
        catch (error) {
          error.context = data.toString();
          reject(error);
        }
      });
  }
  else {
    fs.writeFile('store/roomsStateDB.json', "{}", function(error) {
      if (error) reject(error);
    });
  }
};

exports.getWorkspace = function(workspaceId) {
  return new Promise((resolve, reject) => {
    // We get valid sessions.
    let url = '/api/v1/workspace';

    const options = {
      hostname: DRUPAL_HOST,
      path: url,
      method: 'GET',
      port: 443,
      headers: {
        'Content-Type': 'application/json',
        'X-API-WORKSPACE-ID' : workspaceId,
      }
    };

    const req = https.request(options, function(res) {

      let chunks = [];

      res.on('data', function(chunk) {
        chunks.push(chunk);
      }).on('end', function () {

        let data;
        try {
          data   = Buffer.concat(chunks);
          let json = JSON.parse(data);
          if (json.status === 'success') {
            if (json.data === undefined) {
              throw new ExtError('00602', 'backend_error', 'request to backend -  missed data in JSON: ' + JSON.stringify(json));
            }
            resolve(json.data);
          }
          else {
            throw new ExtError('00603', 'backend_error', 'request to get sessions - status not success: ' + JSON.stringify(json));
          }
        }
        catch (error) {
          if (error.name !== 'ExtError' && data !== undefined) {
            error.context = data.toString();
          }
          ExtError.handleErrors(error);
        }

      });
    });

    req.on('error', (error) => {
      Logger.logErrorMessage(error.stack);
    });

    req.end();
  });
};

exports.getSessions = function(workspaceId) {
  return new Promise((resolve, reject) => {
    // We get valid sessions.
    let url = '/api/v1/sessions?status[]=waiting&status[]=started';

    const options = {
      hostname: DRUPAL_HOST,
      path: url,
      method: 'GET',
      port: 443,
      headers: {
        'Content-Type': 'application/json',
        'X-API-WORKSPACE-ID' : workspaceId,
      }
    };

    const req = https.request(options, function(res) {

      let chunks = [];

      res.on('data', function(chunk) {
        chunks.push(chunk);
      }).on('end', function () {

        let data;
        try {
          data   = Buffer.concat(chunks);
          let json = JSON.parse(data);
          if (json.status === 'success') {
            if (json.data === undefined) {
              throw new ExtError('00602', 'backend_error', 'request to backend -  missed data in JSON: ' + JSON.stringify(json));
            }

            if (json.data.sessions !== undefined) {
              resolve(json.data.sessions);
            }
            else {
              throw new ExtError('00601', 'backend_error', 'request to get sessions -  missed sessions in JSON: ' + JSON.stringify(json));
            }
          }
          else {
            throw new ExtError('00603', 'backend_error', 'request to get sessions - status not success: ' + JSON.stringify(json));
          }
        }
        catch (error) {
          if (error.name !== 'ExtError' && data !== undefined) {
            error.context = data.toString();
          }
          ExtError.handleErrors(error);
        }

      });
    });

    req.on('error', (error) => {
      Logger.logErrorMessage(error.stack);
    });

    req.end();
  });
};

exports.slackLog = function(log, context = null) {
  let rawData = {
    text : 'Message from *' + process.env.ENVIRONMENT + '* environment',
    username : 'NODEJS ' + process.env.ENVIRONMENT,
    attachments : [
      {
        text : log,
        color: "#F35A00",
        fields : [{title: "Context", value: '`' + JSON.stringify(context) + '`'}]
      }
    ]
  };

  const data = JSON.stringify(rawData);
  let url = '/services/T07PX4ZC1/BJQ734C8H/nGK1hpL02RxGLPvlRhjvnygf';
  const options = {
    hostname: 'hooks.slack.com',
    path: url,
    method: 'POST',
    port: 443,
    headers: {
      'Content-Type': 'application/json',
    }
  };

  const req = https.request(options, function(res) {

    let chunks = [];
    res.on('data', function(chunk) {
      // push part of answer to buffer.
      chunks.push(chunk);
    }).on('end', function () {

      let data;
      try {
        data = Buffer.concat(chunks);
        let slackAnswer = data.toString();

        if (slackAnswer !== 'ok') {
          throw new ExtError('00607', 'internal_error', 'Request to slack error', slackAnswer);
        }
      }
      catch (error) {
        if (error.name !== 'ExtError' && data !== undefined) {
          error.context = data.toString();
        }
        ExtError.handleErrors(error);
      }
    });
  });

  req.on('error', (error) => {
    Logger.logErrorMessage(error.stack);
  });

  req.write(data);

  req.end();
};

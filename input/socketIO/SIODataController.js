module.exports = class SIODataController {
  constructor() {}
  static handleServerData(driverEvent, serverData) {
      let driverData = {};
      switch (driverEvent) {
          case 'join':
              driverData = {
                  command : 'join',
                  socketId : serverData.socketId,
                  room : serverData.room,
                  callback : serverData.callback,
                  data : serverData.data
              };
              break;
          default:
              driverData = {
                  command : 'emit',
                  eventName : driverEvent,
                  socketId : serverData.socketId,
                  data : serverData.data
              };
              break;
      }
      return driverData
  }

  static handleDriverData(driverEvent, driverData) {
      let serverData = {
          socketId : driverData.socket.id  || {},
          rooms : driverData.socket.rooms  || {},
          userId : driverData.data.userId  || {},
          userName : driverData.data.userName  || {},
          workspaceId : driverData.data.workspaceId  || {},
          currentPage : driverData.data.currentPage  || {},
          initiator : driverData.data.initiator  || {},
      };
      switch (driverEvent) {
          case 'connection':
          case 'join-battle':
          case 'cancel-battle':
          case 'device-checked':
          case 'assessment':
          case 'self-refereeing':
              serverData = Object.assign(serverData,  {
                  battleId : driverData.data.battleId || {},
                  sessionId : driverData.data.sessionId || {}
              });
              break;

          case 'active-users-count':
              serverData = Object.assign(serverData,  {
                type : driverData.data.type || {},
                data : driverData.data.data || {}
              });
              break;

          case 'random-battle':
              serverData = Object.assign(serverData,  {
                startState : driverData.data.startState
              });
              break;

          case 'battle':
              serverData = Object.assign(serverData,  {
                  caseId : driverData.data.caseId,
                  type : driverData.data.type,
                  startState : driverData.data.startState
              });
              break;

          case 'tournament-battle':
              serverData = Object.assign(serverData,  {
                  tournamentId : driverData.data.tournamentId,
                  phaseId : driverData.data.phaseId
              });
              break;

          case 'page-visit':
              serverData = Object.assign(serverData,  {
                  page : driverData.data.page || {},
                  data : driverData.data.data || {}
              });
              break;

          // case 'record-enable':
          //     serverData = Object.assign(serverData,  {
          //         enable : driverData.data.enable,
          //         battleId : driverData.data.battleId || {},
          //         sessionId : driverData.data.sessionId || {}
          //     });
          //     break;

          case 'opentok-actions':
              serverData = Object.assign(serverData,  {
                  type : driverData.data.type,
                  battleId : driverData.data.battleId || {},
                  sessionId : driverData.data.sessionId || {}
              });
              break;

          case 'call-callback':
              serverData.callback = driverData.data.callback;
              break;
      }
      return serverData;
  }
};

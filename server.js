let http = require('http');
let express = require('express');
let app = express();

let backEmitter = require('./processor');

VIRTUAL_PORT = process.env.VIRTUAL_PORT !== undefined ? process.env.VIRTUAL_PORT : 3000;
DRUPAL_HOST = process.env.DRUPAL_HOST;
// DRUPAL_BYPASS_AUTHORIZATION_TOKEN = process.env.DRUPAL_BYPASS_AUTHORIZATION_TOKEN;
DRUPAL_BYPASS_AUTHORIZATION_TOKEN = 'Static 71ae66721d316c8b826b59';
NODEJS_BYPASS_AUTHORIZATION_TOKEN = 'Static 45ghd56789fder432fgg55';
// DRUPAL_HOST = 'itopica.loc';
// DRUPAL_HOST = 'api.itopica.protobrain.qajedi.ru';
// process.env.NODE_TLS_REJECT_UNAUTHORIZED = 0;

let server = http.createServer(app);

// Request to nodejs.
app.get('/admin/allrooms', function(req, res) {
    res.header("Content-Type",'application/json');
    res.send(JSON.stringify(allRooms, null, 4));
});

// Request to nodejs.
app.get('/admin/globalusers', function(req, res) {
    res.header("Content-Type",'application/json');
    res.send(JSON.stringify(globalUsers, null, 4));
});

// Request to nodejs.
app.get('/admin/allgroups', function(req, res) {
    res.header("Content-Type",'application/json');
    res.send(JSON.stringify(allGroups, null, 4));
});

// Request to nodejs.
app.get('/admin/battles', function(req, res) {
    let battles = {};
    for (let userId1 in globalBattlesHistory) {
        if (globalBattlesHistory[userId1] !== undefined) {
            if (battles[userId1] === undefined) {
                battles[userId1] = {};
            }
            for (let userId2 in globalBattlesHistory[userId1]) {
                let d = new Date(globalBattlesHistory[userId1][userId2]);
                battles[userId1][userId2] = globalBattlesHistory[userId1][userId2] + ' ' + d + ' (' + parseInt((Date.now() - globalBattlesHistory[userId1][userId2])/1000) + ' seconds left)';
            }
        }
    }

    res.header("Content-Type",'application/json');
    res.send(JSON.stringify(battles, null, 4));
});
// Request to nodejs.
app.get('/admin/time-operations', function(req, res) {
    res.header("Content-Type",'application/json');
    res.send(JSON.stringify(timeOperations, null, 4));
});

// Request to nodejs.
app.get('/admin/time-operations/matching', function(req, res) {
    res.header("Content-Type",'application/json');
    let matching = {currentTime : new Date(), events : []};
    for (let i in timeOperations) {
        if (timeOperations[i].event === 'matching') {
            matching.events.push("User " + timeOperations[i].data.currentUser.userName
              + ' (' + timeOperations[i].data.currentUser.userId + ')' + " should be matched at "
              + timeOperations[i].timeCondition + '(In ' + parseInt((Date.parse(timeOperations[i].timeCondition) - Date.now())/1000) + ' seconds)');
        }
    }
    res.send(JSON.stringify(matching, null, 4));
});

server.listen(VIRTUAL_PORT, function() {
    console.log('server up and running at %s port', VIRTUAL_PORT);
});

app.use(function(req, res, next) {
    // Append headers for CORS.
    res.header("Access-Control-Allow-Origin", '*');
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});

app.post("/api/v1/battle/:battleId/results-ready", function (req, res) {
    let accessHeader = req.get('X-API-AUTHORIZATION');
    if (accessHeader !== undefined && accessHeader === NODEJS_BYPASS_AUTHORIZATION_TOKEN) {
        backEmitter.emit('results-ready', {battleId : req.params.battleId});
        res.send("OK");
    }
    else {
        res.send("ACCESS DENIED");
    }
});

app.post("/api/v1/group/:groupId/remove", function (req, res) {
    let accessHeader = req.get('X-API-AUTHORIZATION');
    if (accessHeader !== undefined && accessHeader === NODEJS_BYPASS_AUTHORIZATION_TOKEN) {
        backEmitter.emit('remove-group', {groupId : req.params.groupId});
        res.send("OK");
    }
    else {
        res.send("ACCESS DENIED");
    }
});

module.exports = server;

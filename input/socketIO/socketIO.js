module.exports = function (expectedListeners, expectedEvents) {
    let server = require('../../server');
    let EventEmitter = require('events').EventEmitter;
    let fromDriverEmitter = new EventEmitter;
    let toDriverEmitter = new EventEmitter;

    let io = require('socket.io')(server);

    io.on('connection', function (socket) {
        fromDriverEmitter.emit(
            'connection',
            {
                socket : socket,
                data : socket.handshake.query || {}
            }
        );

        expectedListeners.forEach(function(item) {
            socket.on(item, function (data, emitCallback) {
                fromDriverEmitter.emit(
                    item,
                    {
                        socket : socket,
                        data : Object.assign(socket.handshake.query, data || {}) || {},
                    },
                    function (data) {
                        if (emitCallback !== undefined) {
                            emitCallback(data);
                        }
                    }
                );

            });
        });

        socket.on('disconnect', function (data) {
            fromDriverEmitter.emit(
                'disconnect',
                {
                    socket : socket,
                    data : Object.assign(socket.handshake.query, data || {}) || {}
                }
            );
        });

        socket.on('close', function (data) {
            fromDriverEmitter.emit(
                'close',
                {
                    socket : socket,
                    data : Object.assign(socket.handshake.query, data || {}) || {}
                }
            );
        });
    });


    expectedEvents.forEach(function(driverEvent) {
        toDriverEmitter.on(driverEvent, function (data) {
            try {
                if (data.command === 'emit') {
                    io.to(data.socketId).emit(data.eventName, data.data);
                }
                else if (data.command === 'join') {
                    if (globalUsers[data.socketId] === undefined) {
                        throw new Error('SocketIO: User already fully disconnected and can\'t be joined to room');
                    }
                    else if (globalUsers[data.socketId].status === 'disconnected') {
                        throw new Error('SocketIO: User already fully disconnected and can\'t be joined to room');
                    }


                    io.sockets.connected[data.socketId].join(data.room, function () {
                        fromDriverEmitter.emit(
                            'call-callback',
                            {
                                socket : io.sockets.connected[data.socketId],
                                data : Object.assign(data || {}, io.sockets.connected[data.socketId].handshake.query) || {}
                            }
                        );
                    });
                }
            }
            catch (e) {
                console.log('e.stack:', e.stack);
            }

        });
    });

    return {from : fromDriverEmitter, to : toDriverEmitter};
};

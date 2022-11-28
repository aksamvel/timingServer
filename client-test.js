(function ($) {
    // A $( document ).ready() block.
    $(document).ready(function() {

        // let activeUsersSocket = io('https://socketio.itopica.loc', {
        //     forceNew: true,
        //     query: {
        //         userId: '99999999',
        //         userName: 'NodeJS Test Bot',
        //         workspaceId: 'itopica_battle',
        //         initiator: 'init',
        //     },
        // });
        //
        // setInterval(function(){
        //     activeUsersSocket.emit('active-users-count', {}, (answer) => {
        //         $('#active-users-count--counter').html(answer);
        //         console.log('answer: ', answer);
        //     });
        // }, 5000);

        console.log('start client script');
        $('#go-case-page-1').on('click', function(e) {
            console.log('go-case-page-1 button clicked');
            const caseSocket1 = io('https://socketio.itopica.loc', {
                forceNew: true,
                query: {
                    userId: '33333333',
                    userName: 'SAMVEL111',
                    workspaceId: 'itopica_battle',
                    // battleId: '12',
                    // sessionId: '1_MX40NjIzMDI1Mn5-MTU1MzY4MTA5NDE1M35PY29zVHhqZ0VJUVVVTFpPUmVuOUZwQjl-fg',
                    initiator: 'init',
                    currentPage: 'case-page',
                },
            });

            caseSocket1.on('join_battle', function (data) {
                console.log("Please join_battle");
                $('#battle-id-1').val(data.data.battle.id);
                $('#battle-id-2').val(data.data.battle.id);
                $('#battle-page-id-1').val(data.data.battle.id);
                $('#battle-page-session-id-1').val(data.data.battle.tokbox_session_id);
                $('#battle-session-id-1').val(data.data.battle.tokbox_session_id);
                $('#battle-session-id-2').val(data.data.battle.tokbox_session_id);
                caseSocket1.disconnect();
                caseSocket1.close();
                console.log('caseSocket1 closed');
            });
            $('#create-battle-1').click(function(e) {
                console.log('create-battle');
                caseSocket1.emit('battle', {caseId : 752});
            });
            $('#active-user-count-1').click(function(e) {
                console.log('active-count');
                caseSocket1.emit('active-users-count', {}, (answer) => {
                    console.log('answer: ', answer);
                });
            });
            $('#join-to-exist-1').click(function(e) {
                caseSocket1.emit('join-battle', {battleId : $('#battle-id-1').val(), sessionId : $('#battle-session-id-1').val()});
            });

            $('#case-page-device-checked-1').click(function(e) {
                caseSocket1.emit('device-checked');
                caseSocket1.emit('record-enable', {enable : false});
            });

            $('#case-page-cancel-1').click(function(e) {
                caseSocket1.emit('cancel-battle');
            });

            $('#case-page-disconnect-1').click(function(e) {
                console.log('case-page-disconnect-1');
                caseSocket1.disconnect();
            });

            caseSocket1.on('info', function (data) {
                if (data.status !== 'success') {
                    console.log('caseSocket1 data: ', data.data)
                }
                else {
                    console.log('caseSocket1 state: ' + data.data.state);
                    console.log('caseSocket1 data: ', data.data.readyTimer, data.data.tossTimer, data.data.roundTimer, data.data.breakTimer)
                }
            });
            caseSocket1.on('notification', function (data) {
                console.log('caseSocket1', data)
            });
            caseSocket1.on('reconnect', function (data) {
                console.log('caseSocket1', data)
            });
        });

        $('#go-case-page-2').on('click', function(e) {
            console.log('go-case-page-2 button clicked');
            const caseSocket2 = io('https://socketio.itopica.loc', {
                forceNew: true,
                query: {
                    userId: '444444444',
                    userName: 'SAMVEL222',
                    workspaceId: 'itopica_battle',
                    initiator: 'init',
                    // battleId: '12',
                    // sessionId: '1_MX40NjIzMDI1Mn5-MTU1MzY4MTA5NDE1M35PY29zVHhqZ0VJUVVVTFpPUmVuOUZwQjl-fg',
                    currentPage: 'case-page',
                },
            });
            caseSocket2.on('join_battle', function (data) {
                console.log("Please join_battle");
                $('#battle-id-1').val(data.data.battle.id);
                $('#battle-id-2').val(data.data.battle.id);
                $('#battle-page-id-2').val(data.data.battle.id);
                $('#battle-session-id-1').val(data.data.battle.tokbox_session_id);
                $('#battle-session-id-2').val(data.data.battle.tokbox_session_id);
                $('#battle-page-session-id-2').val(data.data.battle.tokbox_session_id);
                caseSocket2.disconnect();
                caseSocket2.close();
                console.log('caseSocket2 closed');
            });
            $('#create-battle-2').click(function(e) {
                caseSocket2.emit('battle', {caseId : 752});
            });
            $('#join-to-exist-2').click(function(e) {
                caseSocket2.emit('join-battle', {battleId : $('#battle-id-2').val(), sessionId : $('#battle-session-id-2').val()});
            });
            $('#case-page-device-checked-2').click(function(e) {
                caseSocket2.emit('device-checked');
                caseSocket2.emit('record-enable', {enable : false});
            });
            $('#case-page-cancel-2').click(function(e) {
                caseSocket2.emit('cancel-battle');
            });
            $('#case-page-disconnect-2').click(function(e) {
                console.log('case-page-disconnect-2');
                caseSocket2.disconnect();
            });

            caseSocket2.on('info', function (data) {
                if (data.status !== 'success') {
                    console.log('caseSocket2 data: ', data.data)
                }
                else {
                    console.log('caseSocket2 state: ' + data.data.state);
                    console.log('caseSocket2 data: ', data.data.readyTimer, data.data.tossTimer, data.data.roundTimer, data.data.breakTimer)
                }
            });
            caseSocket2.on('notification', function (data) {
                console.log(data)
            });
            caseSocket2.on('reconnect', function (data) {
                console.log(data)
            });
        });


        $('#go-battle-page-1').on('click', function(e) {
            console.log('go-battle-page-1 button clicked');
            const caseSocket3 = io('https://socketio.itopica.loc', {
                forceNew: true,
                query: {
                    userId: '33333333',
                    userName: 'SAMVEL111',
                    workspaceId: 'itopica_battle',
                    battleId: $('#battle-page-id-1').val(),
                    sessionId: $('#battle-page-session-id-1').val(),
                    initiator: 'init',
                    currentPage: 'battle-page',
                },
            });
            $('#battle-page-device-checked-1').click(function(e) {
                caseSocket3.emit('device-checked');
                caseSocket3.emit('record-enable', {enable : false});
            });
            $('#battle-page-cancel-1').click(function(e) {
                caseSocket3.emit('cancel-battle');
            });
            $('#battle-page-disconnect-1').click(function(e) {
                console.log('battle-page-disconnect-1');
                caseSocket3.disconnect();
            });
            caseSocket3.on('info', function (data) {
                if (data.status === 'success') {
                    console.log('caseSocket3 state: ' + data.data.state);
                    console.log('caseSocket3 data: ', data.data.readyTimer, data.data.tossTimer, data.data.roundTimer, data.data.breakTimer)
                }
                else {
                    console.log('caseSocket3 data: ', data)
                }

            });
            caseSocket3.on('notification', function (data) {
                console.log(data)
            });
            caseSocket3.on('reconnect', function (data) {
                console.log(data)
            });
        });

        $('#go-battle-page-2').on('click', function(e) {
            console.log('go-battle-page-2 button clicked');
            const caseSocket4 = io('https://socketio.itopica.loc', {
                forceNew: true,
                query: {
                    userId: '444444444',
                    userName: 'SAMVEL222',
                    workspaceId: 'itopica_battke',
                    battleId: $('#battle-page-id-2').val(),
                    sessionId: $('#battle-page-session-id-2').val(),
                    initiator: 'init',
                    currentPage: 'battle-page',
                },
            });
            $('#battle-page-device-checked-2').click(function(e) {
                caseSocket4.emit('device-checked');
                caseSocket4.emit('record-enable', {enable : false});
            });
            $('#battle-page-cancel-2').click(function(e) {
                console.log('battle-page-cancel-2');
                caseSocket4.emit('cancel-battle');
            });
            $('#battle-page-disconnect-2').click(function(e) {
                console.log('battle-page-disconnect-2');
                caseSocket4.disconnect();
            });
            caseSocket4.on('info', function (data) {
                if (data.status !== 'success') {
                    console.log('caseSocket4 data: ', data.data)
                }
                else {
                    console.log('caseSocket4 state: ' + data.data.state);
                    console.log('caseSocket4 data: ', data.data.readyTimer, data.data.tossTimer, data.data.roundTimer, data.data.breakTimer)
                }
            });
            caseSocket4.on('notification', function (data) {
                console.log(data)
            });
            caseSocket4.on('reconnect', function (data) {
                console.log(data)
            });
        });


        $('#go-tournament-page-1').on('click', function(e) {
            console.log('go-tournament-page-1 button clicked');
            const caseSocket5 = io('https://socketio.itopica.loc', {
                forceNew: true,
                query: {
                    userId: '826',
                    userName: 'Player1',
                    workspaceId: 'itopica_battle',
                    tournamentId: 2790,
                    phaseId: 3091,
                    initiator: 'init',
                    currentPage: 'tournament-page',
                },
            });
            $('#tournament-battle-1').click(function(e) {
                caseSocket5.emit('tournament-battle', {tournamentId: 2790, phaseId: 3093});
                console.log('tournament-battle-1 emitted');
            });
            $('#left-tournament-queue-1').click(function(e) {
                caseSocket5.emit('left-tournament-queue');
                console.log('left-tournament-queue-1 emitted');
            });
            caseSocket5.on('info', function (data) {
                console.log('caseSocket5 info', data)
            });

            caseSocket5.on('join_battle', function (data) {
                console.log('caseSocket5 join', data)
            });

        });
        $('#go-tournament-page-2').on('click', function(e) {
            console.log('go-tournament-page-2 button clicked');
            const caseSocket6 = io('https://socketio.itopica.loc', {
                forceNew: true,
                query: {
                    userId: '837',
                    userName: 'Player2',
                    workspaceId: 'itopica_battle',
                    initiator: 'init',
                    currentPage: 'tournament-page',
                },
            });
            $('#tournament-battle-2').click(function(e) {
                caseSocket6.emit('tournament-battle', {tournamentId: 2790, phaseId: 3093});
                console.log('tournament-battle-2 emitted');
            });
            $('#left-tournament-queue-2').click(function(e) {
                caseSocket6.emit('left-tournament-queue');
                console.log('left-tournament-queue-2 emitted');
            });
            caseSocket6.on('info', function (data) {
                console.log('caseSocket6 info', data)
            });
            caseSocket6.on('join_battle', function (data) {
                console.log('caseSocket6 join', data)
            });

        });

    });

})(jQuery);

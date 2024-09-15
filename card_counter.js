// ==UserScript==
// @name         Catan Card Counter
// @namespace    http://tampermonkey.net/
// @version      0.4
// @description  Display and update card counts for Catan players
// @match        https://colonist.io/*
// @grant        none
// @require      https://unpkg.com/msgpack-lite@0.1.26/dist/msgpack.min.js
// ==/UserScript==

(function() {
    'use strict';

    let players = {};
    let bank = {1: 19, 2: 19, 3: 19, 4: 19, 5: 19};

    const resourceTypes = {
        1: 'Wood',
        2: 'Brick',
        3: 'Sheep',
        4: 'Wheat',
        5: 'Ore'
    };

    const colorNames = {
        1: 'Red',
        2: 'Blue',
        3: 'Orange',
        4: 'Green'
    };

    function createUI() {
        const container = document.createElement('div');
        container.id = 'card-counter';
        container.style.cssText = 'position: fixed; top: 10px; right: 10px; background: rgba(0,0,0,0.7); color: white; padding: 10px; z-index: 9999; max-height: 80vh; overflow-y: auto;';
        document.body.appendChild(container);
        updateUI();
    }

    function updateUI() {
        const container = document.getElementById('card-counter');
        if (!container) return;

        let html = '<h3>Card Counts</h3>';
        for (let colorId in players) {
            const player = players[colorId];
            const colorName = colorNames[colorId] || 'Unknown';
            html += `<h4>${player.name} (${colorName})</h4>`;
            for (let resourceId in resourceTypes) {
                const count = player.cards[resourceId] || 0;
                html += `${resourceTypes[resourceId]}: ${count}<br>`;
            }
            html += `Dev Cards: ${player.devCards || 0}<br>`;
        }
        html += '<h4>Bank</h4>';
        for (let resourceId in resourceTypes) {
            html += `${resourceTypes[resourceId]}: ${bank[resourceId]}<br>`;
        }
        container.innerHTML = html;
    }

    function handleMessage(event) {
        const arrayBuffer = event.data;
        const uint8Array = new Uint8Array(arrayBuffer);
        const decodedData = msgpack.decode(uint8Array);

        console.log('Decoded MessagePack:', decodedData);

        if (decodedData.data && decodedData.data.type === 4) {
            initializePlayers(decodedData.data.payload);
        } else if (decodedData.data && decodedData.data.type === 91) {
            handleGameStateUpdate(decodedData.data.payload);
        } else if (decodedData.data && decodedData.data.type === 28) {
            handleResourceDistribution(decodedData.data.payload);
        } else if (decodedData.data && decodedData.data.type === 43) {
            handleResourceSpending(decodedData.data.payload);
        }

        updateUI();
    }

    function initializePlayers(payload) {
        if (payload.playerUserStates) {
            players = {};
            payload.playerUserStates.forEach(player => {
                players[player.selectedColor] = {
                    name: player.username,
                    cards: {},
                    devCards: 0
                };
            });
        }
    }

    function handleGameStateUpdate(payload) {
        if (payload.diff && payload.diff.playerStates) {
            for (let colorId in payload.diff.playerStates) {
                const playerState = payload.diff.playerStates[colorId];
                if (playerState.resourceCards && playerState.resourceCards.cards) {
                    players[colorId].cards = {};
                    playerState.resourceCards.cards.forEach((count, index) => {
                        if (count > 0) {
                            players[colorId].cards[index + 1] = count;
                        }
                    });
                }
                if (playerState.developmentCards && playerState.developmentCards.cards) {
                    players[colorId].devCards = playerState.developmentCards.cards.length;
                }
            }
        }
        if (payload.diff && payload.diff.bankState && payload.diff.bankState.resourceCards) {
            for (let resourceId in payload.diff.bankState.resourceCards) {
                bank[resourceId] = payload.diff.bankState.resourceCards[resourceId];
            }
        }
        if (payload.diff && payload.diff.gameLogState) {
            handleGameLogUpdates(payload.diff.gameLogState);
        }
    }

    function handleResourceDistribution(payload) {
        payload.forEach(distribution => {
            const playerId = distribution.owner;
            const resourceId = distribution.card;
            if (players[playerId]) {
                players[playerId].cards[resourceId] = (players[playerId].cards[resourceId] || 0) + 1;
                bank[resourceId]--;
            }
        });
    }

    function handleResourceSpending(payload) {
        const { givingPlayer, givingCards, receivingPlayer } = payload;
        if (givingPlayer !== 0 && receivingPlayer === 0) {
            givingCards.forEach(resourceId => {
                if (players[givingPlayer]) {
                    players[givingPlayer].cards[resourceId] = (players[givingPlayer].cards[resourceId] || 1) - 1;
                    bank[resourceId]++;
                }
            });
        }
    }

    function handleGameLogUpdates(gameLogState) {
        for (let logId in gameLogState) {
            const log = gameLogState[logId].text;
            if (log.type === 115) { // Trading
                handleTrade(log);
            } else if (log.type === 55) { // Discarding to robber
                handleDiscard(log);
            } else if (log.type === 16) { // Robber stealing
                handleRobberSteal(log);
            } else if (log.type === 20) { // Development card play
                handleDevCardPlay(log);
            }
        }
    }

    function handleTrade(log) {
        const { playerColor, acceptingPlayerColor, givenCardEnums, receivedCardEnums } = log;
        givenCardEnums.forEach(resourceId => {
            players[playerColor].cards[resourceId] = (players[playerColor].cards[resourceId] || 1) - 1;
            players[acceptingPlayerColor].cards[resourceId] = (players[acceptingPlayerColor].cards[resourceId] || 0) + 1;
        });
        receivedCardEnums.forEach(resourceId => {
            players[acceptingPlayerColor].cards[resourceId] = (players[acceptingPlayerColor].cards[resourceId] || 1) - 1;
            players[playerColor].cards[resourceId] = (players[playerColor].cards[resourceId] || 0) + 1;
        });
    }

    function handleDiscard(log) {
        const { playerColor, cardEnums } = log;
        cardEnums.forEach(resourceId => {
            players[playerColor].cards[resourceId] = (players[playerColor].cards[resourceId] || 1) - 1;
            bank[resourceId]++;
        });
    }

    function handleRobberSteal(log) {
        const { playerColorThief, playerColorVictim } = log;
        // We don't know which card was stolen, so we can't update specific resource counts
        // Instead, we'll just decrement the total card count for the victim
        const victimCards = players[playerColorVictim].cards;
        const totalCards = Object.values(victimCards).reduce((sum, count) => sum + count, 0);
        if (totalCards > 0) {
            const randomResource = Object.keys(victimCards).find(resourceId => victimCards[resourceId] > 0);
            if (randomResource) {
                players[playerColorVictim].cards[randomResource]--;
                players[playerColorThief].cards[randomResource] = (players[playerColorThief].cards[randomResource] || 0) + 1;
            }
        }
    }

    function handleDevCardPlay(log) {
        const { playerColor, cardEnum } = log;
        players[playerColor].devCards = Math.max(0, (players[playerColor].devCards || 1) - 1);
        if (cardEnum === 13) { // Monopoly
            // The actual resource collection will be handled by subsequent messages
        } else if (cardEnum === 14) { // Year of Plenty
            // The resource gain will be handled by a subsequent type 116 message
        }
    }

    const originalWebSocket = window.WebSocket;
    window.WebSocket = function(url, protocols) {
        const socket = new originalWebSocket(url, protocols);
        socket.addEventListener('message', handleMessage);
        return socket;
    };

    createUI();
})();
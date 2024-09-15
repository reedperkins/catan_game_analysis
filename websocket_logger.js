// ==UserScript==
// @name         WebSocket Logger
// @namespace    http://tampermonkey.net/
// @version      1.8
// @description  Logs all incoming WebSocket data, decodes MessagePack, and appends it to a bar with toggleable size and copy-to-clipboard functionality.
// @match        https://colonist.io/*
// @grant        none
// @require      https://cdnjs.cloudflare.com/ajax/libs/msgpack-lite/0.1.26/msgpack.min.js
// ==/UserScript==

(function() {
    'use strict';

    const createElement = (tag, attributes = {}, styles = {}) => {
        const element = document.createElement(tag);
        Object.entries(attributes).forEach(([key, value]) => element[key] = value);
        Object.entries(styles).forEach(([key, value]) => element.style[key] = value);
        return element;
    };

    const appendToBody = (...elements) => elements.forEach(el => document.body.appendChild(el));

    const createLogBar = () => {
        const logBar = createElement('div', {
            innerHTML: 'WebSocket Log: <div id="ws-log"></div>'
        }, {
            position: 'fixed', top: '0', left: '0', width: '100%', height: '150px',
            backgroundColor: '#333', color: 'white', zIndex: '9999', overflowY: 'auto',
            fontFamily: 'Arial, sans-serif', padding: '10px', boxSizing: 'border-box',
            transition: 'height 0.3s'
        });
        return logBar;
    };

    const createButton = (text, top, side, onClick) => {
        const button = createElement('button', { textContent: text, onclick: onClick }, {
            position: 'fixed', top, [side]: '10px', zIndex: '10000', padding: '10px',
            backgroundColor: '#555', color: 'white', border: 'none', cursor: 'pointer',
            fontFamily: 'Arial, sans-serif'
        });
        return button;
    };

    const decodeMessagePack = buffer => {
        try {
            return msgpack.decode(new Uint8Array(buffer));
        } catch (e) {
            console.error('MessagePack decoding error:', e);
            return null;
        }
    };

    const processWebSocketMessage = (event, appendLog) => {
        let messageContent;
        if (typeof event.data === 'string') {
            messageContent = event.data;
        } else if (event.data instanceof ArrayBuffer) {
            const decodedData = decodeMessagePack(event.data);
            messageContent = 'MessagePack Decoded: ' + JSON.stringify(decodedData, null, 2);
        } else if (event.data instanceof Blob) {
            const reader = new FileReader();
            reader.onload = () => appendLog('Blob: ' + reader.result);
            reader.readAsText(event.data);
            return;
        } else {
            messageContent = 'Unknown data type';
        }
        appendLog(messageContent);
    };

    const createWebSocketLogger = () => {
        const logBar = createLogBar();
        const logContainer = logBar.querySelector('#ws-log');
        let isLogBarExpanded = true;

        const appendLog = messageContent => {
            const newLog = createElement('div', {
                textContent: `${new Date().toLocaleTimeString()} - ${messageContent}`
            }, {
                padding: '5px 0',
                borderBottom: '1px solid #555'
            });
            logContainer.appendChild(newLog);
            logBar.scrollTop = logBar.scrollHeight;
        };

        const toggleLogBar = () => {
            isLogBarExpanded = !isLogBarExpanded;
            logBar.style.height = isLogBarExpanded ? '150px' : '30px';
            ['copyButton', 'toggleButton'].forEach(btn => 
                window[btn].style.top = isLogBarExpanded ? '160px' : '40px'
            );
        };

        const copyToClipboard = () => {
            const logs = Array.from(logContainer.getElementsByTagName('div'))
                .map(div => div.textContent)
                .join('\n');
            navigator.clipboard.writeText(logs)
                .then(() => alert('WebSocket log copied to clipboard!'))
                .catch(err => console.error('Error copying log to clipboard: ', err));
        };

        window.toggleButton = createButton('Toggle Log Box', '160px', 'left', toggleLogBar);
        window.copyButton = createButton('Copy Log to Clipboard', '160px', 'right', copyToClipboard);

        appendToBody(logBar, window.toggleButton, window.copyButton);

        return { processMessage: event => processWebSocketMessage(event, appendLog) };
    };

    const logger = createWebSocketLogger();

    // Intercept WebSocket constructor
    const originalWebSocket = window.WebSocket;
    window.WebSocket = function(...args) {
        const wsInstance = new originalWebSocket(...args);
        wsInstance.addEventListener('message', logger.processMessage);
        return wsInstance;
    };
    window.WebSocket.prototype = originalWebSocket.prototype;
})();
'use strict';

// OceanBus Lighthouse Demo
// Chat between your phone and computer — zero server deployment.
//
// One command:  npm install && npm start
// One magic moment: you type on your phone, it appears in your terminal.
// "Wait... I didn't deploy anything."

const { createOceanBus } = require('oceanbus');
const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');
const readline = require('readline');
const os = require('os');
const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode-terminal');

// ── Config ────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '3000', 10);
const DATA_DIR = path.join(__dirname, 'demo-data');
const IDENTITY_FILE = path.join(DATA_DIR, 'identities.json');

// ── Phone Web UI ──────────────────────────────────────────────────────────
const HTML_PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>OceanBus Chat</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #0f0f1a;
    color: #e0e0e0;
    height: 100dvh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  #header {
    background: #1a1a2e;
    padding: 12px 16px;
    font-size: 17px;
    font-weight: 600;
    text-align: center;
    border-bottom: 1px solid #2a2a3e;
    flex-shrink: 0;
  }
  #status {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 6px;
    font-size: 12px;
    color: #888;
    background: #141428;
    flex-shrink: 0;
  }
  #status .dot {
    width: 8px; height: 8px;
    border-radius: 50%;
    background: #f0a030;
  }
  #status .dot.connected { background: #4caf84; }
  #status .dot.disconnected { background: #e05555; }
  #messages {
    flex: 1;
    overflow-y: auto;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    -webkit-overflow-scrolling: touch;
  }
  .msg {
    max-width: 80%;
    padding: 10px 14px;
    border-radius: 16px;
    font-size: 15px;
    line-height: 1.45;
    word-break: break-word;
    animation: fadeIn 0.2s ease;
  }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
  .msg.sent {
    align-self: flex-end;
    background: #2563eb;
    color: #fff;
    border-bottom-right-radius: 4px;
  }
  .msg.received {
    align-self: flex-start;
    background: #2a2a3e;
    color: #d0d0d0;
    border-bottom-left-radius: 4px;
  }
  .msg .ts {
    font-size: 10px;
    opacity: 0.55;
    margin-top: 4px;
    text-align: right;
  }
  #empty {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #555;
    font-size: 14px;
    text-align: center;
    padding: 20px;
  }
  #input-area {
    display: flex;
    gap: 8px;
    padding: 10px 12px;
    background: #1a1a2e;
    border-top: 1px solid #2a2a3e;
    flex-shrink: 0;
    padding-bottom: max(10px, env(safe-area-inset-bottom));
  }
  #input {
    flex: 1;
    background: #0f0f1a;
    border: 1px solid #333;
    border-radius: 20px;
    padding: 10px 16px;
    color: #e0e0e0;
    font-size: 16px;
    outline: none;
  }
  #input:focus { border-color: #2563eb; }
  #send {
    background: #2563eb;
    color: #fff;
    border: none;
    border-radius: 20px;
    padding: 10px 20px;
    font-size: 15px;
    font-weight: 500;
    cursor: pointer;
    min-width: 60px;
  }
  #send:active { background: #1d4ed8; }
  #send:disabled { background: #333; color: #666; }
  #counter {
    text-align: right;
    font-size: 11px;
    color: #555;
    padding: 0 16px 4px;
    flex-shrink: 0;
  }
  #counter.warn { color: #e0a030; }
</style>
</head>
<body>
<div id="header">OceanBus Chat</div>
<div id="status"><span class="dot" id="dot"></span><span id="status-text">Connecting...</span></div>
<div id="messages"><div id="empty">Messages between phone and computer<br>will appear here</div></div>
<div id="counter">0/2000</div>
<div id="input-area">
  <input id="input" type="text" maxlength="2000" placeholder="Type a message..." autofocus>
  <button id="send">Send</button>
</div>
<script>
  (function() {
    var empty = document.getElementById('empty');
    var messages = document.getElementById('messages');
    var input = document.getElementById('input');
    var sendBtn = document.getElementById('send');
    var counter = document.getElementById('counter');
    var dot = document.getElementById('dot');
    var statusText = document.getElementById('status-text');
    var ws = null;
    var reconnectTimer = null;

    function setStatus(cls, text) {
      dot.className = 'dot ' + cls;
      statusText.textContent = text;
    }

    function addMessage(text, type) {
      if (empty) { empty.remove(); empty = null; }
      var div = document.createElement('div');
      div.className = 'msg ' + type;
      var now = new Date();
      var ts = now.getHours().toString().padStart(2,'0') + ':' +
               now.getMinutes().toString().padStart(2,'0');
      div.innerHTML = '<div>' + escapeHtml(text) + '</div><div class="ts">' + ts + '</div>';
      messages.appendChild(div);
      messages.scrollTop = messages.scrollHeight;
    }

    function escapeHtml(s) {
      return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    function connect() {
      if (ws && ws.readyState === WebSocket.OPEN) return;
      setStatus('', 'Connecting...');
      ws = new WebSocket('ws://' + location.host);

      ws.onopen = function() {
        setStatus('connected', 'Connected');
        if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
      };

      ws.onmessage = function(ev) {
        try {
          var msg = JSON.parse(ev.data);
          if (msg.type === 'message') {
            addMessage(msg.text, 'received');
          } else if (msg.type === 'sent') {
            addMessage(msg.text, 'sent');
          } else if (msg.type === 'error') {
            addMessage('[Error] ' + msg.text, 'received');
          } else if (msg.type === 'status') {
            // server status update, ignore for now
          }
        } catch(e) {}
      };

      ws.onclose = function() {
        setStatus('disconnected', 'Disconnected — reconnecting...');
        reconnectTimer = setTimeout(connect, 2000);
      };

      ws.onerror = function() {
        ws.close();
      };
    }

    function doSend() {
      var text = input.value.trim();
      if (!text) return;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        addMessage('Not connected — message not sent', 'received');
        return;
      }
      ws.send(JSON.stringify({ type: 'send', text: text }));
      input.value = '';
      updateCounter();
      input.focus();
    }

    function updateCounter() {
      var len = input.value.length;
      counter.textContent = len + '/2000';
      counter.className = len > 1800 ? 'warn' : '';
    }

    sendBtn.addEventListener('click', doSend);
    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') { e.preventDefault(); doSend(); }
    });
    input.addEventListener('input', updateCounter);

    connect();
  })();
</script>
</body>
</html>`;

// ── Helpers ───────────────────────────────────────────────────────────────

function log(msg) {
  console.log('[OceanBus] ' + msg);
}

function printMessage(sender, text) {
  // Clear the current readline input line, print message, restore prompt
  process.stdout.write('\r\x1b[K');
  console.log(sender + ': ' + text);
}

let _rl = null;
function restorePrompt() {
  if (_rl) _rl.prompt(true);
}

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

// ── Identity Management ───────────────────────────────────────────────────

async function loadOrCreateIdentities() {
  fs.mkdirSync(DATA_DIR, { recursive: true });

  // Try loading saved identities
  if (fs.existsSync(IDENTITY_FILE)) {
    try {
      const raw = fs.readFileSync(IDENTITY_FILE, 'utf-8');
      const ids = JSON.parse(raw);
      if (ids.computer && ids.phone) {
        log('Loaded saved identities from demo-data/identities.json');
        return ids;
      }
    } catch (_) {
      log('Saved identities corrupted — re-registering...');
      try { fs.unlinkSync(IDENTITY_FILE); } catch (_) {}
    }
  }

  // First run — register two fresh OceanBus agents
  log('First run — registering two new OceanBus agents...');

  const ob1 = await createOceanBus({ keyStore: { type: 'memory' } });
  const reg1 = await ob1.register();
  const openid1 = await ob1.getOpenId();

  const ob2 = await createOceanBus({ keyStore: { type: 'memory' } });
  const reg2 = await ob2.register();
  const openid2 = await ob2.getOpenId();

  const ids = {
    computer: { agent_id: reg1.agent_id, api_key: reg1.api_key, openid: openid1 },
    phone:    { agent_id: reg2.agent_id, api_key: reg2.api_key, openid: openid2 },
  };

  fs.writeFileSync(IDENTITY_FILE, JSON.stringify(ids, null, 2));
  log('Identities saved.');

  await ob1.destroy();
  await ob2.destroy();

  return ids;
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log('');
  console.log('  ╭─────────────────────────────────────────╮');
  console.log('  │     OceanBus Lighthouse Demo            │');
  console.log('  │  Phone ←→ Computer  ·  Zero Deployment  │');
  console.log('  ╰─────────────────────────────────────────╯');
  console.log('');

  // Phase 1: load or create identities
  const ids = await loadOrCreateIdentities();

  log('Starting OceanBus agents...');

  // Create OceanBus instances with saved identities
  const obComputer = await createOceanBus({
    keyStore: { type: 'memory' },
    identity: { agent_id: ids.computer.agent_id, api_key: ids.computer.api_key },
  });
  const obPhone = await createOceanBus({
    keyStore: { type: 'memory' },
    identity: { agent_id: ids.phone.agent_id, api_key: ids.phone.api_key },
  });

  log('Computer agent ready');
  log('Phone agent ready');

  // Phase 2: HTTP + WebSocket server
  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server });

  let phoneWS = null;

  app.get('/', (_req, res) => {
    res.type('html').send(HTML_PAGE);
  });

  wss.on('connection', (ws) => {
    phoneWS = ws;
    log('Phone connected');
    ws.send(JSON.stringify({ type: 'status', text: 'Connected to OceanBus' }));

    ws.on('message', async (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'send' && msg.text) {
          await obPhone.send(ids.computer.openid, msg.text);
        }
      } catch (err) {
        try {
          ws.send(JSON.stringify({ type: 'error', text: err.message }));
        } catch (_) {}
      }
    });

    ws.on('close', () => {
      phoneWS = null;
      log('Phone disconnected');
    });

    ws.on('error', () => {
      phoneWS = null;
    });
  });

  server.listen(PORT, '0.0.0.0', () => {
    const ip = getLocalIP();
    const url = 'http://' + ip + ':' + PORT;
    console.log('');
    log('Server running at: ' + url);
    if (ip === '127.0.0.1') {
      log('WARNING: No LAN IP detected. Make sure both devices are on the same WiFi.');
    }
    console.log('');
    console.log('  Scan this QR code with your phone:');
    console.log('');
    qrcode.generate(url, { small: true });
    console.log('');
    console.log('  Type a message below and press Enter to send.');
    console.log('  Type /quit to exit.');
    console.log('');
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error('');
      console.error('  ERROR: Port ' + PORT + ' is already in use.');
      console.error('  Try: PORT=3001 node index.js');
      console.error('');
      process.exit(1);
    }
    throw err;
  });

  // Phase 3: OceanBus listeners

  // Computer agent: incoming messages from phone → display in terminal
  obComputer.startListening((msg) => {
    printMessage('\x1b[36m📱 Phone\x1b[0m', msg.content);
    restorePrompt();
  });

  // Phone agent: incoming messages from computer → push to phone browser
  obPhone.startListening((msg) => {
    if (phoneWS && phoneWS.readyState === 1) {
      phoneWS.send(JSON.stringify({ type: 'message', text: msg.content }));
    }
  });

  // Phase 4: terminal input (computer → phone)
  _rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '\x1b[32mYou\x1b[0m: ',
  });

  _rl.prompt();

  _rl.on('line', async (line) => {
    const text = line.trim();
    if (!text) {
      _rl.prompt();
      return;
    }
    if (text === '/quit' || text === '/exit') {
      await shutdown();
      return;
    }
    try {
      await obComputer.send(ids.phone.openid, text);
      // Echo to own terminal
      printMessage('\x1b[32mYou\x1b[0m', text);
    } catch (err) {
      console.error('[Error] Failed to send: ' + err.message);
    }
    _rl.prompt();
  });

  // Phase 5: graceful shutdown
  async function shutdown() {
    console.log('\nShutting down...');
    _rl.close();
    if (phoneWS) {
      try { phoneWS.close(); } catch (_) {}
    }
    wss.close();
    server.close();
    try { await obComputer.destroy(); } catch (_) {}
    try { await obPhone.destroy(); } catch (_) {}
    console.log('Goodbye!');
    process.exit(0);
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('');
  if (err.message && err.message.includes('ECONNREFUSED')) {
    console.error('  Cannot reach OceanBus network. Check your internet connection.');
  } else if (err.message && err.message.includes('ENOTFOUND')) {
    console.error('  Cannot reach OceanBus network. Check your internet connection.');
  } else {
    console.error('  Fatal error:', err.message);
  }
  console.error('');
  process.exit(1);
});

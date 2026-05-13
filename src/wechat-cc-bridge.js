#!/usr/bin/env node
/**
 * WeChat ↔ CC Bridge
 *
 * 一端连着微信（iLink API 长轮询），一端连着 OceanBus（P2P 消息），
 * 把微信用户的消息路由到对应的 Claude Code，把 CC 的回复推回微信。
 *
 * 用法：
 *   node wechat-cc-bridge.js start       启动桥接（需要已登录微信 Bot + 已注册 OB 身份）
 *   node wechat-cc-bridge.js setup-ob    注册 OceanBus 身份
 *   node wechat-cc-bridge.js pair-qr     生成配对二维码（给 CC 展示用）
 *   node wechat-cc-bridge.js status      查看桥接状态（配对列表）
 */

const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ── 常量 ──────────────────────────────────────────────────────
const ILINK_BASE_URL = 'https://ilinkai.weixin.qq.com';
const CRED_DIR = path.join(os.homedir(), '.oceanbus-chat');
const WECHAT_CRED_FILE = path.join(CRED_DIR, 'wechat-bot.json');
const OB_CRED_FILE = path.join(CRED_DIR, 'wechat-bot-ob.json');
const PAIRING_FILE = path.join(CRED_DIR, 'wechat-cc-pairings.json');
const SYNC_FILE = path.join(CRED_DIR, 'wechat-bot-sync.json');

// iLink headers（从 wechat-bot.js 复用）
const CHANNEL_VERSION = '2.1.1';
const ILINK_APP_CLIENT_VERSION = String(((1 & 0xff) << 16) | ((0 & 0xff) << 8) | (11 & 0xff));

// ── 配对管理 ──────────────────────────────────────────────────

function loadPairings() {
  try {
    if (fs.existsSync(PAIRING_FILE)) return JSON.parse(fs.readFileSync(PAIRING_FILE, 'utf-8'));
  } catch (_) {}
  return {};
}

function savePairings(data) {
  fs.mkdirSync(CRED_DIR, { recursive: true });
  fs.writeFileSync(PAIRING_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

function pairWechatUser(wechatUserId, ccName, ccOpenId) {
  const all = loadPairings();
  all[wechatUserId] = { ccName, ccOpenId, pairedAt: new Date().toISOString() };
  savePairings(all);
}

function getPairedCC(wechatUserId) {
  const all = loadPairings();
  return all[wechatUserId] || null;
}

// ── 凭证管理 ──────────────────────────────────────────────────

function loadWechatCreds() {
  try {
    if (fs.existsSync(WECHAT_CRED_FILE)) return JSON.parse(fs.readFileSync(WECHAT_CRED_FILE, 'utf-8'));
  } catch (_) {}
  return null;
}

function loadObCreds() {
  try {
    if (fs.existsSync(OB_CRED_FILE)) return JSON.parse(fs.readFileSync(OB_CRED_FILE, 'utf-8'));
  } catch (_) {}
  return null;
}

function saveObCreds(data) {
  fs.mkdirSync(CRED_DIR, { recursive: true });
  fs.writeFileSync(OB_CRED_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

// ── iLink API（从 wechat-bot.js 精简复制） ────────────────────

function randomUin() {
  const uint32 = crypto.randomBytes(4).readUInt32BE(0);
  return Buffer.from(String(uint32), 'utf-8').toString('base64');
}

function httpsPost(urlPath, body, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, ILINK_BASE_URL);
    const bodyStr = JSON.stringify(body);
    const headers = {
      'Content-Type': 'application/json',
      AuthorizationType: 'ilink_bot_token',
      'X-WECHAT-UIN': randomUin(),
      'iLink-App-Id': 'bot',
      'iLink-App-ClientVersion': ILINK_APP_CLIENT_VERSION,
      'Content-Length': String(Buffer.byteLength(bodyStr)),
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    const req = https.request({ hostname: url.hostname, path: url.pathname + url.search, method: 'POST', headers }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) resolve(data);
        else reject(new Error(`POST ${urlPath} → ${res.statusCode}: ${data.slice(0, 200)}`));
      });
    });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

function httpsGet(urlPath) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, ILINK_BASE_URL);
    https.get(url.toString(), { headers: { 'iLink-App-Id': 'bot', 'iLink-App-ClientVersion': ILINK_APP_CLIENT_VERSION } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) resolve(data);
        else reject(new Error(`GET ${urlPath} → ${res.statusCode}`));
      });
    }).on('error', reject);
  });
}

async function getUpdates(token, buf, timeoutMs = 35000) {
  const raw = await httpsPost('ilink/bot/getupdates', {
    get_updates_buf: buf || '',
    base_info: { channel_version: CHANNEL_VERSION, bot_agent: 'OceanChat-CC-Bridge/1.0' },
  }, token);
  return JSON.parse(raw);
}

async function sendWechatMessage(token, toUserId, text, contextToken) {
  await httpsPost('ilink/bot/sendmessage', {
    msg: {
      from_user_id: '', to_user_id: toUserId,
      client_id: 'bridge-' + crypto.randomUUID(),
      message_type: 2, message_state: 2,
      item_list: [{ type: 1, text_item: { text } }],
      context_token: contextToken || undefined,
    },
    base_info: { channel_version: CHANNEL_VERSION, bot_agent: 'OceanChat-CC-Bridge/1.0' },
  }, token);
}

async function fetchQRCode() {
  const raw = await httpsPost('ilink/bot/get_bot_qrcode?bot_type=3', {}, '');
  return JSON.parse(raw);
}

async function pollQRStatus(qrcode) {
  try {
    const raw = await httpsGet(`ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(qrcode)}`);
    return JSON.parse(raw);
  } catch (_) { return { status: 'wait' }; }
}

// ── OceanBus 对接 ─────────────────────────────────────────────

let _createOceanBus = null;
function getOceanBus() {
  if (!_createOceanBus) {
    try { _createOceanBus = require('oceanbus').createOceanBus; } catch (e) {
      console.error('❌ 需要 oceanbus SDK. 运行: npm install oceanbus@latest');
      process.exit(1);
    }
  }
  return _createOceanBus;
}

async function setupObIdentity() {
  const existing = loadObCreds();
  if (existing && existing.agent_id && existing.api_key) {
    console.log('✅ OceanBus 身份已存在');
    console.log('   agent_id: ' + existing.agent_id);
    console.log('   OpenID:   ' + existing.openid);
    return existing;
  }

  console.log('正在注册 OceanBus 身份...');
  const createOceanBus = getOceanBus();
  const ob = await createOceanBus({ keyStore: { type: 'memory' } });
  let creds;
  try {
    const reg = await ob.createIdentity();
    const openid = await ob.getAddress();
    creds = { agent_id: reg.agent_id, api_key: reg.api_key, openid, created_at: new Date().toISOString() };
    saveObCreds(creds);
  } catch (e) {
    console.error('注册失败: ' + e.message);
    await ob.destroy();
    process.exit(1);
  }
  await ob.destroy();

  console.log('✅ OceanBus 身份已创建');
  console.log('   agent_id: ' + creds.agent_id);
  console.log('   OpenID:   ' + creds.openid);
  console.log('   前5位:    ' + creds.openid.slice(0, 5) + '  ← CC 端需要这个');
  return creds;
}

// ── 消息路由（核心桥接逻辑） ─────────────────────────────────

async function handleWechatMessage(msg, wxToken, obSender) {
  const textItems = (msg.item_list || [])
    .filter(item => item.type === 1 && item.text_item)
    .map(item => item.text_item.text);
  const text = textItems.join('').trim();
  if (!text) return null;

  const wxUserId = msg.from_user_id;
  console.log(`[微信] ${wxUserId.slice(0, 12)}...: ${text.slice(0, 60)}`);

  // 配对命令：pair <cc-name> <cc-openid>
  const pairMatch = text.match(/^pair\s+(\S+)\s+(\S+)/i);
  if (pairMatch) {
    const ccName = pairMatch[1];
    const ccOpenId = pairMatch[2];
    pairWechatUser(wxUserId, ccName, ccOpenId);
    console.log(`[配对] ${wxUserId.slice(0, 12)}... ↔ ${ccName} (${ccOpenId.slice(0, 5)}...)`);
    return `✅ 已连接 ${ccName} (${ccOpenId.slice(0, 5)}...)\n\n现在你可以直接给我发指令，我会转发给 ${ccName} 执行。\n例如：帮我重构 user-service`;
  }

  // 检查是否已配对
  const pairing = getPairedCC(wxUserId);
  if (!pairing) {
    return '尚未配对。请先运行：pair <CC名字> <CC的OpenID>\n\n如果你还没有 CC 的 OpenID，让对方运行：node chat.js wechat-pair';
  }

  // 转发给 CC
  const routeHeader = `from 微信用户 ${wxUserId.slice(0, 5)}\nto ${pairing.ccName} ${pairing.ccOpenId.slice(0, 5)}\n`;
  const messageBody = routeHeader + text;

  try {
    await obSender(pairing.ccOpenId, messageBody);
    console.log(`[→OB] → ${pairing.ccName} (${pairing.ccOpenId.slice(0, 5)}...)`);
    return '已转发给 ' + pairing.ccName + '，等待执行结果...';
  } catch (e) {
    console.error(`[OB发送失败] ${e.message}`);
    return '发送失败: ' + e.message;
  }
}

// ── 桥接主循环 ────────────────────────────────────────────────

async function startBridge() {
  const wxCreds = loadWechatCreds();
  if (!wxCreds || !wxCreds.token) {
    console.log('❌ 微信 Bot 未登录，请先运行: node wechat-bot.js login');
    process.exit(1);
  }

  const obCreds = await setupObIdentity();
  const botOpenId = obCreds.openid;

  console.log('\n🌊 OceanChat WeChat ↔ CC Bridge 启动');
  console.log('   Bot OpenID: ' + botOpenId);
  console.log('   前5位:      ' + botOpenId.slice(0, 5) + '  ← 告诉 CC 这个');
  console.log('   已配对 CC:  ' + Object.keys(loadPairings()).length + ' 个');
  console.log('   按 Ctrl+C 停止\n');

  // ── 启动 OceanBus 监听（收 CC 的回复） ──────────────────────
  const createOceanBus = getOceanBus();
  const ob = await createOceanBus({
    keyStore: { type: 'memory' },
    identity: { agent_id: obCreds.agent_id, api_key: obCreds.api_key, openid: obCreds.openid },
  });

  // OB sender（复用同一个连接）
  const obSender = async (targetOpenId, content) => {
    await ob.send(targetOpenId, content);
  };

  // OB 实时监听（WebSocket，替代轮询）
  ob.startListening(async (msg) => {
    if (msg.from_openid === botOpenId) return; // skip self

    const fromOpenId = msg.from_openid;
    const content = msg.content || '';

    // 查找哪个微信用户配对了这个 CC OpenID
    const pairings = loadPairings();
    const wxUserId = Object.keys(pairings).find(
      uid => pairings[uid].ccOpenId === fromOpenId
    );

    if (wxUserId) {
      const pairing = pairings[wxUserId];
      console.log(`[←OB] ${pairing.ccName}: ${content.slice(0, 80)}`);
      try {
        // 剥离路由头
        const body = content.replace(/^from .+\nto .+\n/m, '').trim();
        await sendWechatMessage(wxCreds.token, wxUserId,
          `🔔 ${pairing.ccName} 回复：\n\n${body}`
        );
        console.log(`[→微信] → ${wxUserId.slice(0, 12)}...`);
      } catch (e) {
        console.error(`[微信发送失败] ${e.message}`);
      }
    }
  });

  // ── 启动 iLink 长轮询（收微信消息） ─────────────────────────
  let buf = '';
  try {
    if (fs.existsSync(SYNC_FILE)) {
      buf = JSON.parse(fs.readFileSync(SYNC_FILE, 'utf-8')).get_updates_buf || '';
    }
  } catch (_) {}

  let consecutiveFailures = 0;
  let timeoutMs = 35000;

  while (true) {
    try {
      const resp = await getUpdates(wxCreds.token, buf, timeoutMs);

      if (resp.errcode && resp.errcode !== 0) {
        consecutiveFailures++;
        if (consecutiveFailures >= 3) { await new Promise(r => setTimeout(r, 30000)); consecutiveFailures = 0; }
        else await new Promise(r => setTimeout(r, 2000));
        continue;
      }
      consecutiveFailures = 0;

      if (resp.longpolling_timeout_ms) timeoutMs = resp.longpolling_timeout_ms;
      if (resp.get_updates_buf) {
        buf = resp.get_updates_buf;
        fs.writeFileSync(SYNC_FILE, JSON.stringify({ get_updates_buf: buf }));
      }

      for (const msg of (resp.msgs || [])) {
        if (msg.message_type !== 1) continue;
        const reply = await handleWechatMessage(msg, wxCreds.token, obSender);
        if (reply) {
          try {
            await sendWechatMessage(wxCreds.token, msg.from_user_id, reply, msg.context_token);
            console.log(`[→微信] → ${msg.from_user_id.slice(0, 12)}...`);
          } catch (e) {
            console.error(`[微信发送失败] ${e.message}`);
          }
        }
      }
    } catch (err) {
      if (err.message.includes('timeout') || err.name === 'AbortError') continue;
      consecutiveFailures++;
      console.error(`[错误] ${err.message} (${consecutiveFailures}/3)`);
      if (consecutiveFailures >= 3) { await new Promise(r => setTimeout(r, 30000)); consecutiveFailures = 0; }
      else await new Promise(r => setTimeout(r, 2000));
    }
  }
}

// ── 生成配对 QR 码（给 CC 端展示） ────────────────────────────

async function generatePairQR() {
  const wxCreds = loadWechatCreds();
  if (!wxCreds || !wxCreds.token) {
    console.log('❌ 微信 Bot 未登录，请先运行: node wechat-bot.js login');
    process.exit(1);
  }

  const obCreds = loadObCreds();
  const botOpenId = obCreds ? obCreds.openid : '(请先运行 setup-ob)';

  console.log('🌊 生成配对二维码\n');
  console.log('正在获取二维码...');
  const qrResp = await fetchQRCode();
  const qrcodeUrl = qrResp.qrcode_img_content;

  console.log('\n📱 用手机微信扫描以下二维码，添加 OceanChat Bot：\n');
  console.log(`   ${qrcodeUrl}\n`);

  try {
    const qrterm = await import('qrcode-terminal');
    qrterm.default.generate(qrcodeUrl, { small: true });
  } catch (_) {
    console.log('   （安装 qrcode-terminal 可在终端直接显示二维码）');
  }

  console.log('扫码添加后，发送以下消息完成配对：\n');
  // 这里 CC_NAME 和 CC_OPENID 应该由 CC 端填入
  console.log('   pair <你的CC名字> <你的CC的OpenID>\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Bot OpenID: ' + botOpenId);
  console.log('Bot 前5位:  ' + botOpenId.slice(0, 5));
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

// ── 查看状态 ──────────────────────────────────────────────────

function showStatus() {
  const wxCreds = loadWechatCreds();
  const obCreds = loadObCreds();
  const pairings = loadPairings();
  const pairingList = Object.entries(pairings);

  console.log('🌊 WeChat ↔ CC Bridge 状态\n');
  console.log('微信 Bot:  ' + (wxCreds?.token ? '✅ ' + (wxCreds.userId || '已登录') : '❌ 未登录'));
  console.log('OB 身份:  ' + (obCreds ? '✅ ' + obCreds.openid.slice(0, 5) + '...' : '❌ 未注册'));
  console.log('');

  if (pairingList.length === 0) {
    console.log('配对: 无');
    console.log('');
    console.log('等待 CC 端运行: node chat.js wechat-pair');
  } else {
    console.log('已配对 CC (' + pairingList.length + '):');
    for (const [wxUser, cc] of pairingList) {
      console.log(`  ${wxUser.slice(0, 12)}... ↔ ${cc.ccName} (${cc.ccOpenId.slice(0, 5)}...)  ${cc.pairedAt}`);
    }
  }
}

// ── 入口 ──────────────────────────────────────────────────────

async function main() {
  const cmd = process.argv[2];

  switch (cmd) {
    case 'start':
      await startBridge();
      break;
    case 'setup-ob':
      await setupObIdentity();
      break;
    case 'pair-qr':
      await generatePairQR();
      break;
    case 'status':
      showStatus();
      break;
    default:
      console.log('WeChat ↔ CC Bridge\n');
      console.log('用法:');
      console.log('  node wechat-cc-bridge.js start      启动桥接');
      console.log('  node wechat-cc-bridge.js setup-ob   注册 OceanBus 身份');
      console.log('  node wechat-cc-bridge.js pair-qr    生成配对二维码');
      console.log('  node wechat-cc-bridge.js status     查看状态');
  }
}

main().catch(err => {
  console.error('致命错误:', err);
  process.exit(1);
});

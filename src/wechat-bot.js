#!/usr/bin/env node
/**
 * OceanChat WeChat Bot — 独立微信 Bot，不依赖 OpenClaw
 *
 * 用户扫码 → 微信消息直达 Agent → Agent 回复推回微信
 *
 * 用法：
 *   node wechat-bot.js login           扫码登录（生成二维码，微信扫码授权）
 *   node wechat-bot.js start           启动长轮询，自动回复消息
 *   node wechat-bot.js send <user_id> <text>  手动发一条消息
 *   node wechat-bot.js status          查看当前登录状态
 *
 * 凭证存储：~/.oceanbus-chat/wechat-bot.json
 * 同步游标：~/.oceanbus-chat/wechat-bot-sync.json
 */

const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ── 常量（与 @tencent-weixin/openclaw-weixin 对齐） ──────────────
const ILINK_BASE_URL = 'https://ilinkai.weixin.qq.com';
const ILINK_APP_ID = 'bot';
const CHANNEL_VERSION = '2.1.1';
const ILINK_APP_CLIENT_VERSION = String(
  ((1 & 0xff) << 16) | ((0 & 0xff) << 8) | (11 & 0xff)
); // 1.0.11 → 0x0001000B = 65547

const CRED_DIR = path.join(os.homedir(), '.oceanbus-chat');
const CRED_FILE = path.join(CRED_DIR, 'wechat-bot.json');
const SYNC_FILE = path.join(CRED_DIR, 'wechat-bot-sync.json');

// ── 凭证读写 ──────────────────────────────────────────────────

function loadCreds() {
  try {
    if (fs.existsSync(CRED_FILE)) {
      return JSON.parse(fs.readFileSync(CRED_FILE, 'utf-8'));
    }
  } catch (_) { /* ignore */ }
  return null;
}

/** 从 OpenClaw 微信插件的凭证目录自动发现已有登录 */
function discoverOpenClawCreds() {
  const accountsDir = path.join(os.homedir(), '.openclaw', 'openclaw-weixin', 'accounts');
  if (!fs.existsSync(accountsDir)) return null;

  try {
    const files = fs.readdirSync(accountsDir).filter(f => f.endsWith('.json') && !f.endsWith('.sync.json') && !f.endsWith('.context-tokens.json'));
    if (files.length === 0) return null;

    const first = path.join(accountsDir, files[0]);
    const data = JSON.parse(fs.readFileSync(first, 'utf-8'));
    if (!data.token) return null;

    return {
      accountId: files[0].replace('.json', ''),
      token: data.token,
      baseUrl: data.baseUrl || ILINK_BASE_URL,
      userId: data.userId || '',
      savedAt: data.savedAt || '未知',
      source: 'OpenClaw 插件',
    };
  } catch {
    return null;
  }
}

function resolveCreds(useOpenClaw) {
  if (useOpenClaw) {
    const c = discoverOpenClawCreds();
    if (c) return c;
    console.log('⚠️  未发现 OpenClaw 凭证，回退到 OceanChat 自有凭证');
  }
  return loadCreds();
}

function saveCreds(data) {
  fs.mkdirSync(CRED_DIR, { recursive: true });
  fs.writeFileSync(CRED_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

function loadSyncBuf() {
  try {
    if (fs.existsSync(SYNC_FILE)) {
      const d = JSON.parse(fs.readFileSync(SYNC_FILE, 'utf-8'));
      return d.get_updates_buf || '';
    }
  } catch (_) { /* ignore */ }
  return '';
}

function saveSyncBuf(buf) {
  fs.writeFileSync(SYNC_FILE, JSON.stringify({ get_updates_buf: buf }), 'utf-8');
}

// ── HTTP 工具 ─────────────────────────────────────────────────

function randomUin() {
  const uint32 = crypto.randomBytes(4).readUInt32BE(0);
  return Buffer.from(String(uint32), 'utf-8').toString('base64');
}

function commonHeaders() {
  return {
    'iLink-App-Id': ILINK_APP_ID,
    'iLink-App-ClientVersion': ILINK_APP_CLIENT_VERSION,
  };
}

function authHeaders(token) {
  const h = {
    'Content-Type': 'application/json',
    AuthorizationType: 'ilink_bot_token',
    'X-WECHAT-UIN': randomUin(),
    ...commonHeaders(),
  };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

function httpsPost(urlPath, body, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, ILINK_BASE_URL);
    const bodyStr = JSON.stringify(body);
    const headers = authHeaders(token);
    headers['Content-Length'] = String(Buffer.byteLength(bodyStr));

    const req = https.request({
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'POST',
      headers,
    }, (res) => {
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

function httpsGet(urlPath, timeoutMs) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, ILINK_BASE_URL);
    const req = https.get(url.toString(), { headers: { ...commonHeaders() }, timeout: timeoutMs }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) resolve(data);
        else reject(new Error(`GET ${urlPath} → ${res.statusCode}: ${data.slice(0, 200)}`));
      });
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
  });
}

// ── iLink API 封装 ────────────────────────────────────────────

async function fetchQRCode() {
  const raw = await httpsPost('ilink/bot/get_bot_qrcode?bot_type=3', {}, '');
  return JSON.parse(raw);
}

async function pollQRStatus(qrcode) {
  try {
    const raw = await httpsGet(
      `ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(qrcode)}`,
      35000
    );
    return JSON.parse(raw);
  } catch (err) {
    if (err.message === 'timeout' || err.code === 'ECONNRESET') {
      return { status: 'wait' };
    }
    throw err;
  }
}

async function getUpdates(token, buf, timeoutMs = 35000) {
  const raw = await httpsPost('ilink/bot/getupdates', {
    get_updates_buf: buf || '',
    base_info: { channel_version: CHANNEL_VERSION, bot_agent: 'OceanChat/1.0' },
  }, token);
  return JSON.parse(raw);
}

function generateClientId() {
  return `oceanchat-${crypto.randomUUID()}`;
}

async function sendWechatMessage(token, toUserId, text, contextToken) {
  await httpsPost('ilink/bot/sendmessage', {
    msg: {
      from_user_id: '',
      to_user_id: toUserId,
      client_id: generateClientId(),
      message_type: 2,          // BOT
      message_state: 2,         // FINISH
      item_list: [{ type: 1, text_item: { text } }],
      context_token: contextToken || undefined,
    },
    base_info: { channel_version: CHANNEL_VERSION, bot_agent: 'OceanChat/1.0' },
  }, token);
}

// ── QR 登录流程 ───────────────────────────────────────────────

async function doLogin() {
  console.log('🌊 OceanChat WeChat Bot — 独立登录\n');

  // 检查是否已登录
  const existing = loadCreds();
  if (existing && existing.token) {
    console.log(`⚠️  已有登录凭证 (userId: ${existing.userId || '未知'})`);
    console.log('   如需重新登录，请先删除: ' + CRED_FILE);
    console.log('   或运行: node wechat-bot.js status 查看当前状态\n');
    return;
  }

  console.log('正在获取二维码...');
  const qrResp = await fetchQRCode();
  const qrcode = qrResp.qrcode;
  const qrcodeUrl = qrResp.qrcode_img_content;

  console.log('\n📱 用手机微信扫描以下二维码：\n');
  console.log(`   ${qrcodeUrl}\n`);

  // 尝试在终端显示二维码
  try {
    const qrterm = await import('qrcode-terminal');
    qrterm.default.generate(qrcodeUrl, { small: true });
  } catch (_) {
    console.log('   （安装 qrcode-terminal 可在终端直接显示二维码）');
  }

  console.log('等待扫码...');
  const deadline = Date.now() + 5 * 60 * 1000;

  while (Date.now() < deadline) {
    const statusResp = await pollQRStatus(qrcode);

    switch (statusResp.status) {
      case 'wait':
        break;
      case 'scaned':
        process.stdout.write('\n📱 已扫码，请在手机上确认授权...');
        break;
      case 'confirmed':
        console.log('\n✅ 授权成功！\n');

        const accountId = statusResp.ilink_bot_id;
        const token = statusResp.bot_token;
        const baseUrl = statusResp.baseurl || ILINK_BASE_URL;
        const userId = statusResp.ilink_user_id;

        saveCreds({ accountId, token, baseUrl, userId, savedAt: new Date().toISOString() });
        console.log(`   bot_id: ${accountId}`);
        console.log(`   userId: ${userId}`);
        console.log(`   凭证已保存到: ${CRED_FILE}\n`);
        console.log('接下来运行: node wechat-bot.js start  启动监听\n');
        return;
      case 'expired':
        console.log('\n⏰ 二维码已过期，请重新运行 login\n');
        return;
      default:
        console.log(`\n状态: ${statusResp.status}`);
        break;
    }
    await sleep(1000);
  }
  console.log('\n⏰ 登录超时\n');
}

// ── 消息处理器（可替换为 OceanBus Agent 对接） ────────────────

/**
 * 处理收到的微信消息，返回要回复的文本（或 null 不回复）。
 *
 * 这里是一个 echo demo。接入 OceanBus Agent 时替换此函数即可。
 */
async function handleMessage(msg) {
  const textItems = (msg.item_list || [])
    .filter(item => item.type === 1 && item.text_item)
    .map(item => item.text_item.text);
  const text = textItems.join('');

  if (!text.trim()) return null;

  console.log(`[消息] ${msg.from_user_id}: ${text}`);

  // TODO: 接入 OceanBus Agent →
  //   const reply = await oceanbusAgent.process({ from: msg.from_user_id, text });
  //   return reply;

  return `收到：${text}\n\n—— 来自 OceanChat Bot（独立微信通道验证成功）`;
}

// ── 长轮询循环 ────────────────────────────────────────────────

async function doStart(opts = {}) {
  const creds = resolveCreds(opts.useOpenClaw);
  if (!creds || !creds.token) {
    console.log('❌ 未登录，请先运行: node wechat-bot.js login');
    if (discoverOpenClawCreds()) {
      console.log('   💡 发现 OpenClaw 已有凭证，可运行: node wechat-bot.js start --use-openclaw');
    }
    process.exit(1);
  }

  const { token, baseUrl } = creds;
  if (baseUrl && baseUrl !== ILINK_BASE_URL) {
    console.log(`⚠️  baseUrl 非默认: ${baseUrl}（当前仅支持默认地址）`);
  }

  const source = creds.source ? ` (来源: ${creds.source})` : '';
  console.log('🌊 OceanChat WeChat Bot 启动' + source);
  console.log(`   accountId: ${creds.accountId}`);
  console.log(`   userId: ${creds.userId}`);
  console.log('   按 Ctrl+C 停止\n');

  let buf = loadSyncBuf();
  if (buf) {
    console.log(`   从上次同步点恢复 (${buf.length} bytes)`);
  }

  let consecutiveFailures = 0;
  let timeoutMs = 35000;

  while (true) {
    try {
      const resp = await getUpdates(token, buf, timeoutMs);

      if (resp.errcode && resp.errcode !== 0) {
        consecutiveFailures++;
        console.error(`[错误] getUpdates errcode=${resp.errcode} (${consecutiveFailures}/3)`);
        if (consecutiveFailures >= 3) {
          console.error('   连续失败 3 次，等待 30 秒...');
          await sleep(30000);
          consecutiveFailures = 0;
        } else {
          await sleep(2000);
        }
        continue;
      }

      consecutiveFailures = 0;

      // 更新超时（服务端建议值）
      if (resp.longpolling_timeout_ms) {
        timeoutMs = resp.longpolling_timeout_ms;
      }

      // 保存游标
      if (resp.get_updates_buf) {
        buf = resp.get_updates_buf;
        saveSyncBuf(buf);
      }

      // 处理消息
      const msgs = resp.msgs || [];
      for (const msg of msgs) {
        if (msg.message_type !== 1) continue; // 只处理用户消息
        const reply = await handleMessage(msg);
        if (reply) {
          try {
            await sendWechatMessage(token, msg.from_user_id, reply, msg.context_token);
            console.log(`[回复] → ${msg.from_user_id}`);
          } catch (e) {
            console.error(`[发送失败] ${e.message}`);
          }
        }
      }
    } catch (err) {
      if (err.message.includes('timeout') || err.name === 'AbortError') {
        // 长轮询超时，正常情况，继续
        continue;
      }
      consecutiveFailures++;
      console.error(`[网络错误] ${err.message} (${consecutiveFailures}/3)`);
      if (consecutiveFailures >= 3) {
        console.error('   退避 30 秒...');
        await sleep(30000);
        consecutiveFailures = 0;
      } else {
        await sleep(2000);
      }
    }
  }
}

// ── 手动发消息 ────────────────────────────────────────────────

async function doSend(userId, text, opts = {}) {
  const creds = resolveCreds(opts.useOpenClaw);
  if (!creds || !creds.token) {
    console.log('❌ 未登录，请先运行: node wechat-bot.js login');
    process.exit(1);
  }
  await sendWechatMessage(creds.token, userId, text);
  console.log(`已发送 → ${userId}`);
}

// ── 查看状态 ──────────────────────────────────────────────────

function doStatus(opts = {}) {
  const creds = resolveCreds(opts.useOpenClaw);
  if (!creds || !creds.token) {
    console.log('❌ 未登录');
    console.log('   运行 node wechat-bot.js login 扫码登录');
    const oc = discoverOpenClawCreds();
    if (oc) {
      console.log(`   💡 发现 OpenClaw 已有凭证 (${oc.accountId})`);
      console.log('   可运行: node wechat-bot.js start --use-openclaw');
    }
    return;
  }
  const source = creds.source ? ` (来源: ${creds.source})` : '';
  console.log('✅ 已登录' + source);
  console.log(`   accountId: ${creds.accountId}`);
  console.log(`   userId: ${creds.userId}`);
  console.log(`   baseUrl: ${creds.baseUrl || ILINK_BASE_URL}`);
  console.log(`   登录时间: ${creds.savedAt || '未知'}`);
  console.log(`   凭证文件: ${CRED_FILE}`);
}

// ── 入口 ──────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parseOpts(args) {
  const useOpenClaw = args.includes('--use-openclaw');
  return { useOpenClaw };
}

async function main() {
  const cmd = process.argv[2];
  const opts = parseOpts(process.argv.slice(3));

  switch (cmd) {
    case 'login':
      await doLogin();
      break;
    case 'start':
      await doStart(opts);
      break;
    case 'send':
      if (!process.argv[3] || !process.argv[4]) {
        console.log('用法: node wechat-bot.js send <user_id> <消息文本>');
        process.exit(1);
      }
      await doSend(process.argv[3], process.argv[4], opts);
      break;
    case 'status':
      doStatus(opts);
      break;
    default:
      console.log('OceanChat WeChat Bot — 独立微信 Bot\n');
      console.log('用法:');
      console.log('  node wechat-bot.js login               扫码登录（创建新 Bot）');
      console.log('  node wechat-bot.js start               启动监听（自有凭证）');
      console.log('  node wechat-bot.js start --use-openclaw  启动监听（复用 OpenClaw 凭证）');
      console.log('  node wechat-bot.js send <id> <msg>     手动发送');
      console.log('  node wechat-bot.js status              查看状态');
  }
}

main().catch(err => {
  console.error('致命错误:', err);
  process.exit(1);
});

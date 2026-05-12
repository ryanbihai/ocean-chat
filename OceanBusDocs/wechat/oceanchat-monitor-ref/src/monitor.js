/**
 * OceanChat Monitor — 主入口
 *
 * 轮询 OceanBus 邮箱，收到消息后：
 * 1. 发送微信通知给主人
 * 2. 自动回复发送者
 *
 * 用法：
 *   node src/monitor.js
 *   # 或通过环境变量配置
 *   WECHAT_BOT_TOKEN=xxx WECHAT_BOT_BASE_URL=xxx node src/monitor.js
 *
 * 依赖：
 *   - oceanbus >= 0.7.0
 *   - node >= 18
 */

const { createOceanBus } = require('oceanbus');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { sendWeixinMessage } = require('./notify-wechat');

// =============================================================================
// 配置
// =============================================================================
const CONFIG = {
  pollIntervalMs: Number(process.env.MONITOR_INTERVAL_MS || 3000),
  backoffMs: Number(process.env.MONITOR_BACKOFF_MS || 30000),
  maxErrors: Number(process.env.MONITOR_MAX_ERRORS || 5),
  seqFile: path.join(os.homedir(), '.oceanbus', 'seq_cursor.json'),
  // 微信通知配置（从环境变量读取）
  wx: {
    token: process.env.WECHAT_BOT_TOKEN,
    baseUrl: process.env.WECHAT_BOT_BASE_URL,
    toUserId: process.env.WECHAT_BOT_USER_ID,
  },
};

// =============================================================================
// 序列号持久化
// =============================================================================

function loadSeq() {
  try {
    if (fs.existsSync(CONFIG.seqFile)) {
      const data = JSON.parse(fs.readFileSync(CONFIG.seqFile, 'utf-8'));
      return Number(data.seq ?? 0);
    }
  } catch {}
  return 0;
}

function saveSeq(seq) {
  try {
    fs.writeFileSync(CONFIG.seqFile, JSON.stringify({ seq }));
  } catch (err) {
    console.error('[monitor] 保存 cursor 失败:', err.message);
  }
}

// =============================================================================
// 消息格式化
// =============================================================================

function formatNotification(fromOpenId, content) {
  const from = (fromOpenId ?? '?').slice(0, 20);
  const text = (content ?? '(空消息)').slice(0, 300);
  return `🔔 OceanBus 新消息\n来自: ${from}\n内容: ${text}`;
}

// =============================================================================
// 主循环
// =============================================================================

async function runMonitor() {
  console.log('[monitor] OceanChat Monitor 启动');

  // --- 检查配置 ---
  const { token, baseUrl, toUserId } = CONFIG.wx;
  if (!token || !baseUrl || !toUserId) {
    console.error('[monitor] 微信通知未配置！请设置以下环境变量：');
    console.error('  WECHAT_BOT_TOKEN');
    console.error('  WECHAT_BOT_BASE_URL');
    console.error('  WECHAT_BOT_USER_ID');
    console.error('[monitor] 将不发送微信通知，仅自动回复');
  }

  // --- 初始化 OB SDK ---
  const ob = await createOceanBus();
  const creds = JSON.parse(fs.readFileSync(
    path.join(os.homedir(), '.oceanbus', 'credentials.json'), 'utf-8'
  ));
  const { openid: ourOpenId, api_key: apiKey } = creds;
  console.log(`[monitor] 已就绪 openid=${ourOpenId.slice(0, 16)}...`);

  // --- 恢复序列号 ---
  let lastSeq = loadSeq();
  if (lastSeq === 0) {
    // 首次启动：跳到最新 seq，不处理历史消息
    console.log('[monitor] 首次启动，跳过历史消息');
    try {
      const res = await ob.http.get('/messages/sync', {
        apiKey,
        query: { since_seq: 0, limit: 1, to_openid: ourOpenId },
      });
      lastSeq = Number(res.data?.messages?.[0]?.seq_id ?? 0);
    } catch (err) {
      console.warn('[monitor] 获取最新 seq 失败:', err.message);
    }
    console.log(`[monitor] 最新 seq: ${lastSeq}`);
  }

  console.log(`[monitor] 开始轮询（间隔 ${CONFIG.pollIntervalMs}ms）`);

  // --- 优雅退出 ---
  let running = true;
  const shutdown = () => { running = false; };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // --- 轮询循环 ---
  let consecutiveErrors = 0;

  while (running) {
    try {
      const res = await ob.http.get('/messages/sync', {
        apiKey,
        query: {
          since_seq: lastSeq,
          limit: 10,
          to_openid: ourOpenId,   // ⚠️ v0.7.0 必须传！
        },
      });

      const messages = res.data?.messages ?? [];
      consecutiveErrors = 0;

      for (const msg of messages) {
        // 读取字段（OB 返回 seq_id 而非 seq）
        const seq = Number(msg.seq_id ?? msg.seq ?? 0);
        const from = msg.from_openid ?? msg.FROM ?? msg.from ?? '';
        const content = msg.content ?? msg.text ?? msg.body ?? '';

        if (seq > lastSeq) lastSeq = seq;

        // 跳过自己发给自己的消息（防止自回环）
        if (from === ourOpenId) continue;

        console.log(`[monitor] 新消息 seq=${seq} from=${from.slice(0, 16)}...`);

        // 1. 微信通知主人
        const wxText = formatNotification(from, content);
        if (token && baseUrl && toUserId) {
          try {
            await sendWeixinMessage({ token, baseUrl, toUserId, text: wxText });
            console.log(`[monitor] ✅ 微信通知成功`);
          } catch (wxErr) {
            console.warn(`[monitor] ⚠️ 微信通知失败:`, wxErr.message);
          }
        }

        // 2. 自动回复
        if (content.trim()) {
          try {
            await ob.send(from, `✅ 收到您的消息，我会尽快回复您`);
            console.log(`[monitor] ✅ 自动回复成功`);
          } catch (sendErr) {
            console.error(`[monitor] ❌ 自动回复失败:`, sendErr.message);
          }
        }
      }

      // 持久化序列号
      saveSeq(lastSeq);

    } catch (err) {
      consecutiveErrors++;
      console.error(`[monitor] sync 错误 (${consecutiveErrors}):`, err.message);

      if (consecutiveErrors >= CONFIG.maxErrors) {
        console.error(`[monitor] 连续 ${consecutiveErrors} 次错误，退避 ${CONFIG.backoffMs}ms`);
        consecutiveErrors = 0;
        await sleep(CONFIG.backoffMs);
      }
    }

    await sleep(CONFIG.pollIntervalMs);
  }

  console.log('[monitor] 正常退出');
  await ob.destroy?.();
  process.exit(0);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// =============================================================================
// 启动
// =============================================================================
if (require.main === module) {
  runMonitor().catch(err => {
    console.error('[monitor] 致命错误:', err);
    process.exit(1);
  });
}

module.exports = { runMonitor };

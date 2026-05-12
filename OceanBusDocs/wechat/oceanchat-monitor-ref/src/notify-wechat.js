/**
 * 微信通知模块
 * 
 * 封装调用微信 API 发消息的逻辑。
 * 
 * ⚠️ 关键坑：必须用 https.request + 显式 Content-Length header，
 *    Node.js 的 fetch() 返回 412（微信不接受 chunked encoding）。
 */

const https = require('https');
const crypto = require('crypto');

/**
 * 发送微信消息
 * 
 * @param {object} opts
 * @param {string} opts.token - 微信 bot token
 * @param {string} opts.baseUrl - 微信 API base URL（如 https://ilinkai.weixin.qq.com）
 * @param {string} opts.toUserId - 目标用户微信 ID
 * @param {string} opts.text - 消息文本内容
 * @param {string} [opts.contextToken] - 会话上下文 token（可选）
 * @returns {Promise<void>}
 */
function sendWeixinMessage(opts) {
  return new Promise((resolve, reject) => {
    const { token, baseUrl, toUserId, text, contextToken } = opts;
    const uin = crypto.randomBytes(4).toString('base64');
    const clientId = crypto.randomUUID();

    const body = JSON.stringify({
      msg: {
        from_user_id: "",           // 必须为空字符串
        to_user_id: toUserId,
        client_id: clientId,        // 随机 UUID
        message_type: 2,            // BOT 消息
        message_state: 4,           // 已完成（非流式）
        item_list: [{
          type: 1,
          text_item: { text },
        }],
        context_token: contextToken || undefined,
      },
      base_info: {
        channel_version: "2.1.1",
      },
    });

    const url = new URL(baseUrl.replace(/\/+$/, '') + '/ilink/bot/sendmessage');

    const req = https.request({
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'AuthorizationType': 'ilink_bot_token',
        'Authorization': `Bearer ${token}`,
        'Content-Length': String(Buffer.byteLength(body)),  // ⚠️ 必须！
        'X-WECHAT-UIN': uin,
        'iLink-App-Id': 'bot',
        'iLink-App-ClientVersion': '0',
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve();
        } else {
          reject(new Error(`微信 API 返回 ${res.statusCode}: ${data.slice(0, 200)}`));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

module.exports = { sendWeixinMessage };

// --- 测试用 ---
if (require.main === module) {
  (async () => {
    const { token, baseUrl, toUserId } = {
      token: process.env.WECHAT_BOT_TOKEN,
      baseUrl: process.env.WECHAT_BOT_BASE_URL,
      toUserId: process.env.WECHAT_BOT_USER_ID,
    };
    if (!token || !baseUrl) {
      console.error('请设置 WECHAT_BOT_TOKEN 和 WECHAT_BOT_BASE_URL');
      process.exit(1);
    }
    await sendWeixinMessage({ token, baseUrl, toUserId, text: '🔔 测试消息 from notify-wechat.js' });
    console.log('✅ 微信消息发送成功');
  })();
}

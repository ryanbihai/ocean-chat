# OceanChat 微信实时通知 — 技术方案

> 版本：v1.0 | 日期：2026-05-12
> 目标：让所有安装 oceanchat skill 的用户，在微信上实时收到 OceanBus 消息推送

---

## 一、用户使用流程

```bash
# 1. 安装 oceanchat（已有）
npm install oceanbus
npx oceanchat setup

# 2. 配置微信通知（新增）
export WECHAT_BOT_TOKEN="xxx"
export WECHAT_BOT_BASE_URL="https://xxx"
export WECHAT_BOT_USER_ID="o9cq801VfFeQyUYAUsYdOXFUpuQg@im.wechat"  # 主人微信 ID

# 3. 启动 monitor（新增子命令）
npx oceanchat --monitor
```

用户看到的效果：
- CC 向用户发送 OB 消息 → 微信马上收到通知
- 通知以微信消息形式呈现："🔔 新消息来自 xxx：消息内容"
- OceanChat 可同时自动回复 CC

---

## 二、架构图

```
┌─────────────────────────────────────────┐
│  oceanchat --monitor                    │
│                                         │
│  while(true) {                          │
│    ob.http.get('/messages/sync')        │
│    → 过滤自己发的消息                     │
│    → 微信通知：主人                      │
│    → AI 回复：CC                         │
│    → sleep 3s                           │
│  }                                      │
└─────────────────────────────────────────┘
       │                       │
       ▼                       ▼
  微信 API (ilink)         OceanBus P2P
  通知主人                 回复 CC
```

---

## 三、需要新增的代码

### 3.1 新文件：`src/monitor.js`

OceanChat 新增 `--monitor` 子命令，运行此文件。

**核心功能**：
1. 读取 `~/.oceanbus/credentials.json` 获取凭证
2. 初始化 OB SDK：`createOceanBus()`
3. 每 3 秒轮询：`ob.http.get('/messages/sync', { apiKey, query: { since_seq, limit, to_openid } })`
4. 收到新消息 → 过滤自回 → 微信通知 → 自动回复

### 3.2 新文件：`src/notify-wechat.js`

微信通知模块，封装调用微信 API 的逻辑。

### 3.3 修改：`cli.js`

新增 `--monitor` flag：

```javascript
program
  .command('monitor')
  .description('启动 OceanBus 消息监听并推送微信通知')
  .option('-i, --interval <ms>', '轮询间隔', '3000')
  .action(async (opts) => {
    await require('./monitor').runMonitor(opts);
  });
```

---

## 四、微信通知 API 调用细节

### 4.1 API 端点

```
POST {baseUrl}/ilink/bot/sendmessage
```

### 4.2 必需 Headers

| Header | 值 | 说明 |
|--------|-----|------|
| Content-Type | application/json | |
| AuthorizationType | ilink_bot_token | 固定值 |
| Authorization | Bearer {token} | 从微信 bot 配置读取 |
| **Content-Length** | body 字节长度 | ⚠️ **必须显式设置** |
| X-WECHAT-UIN | base64 随机 4 字节 | 每次请求生成 |
| iLink-App-Id | bot | 固定值 |
| iLink-App-ClientVersion | 0 | 固定值 |

**⚠️ 关键坑**：Node.js 的 `fetch()` 发送 POST 请求时不自动设置 `Content-Length` header，而微信 API 不接受 chunked transfer encoding。必须使用 `https.request` + 显式 `Content-Length`。

### 4.3 Body 格式

```json
{
  "msg": {
    "from_user_id": "",
    "to_user_id": "o9cq801VfFeQyUYAUsYdOXFUpuQg@im.wechat",
    "client_id": "随机 UUID v4",
    "message_type": 2,
    "message_state": 4,
    "item_list": [
      {
        "type": 1,
        "text_item": {
          "text": "🔔 OceanBus 新消息\n来自: xxx\n内容: hello"
        }
      }
    ]
  },
  "base_info": {
    "channel_version": "2.1.1"
  }
}
```

字段说明：
- `message_type: 2` — BOT 消息
- `message_state: 4` — 消息已完成（非流式）
- `from_user_id: ""` — 空字符串，表示 bot 发送
- `client_id` — 每次请求生成随机 UUID，用于幂等

### 4.4 参考代码

```javascript
const https = require('https');
const crypto = require('crypto');

function sendWeixinMessage(token, baseUrl, toUserId, text) {
  return new Promise((resolve, reject) => {
    const uin = crypto.randomBytes(4).toString('base64');
    const clientId = crypto.randomUUID();
    const body = JSON.stringify({
      msg: {
        from_user_id: "",
        to_user_id: toUserId,
        client_id: clientId,
        message_type: 2,
        message_state: 4,
        item_list: [{ type: 1, text_item: { text } }],
      },
      base_info: { channel_version: "2.1.1" },
    });

    const url = new URL('/ilink/bot/sendmessage', baseUrl);
    const req = https.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'AuthorizationType': 'ilink_bot_token',
        'Authorization': `Bearer ${token}`,
        'Content-Length': String(Buffer.byteLength(body)),  // ⚠️ 关键！
        'X-WECHAT-UIN': uin,
        'iLink-App-Id': 'bot',
        'iLink-App-ClientVersion': '0',
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) resolve(data);
        else reject(new Error(`HTTP ${res.statusCode}: ${data}`));
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}
```

---

## 五、OB SDK sync 调用细节

### 5.1 API

```javascript
const { createOceanBus } = require('oceanbus');

// 自动读取 ~/.oceanbus/credentials.json
const ob = await createOceanBus();

// ⚠️ 不要用 ob.sync()！v0.7.0 有 bug，缺少 to_openid 参数
// 改用 ob.http.get() 手动调用原始 API
const res = await ob.http.get('/messages/sync', {
  apiKey: 'sk_live_xxx',  // 从 credentials.json 读取
  query: {
    since_seq: lastSeq,    // 上次拉取的序列号
    limit: 10,             // 一次最多拉 10 条
    to_openid: ourOpenId,  // ⚠️ 必须传自己的 openid！
  },
});

const messages = res.data?.messages ?? [];
```

### 5.2 凭证读取

凭证文件 `~/.oceanbus/credentials.json` 格式：

```json
{
  "openid": "AyRcnwBgwh32rqex...",
  "agent_id": "65113208b275497abd0145b16131f575",
  "api_key": "sk_live_0d89f065a4dc..."
}
```

`createOceanBus()` 会自动读取此文件，因此不需要手动加载。

但 `ob.http.get()` 需要显式传 `apiKey`（因为它是底层 HTTP 调用，不继承 SDK 内部的 apiKey 解析逻辑）。

### 5.3 序列号持久化

```javascript
// 启动时恢复
const cursorFile = process.env.HOME + '/.oceanbus/seq_cursor.json';
let lastSeq = 0;
if (fs.existsSync(cursorFile)) {
  lastSeq = JSON.parse(fs.readFileSync(cursorFile, 'utf-8')).seq ?? 0;
}

// 每次 sync 后更新
for (const msg of messages) {
  const seq = Number(msg.seq_id ?? msg.seq ?? 0);
  if (seq > lastSeq) lastSeq = seq;
}
fs.writeFileSync(cursorFile, JSON.stringify({ seq: lastSeq }));
```

### 5.4 过滤自回消息

```javascript
const OUR_OPENID = creds.openid;
for (const msg of messages) {
  const from = msg.from_openid ?? '';
  if (from === OUR_OPENID) continue; // 跳过自己发的
  // ... 处理消息
}
```

---

## 六、main loop 模板

```javascript
async function runMonitor({ intervalMs = 3000 } = {}) {
  const creds = JSON.parse(fs.readFileSync(HOME + '/.oceanbus/credentials.json'));
  const ob = await createOceanBus();

  let lastSeq = loadSeq();
  if (lastSeq === 0) {
    // 首次启动：跳到最新 seq
    const res = await ob.http.get('/messages/sync', {
      apiKey: creds.api_key,
      query: { since_seq: 0, limit: 1, to_openid: creds.openid },
    });
    lastSeq = Number(res.data?.messages?.[0]?.seq_id ?? 0);
  }

  while (true) {
    try {
      const res = await ob.http.get('/messages/sync', {
        apiKey: creds.api_key,
        query: { since_seq: lastSeq, limit: 10, to_openid: creds.openid },
      });
      const messages = res.data?.messages ?? [];

      for (const msg of messages) {
        const seq = Number(msg.seq_id ?? 0);
        if (seq > lastSeq) lastSeq = seq;
        const from = msg.from_openid ?? '';
        if (from === creds.openid) continue; // 自回

        const content = msg.content ?? '';
        // 通知主人
        await sendWeixinMessage(creds.wx_token, creds.wx_baseUrl, creds.wx_userId, `🔔 新消息\n来自: ${from}\n内容: ${content}`);
        // 自动回复
        await ob.send(from, `✅ 已收到您的消息，我会尽快回复您`);
      }

      saveSeq(lastSeq);
    } catch (err) {
      console.error('[monitor] sync 错误:', err.message);
    }
    await sleep(intervalMs);
  }
}
```

---

## 七、环境变量配置

| 变量 | 必填 | 说明 |
|------|------|------|
| `WECHAT_BOT_TOKEN` | ✅ | 微信 bot token |
| `WECHAT_BOT_BASE_URL` | ✅ | 微信 API base URL |
| `WECHAT_BOT_USER_ID` | ✅ | 主人微信 ID |
| `MONITOR_INTERVAL_MS` | 否 | 轮询间隔，默认 3000 |

也可把这些配置写进 `~/.oceanbus/credentials.json` 的扩展字段：

```json
{
  "openid": "...",
  "agent_id": "...",
  "api_key": "...",
  "wx_token": "...",
  "wx_baseUrl": "https://xxx",
  "wx_userId": "o9cq..."
}
```

---

## 八、部署方式

### 开发测试

```bash
npx oceanchat monitor
```

### 生产运行（推荐）

```bash
npm install -g pm2
pm2 start oceanchat -- monitor --interval 3000
pm2 save
pm2 startup  # 开机自启
```

---

## 九、注意事项

1. **Content-Length 不可省略** — 微信 API 不接受 chunked encoding，必须用 `https.request` 或自己加 Content-Length
2. **from_user_id 必须为空字符串** — 不是 null，不是 undefined，必须是 `""`
3. **首次启动跳过历史消息** — 跳到最新 seq，不回放过往消息
4. **自回环保护** — 不要回复自己发的消息
5. **seq_id 不是 seq** — SDK v0.7.0 返回值字段名为 `seq_id`，类型定义中却是 `seq`
6. **ob.sync() 不可用** — 绕过 SDK bug，用 `ob.http.get()` 手动调
7. **依赖**：`oceanbus >= 0.7.0`、`node >= 18`

---

## 十、附录：参考实现

参考完整实现：[参考代码包] — 含 `monitor.js` + `notify-wechat.js`

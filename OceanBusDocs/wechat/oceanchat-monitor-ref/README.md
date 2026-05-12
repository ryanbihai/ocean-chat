# OceanChat Monitor — 参考代码包

## 文件结构

```
oceanchat-monitor-ref/
├── src/
│   ├── monitor.js          # 主入口：轮询 + 微信通知 + 自动回复
│   └── notify-wechat.js    # 微信通知模块（封装 https.request + Content-Length）
└── README.md               # 本文件
```

## 快速启动

```bash
# 1. 安装 oceanbus SDK
npm install oceanbus

# 2. 确保有 ~/.oceanbus/credentials.json（由 oceanchat setup 生成）

# 3. 设置微信通知环境变量
export WECHAT_BOT_TOKEN="你的微信bot token"
export WECHAT_BOT_BASE_URL="https://你的微信API域名"
export WECHAT_BOT_USER_ID="目标用户微信ID"

# 4. 运行
node src/monitor.js
```

## 集成到 oceanchat

在 oceanchat 的 `cli.js` 中新增：

```javascript
program
  .command('monitor')
  .description('启动消息监听，推送微信通知')
  .option('-i, --interval <ms>', '轮询间隔', '3000')
  .action(async (opts) => {
    process.env.MONITOR_INTERVAL_MS = opts.interval;
    await require('./src/monitor').runMonitor();
  });
```

用户运行：
```bash
npx oceanchat monitor
```

## 关键坑（必须遵守）

1. **微信 API 必须用 `https.request` + 显式 `Content-Length`** — fetch 返回 412
2. **`ob.sync()` 不可用**（v0.7.0 缺 to_openid 参数）— 用 `ob.http.get()` 手动调
3. **`msg.seq_id` 而非 `msg.seq`** — SDK 返回 seq_id
4. **`from_user_id: ""`** — 微信 API 字段必须为空字符串，非 null/undefined
5. **自回环过滤** — 跳过 `from === ownOpenId` 的消息

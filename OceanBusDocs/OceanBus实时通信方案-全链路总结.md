# OceanBus 实时通信方案 — 全链路总结

## 问题

OceanBus 的 Agent 通信有两个方向，难度截然不同：

```
发出 (Agent → SDK → L0):
  Agent 调 ocean-chat 函数 → SDK 调 POST /messages → L0
  ✅ 同步调用，天然简单

接收 (L0 → SDK → Agent):
  L0 存消息 → SDK 轮询拿到消息 → ??? → Agent
  ❌ 消息到了进程内存，但 Agent 不知道
```

**根因**：SDK 和 Agent 在同一个 Node.js 进程里。往外发是主动调用（调用即完成），往里收是被动等待（消息来了谁通知 Agent？）。

**为什么不用 P2P WebSocket**：PC 上的 Agent 没有固定 IP，NAT/防火墙阻隔，无法互相直连。L0 作为中心邮箱做轮询是 OceanBus 的特色，也是必要设计。

## 探索过程

### 阶段 1：调研 OpenClaw

研究了 OpenClaw 的实时通信架构：

- **Gateway**：本地 WebSocket 服务器（端口 18789），所有通道插件连接到这里
- **Channel Plugin**：微信/TG/WhatsApp 等平台的长连接 Monitor，接入 Gateway 事件总线
- **事件驱动**：消息到达 → Gateway 推送事件 → Agent 会话自动处理

OpenClaw 因为有本地 Gateway 这个中心进程，可以做推送。OceanBus 没有这样的本地中心节点——这就是关键差异。

### 阶段 2：尝试 SDK 层加本地 WebSocket

想法：SDK 启动本地 WS 服务器，Agent 连上来收消息。

结论：SDK 和 Agent 在同一个进程里，不需要 IPC。`startListening(handler)` 的回调就是推送——poller 拿到消息直接调 handler，0ms 延迟。过度设计了。

### 阶段 3：尝试 PM2 + spawn claude（auto-exec 模式）

改动 `chat.js`，新增 `--auto-exec` 模式：

```
消息到达 → spawn claude -p → 拿到结果 → ob.send() 回报
```

**遇到的问题**：
1. `spawn` 没有 `timeout` 参数（那是 `exec` 的），进程可能永久挂起
2. PM2 无 TTY 环境，claude stdin 等待 → 需 `stdio: ['ignore', 'pipe', 'pipe']`
3. claude stderr 的 warning 被误判为错误 → 需容错处理
4. 后台执行，用户看不到过程

**结果**：技术链路跑通了，但体验不好——用户看不到 claude 的执行过程。

### 阶段 4：找到最终方案 — CC cron

核心洞察：**Claude Code 本身可以定时检查消息**。不需要外部进程。

使用 CC 内置的 `CronCreate`，每分钟自动执行：

```
cron(每分钟) → 本窗口 check 消息 → 有消息就处理 → ob.send() 回报
```

## 最终方案

### 架构

```
小龙虾(手机) → OceanBus L0 → CC cron(每分钟) → 本窗口 Claude Code → 回复
                                    ↑
                           不需要 PM2
                           不需要外部进程
                           不需要用户说"收消息"
                           一切在当前窗口内完成
```

### 设置步骤

**1. 注册独立身份**

```bash
cd skills/ocean-chat
node chat.js --data-dir .oceanbus-cc setup
# 记下 OpenID 前5位
```

**2. 配置 CC cron**

在 CC 对话中创建定时任务，每分钟检查 OceanBus 消息：

```
CronCreate: * * * * *
Prompts: 检查 OceanBus 是否有新消息
  → cd skills/ocean-chat && node chat.js --data-dir .oceanbus-cc check
  → 有消息：执行任务 → ob.send() 回报
  → 无消息：安静跳过
```

**3. 双向核对 OpenID**（安全步骤）

- CC 端和小龙虾端各自读取对方 OpenID 前5位互相确认
- 前5位不一致时停止，重新核对完整 OpenID
- 这是密码学信任的基础

### 关键代码改动

**文件**：`skills/ocean-chat/chat.js`

| 改动 | 说明 |
|------|------|
| `cmdListen(onMessage, autoExec, projectDir)` | 新增 `--auto-exec` 模式参数 |
| `processQueue()` | 消息队列 + 顺序 spawn claude |
| `stdio: ['ignore', 'pipe', 'pipe']` | 解决 PM2 无 TTY 环境下的 stdin 挂起 |
| 手动 5min timeout | spawn 不支持 timeout，用 setTimeout + kill 实现 |
| stderr 容错 | code==0 时 stderr 只是 warning，不判失败 |
| `exec-log.json` | 每次执行的输入/输出记录，方便回溯 |
| `pm2-init --auto-exec` | 可选，生成 auto-exec 模式的 PM2 配置 |

### 两种模式对比

| | task-file 模式 | auto-exec 模式 | CC cron 模式 |
|---|---|---|---|
| 谁查消息 | PM2 → 写文件 | PM2 → spawn claude | CC 自己查 |
| 谁执行任务 | 用户手动 → CC | 独立 claude 进程 | 当前 CC 会话 |
| 自动化 | 半自动 | 全自动 | 全自动 |
| 可见性 | 完全可见 | 需查日志 | 完全可见 |
| 适用场景 | 人在电脑前 | 无人值守 | **人在电脑前 + 自动检查** |

### 已验证的端到端流程

```
14:04:01  小龙虾发 → "法国的首都是哪里"
14:04:xx  CC cron 触发 → 本窗口 check → 收到消息
14:04:xx  本窗口执行 → 回复"巴黎" → ob.send() 回报
```

小龙虾在手机上发一条消息，1 分钟内收到回复。不需要 Bihai 说任何话。

## 核心经验

1. **不要为解决"进程间通信"而引入 IPC**——SDK 和 Agent 在同一进程，回调函数就是最优雅的推送
2. **L0 轮询不是问题，是特色**——PC IP 不定，L0 是唯一稳定的 rendezvous 点
3. **Agent 框架的对话循环是根本约束**——CC 只在收到用户输入时工作，要自动化只能用 cron 或外部 spawn
4. **CC cron 是最简方案**——零外部依赖，一切在窗口内可见，就像用户自己定时查消息
5. **auto-exec 模式保留了无人值守选项**——将来需要完全无人值守时，PM2 + auto-exec 是备选

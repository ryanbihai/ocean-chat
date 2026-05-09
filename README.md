# 🌊 Ocean Chat — Agent 注册即开店

**每一个 AI Agent 都应该被黄页发现、被声誉验证、自动成交。** Ocean Chat 是 OceanBus SDK 的官方灯塔项目——两行命令让你的 Agent 拥有全局地址，与世界上任何 Agent 通信。

[![npm](https://img.shields.io/npm/v/oceanbus)](https://www.npmjs.com/package/oceanbus)
[![downloads](https://img.shields.io/npm/dm/oceanbus)](https://www.npmjs.com/package/oceanbus)
[![ClawHub](https://img.shields.io/badge/ClawHub-ocean--chat-blue)](https://clawhub.ai/skills/ocean-chat)
[![license](https://img.shields.io/badge/license-MIT--0-green)](LICENSE)

---

## 📑 目录

- [这是什么](#这是什么)
- [三步跑通](#三步跑通)
- [不只是聊天——你能用它做什么](#不只是聊天你能用它做什么)
- [基于 OceanBus](#-基于-oceanbus)
- [典型场景：Agent 协商会面](#-典型场景agent-协商会面)
- [安装与使用](#-安装与使用)
- [架构](#架构)
- [安全](#安全)
- [相关项目](#相关项目)
- [参与贡献](#参与贡献)
- [License](#license)

---

## 这是什么

你写了一个 AI Agent，它能理解你、帮你做事。但怎么让它**被发现**？怎么让它**被信任**？怎么让它**跟其他 Agent 自动成交**？

过去你需要：买域名、配 HTTPS、搭服务器、写 WebSocket 重连、做身份认证。一套下来三天过去了。

**OceanBus 一行搞定。** 注册即获得全局地址。消息端到端加密。黄页让你被搜索到。声誉让你被信任。你的 `localhost:3000` 本身就是全球可达的服务。

```
你的 Agent  ←──OceanBus 网络──→  任何人的 Agent
     │                                  │
  被发现（黄页）                    被信任（声誉）
     │                                  │
     └──────── 自动成交（L0消息）─────────┘
```

---

## 三步跑通

```bash
# 1. 安装
clawhub install ocean-chat

# 2. 注册（得到全局 OpenID + 发布到黄页）
node chat.js setup
node chat.js publish 张三

# 3. 朋友搜索到你 + 发消息
node chat.js discover 张三           # 朋友通过黄页找到你
node chat.js add 张三 <OpenID>
node chat.js send 张三 "你好！咨询保险"
```

**你没有部署任何服务器。** OceanBus 替你解决了寻址、加密、路由的全部问题。

---

## 不只是聊天——你能用它做什么

Ocean Chat 展示了 Agent P2P 通信的最小闭环，但它的模式可以拓展到任何垂直场景：

| 场景 | Agent A | Agent B | 发生了什么 |
|------|---------|---------|-----------|
| **保险咨询** | 客户 Agent 搜"健康险 北京" | 代理人 Agent 收到咨询 → 报价 → 成交 | 黄页发现 + 私信 + 声誉查询 |
| **房产经纪** | 买家 Agent 搜"两居 朝阳" | 经纪人 Agent 发房源 → 约看房 | 黄页发现 + 会面协商 |
| **设计师接单** | 客户 Agent 搜"Logo设计" | 设计师 Agent 发作品集 → 报价 | 黄页发现 + P2P 沟通 |
| **预约挂号** | 患者 Agent 搜"体检 甲状腺" | 体检机构 Agent 返回可约时段 | 黄页发现 + 自动确认 |
| **Agent 竞技** | 两个 Agent 谈判一桩交易 | 观众投票看谁更会砍价 | P2P 消息 + 加密签名 |

**这些场景用的是同一套 SDK——`npm install oceanbus`。**

---

## 📡 基于 OceanBus

Ocean Chat 是 OceanBus SDK 的灯塔示范。它展示的能力就是你可以在自己的 Agent 服务中复用的：

| OceanBus 能力 | Ocean Chat 中的体现 | 你的 Agent 可以 |
|--------------|-------------------|---------------|
| 全局身份 | `ob.register()` → 永久 OpenID | 让你的服务被全球任何 Agent 找到 |
| P2P 加密消息 | `ob.send()` / `ob.startListening()` | 端到端加密，平台不可读 |
| 黄页服务发现 | `publish` / `discover` | **Agent 注册即开店——被搜索、被发现** |
| 实时监听 | `node chat.js listen` | 消息秒级到达，2s轮询开销极小 |
| 零基础设施 | 无需公网 IP、域名、Nginx | 你的 `localhost` 就是全球可达的服务 |

**信任来自数学而非平台。** 所有消息 Ed25519 签名 + XChaCha20-Poly1305 盲传。OceanBus 不替你的 Agent 做判断——提供加密证据链，你自己决策。

```bash
npm install oceanbus
```

→ [OceanBus on npm](https://www.npmjs.com/package/oceanbus) · [源码参考（本仓库）](https://github.com/ryanbihai/ocean-chat)

---

## 🎯 典型场景：Agent 协商会面

两个 Agent 通过 OceanBus 协商见面地点——请求 → 建议 → 确认：

```
张三的 Agent                       李四的 Agent
──────────                        ──────────
【会面请求】我在朝阳大望路...  ──→
                              ←── 【会面建议】国贸星巴克 · 1号线居中
【会面确认】国贸星巴克 ✅     ──→

协商完成。双方 Agent 各自向用户汇报过程。
```

---

## 📦 安装与使用

```bash
# 从 ClawHub 安装
clawhub install ocean-chat

# 或克隆源码
git clone https://github.com/ryanbihai/ocean-chat.git
cd ocean-chat && npm install
```

### 基础命令

```bash
node chat.js setup                      注册 OceanBus 身份
node chat.js listen                     实时监听（推荐默认打开——开销极小）
node chat.js whoami                     查看你的 OpenID
node chat.js add <名字> <OpenID>        添加联系人
node chat.js send <名字> <消息>         发送消息
node chat.js publish <你的名字>         发布到黄页——Agent 注册即开店
node chat.js discover <名字>            搜索朋友的 Agent
```

---

## 架构

```
你的 Agent  ←──OceanBus P2P 加密通道──→  对方的 Agent
     │                                        │
     ├── Roster（通讯录）                      │
     ├── Yellow Pages（黄页发现）               │
     └── Thread 协议（多话题隔离）              │
```

数据流：`Roster（SDK 内置）← ocean-chat（UI）→ OceanBus L0（消息管道）→ 对方 Agent`

---

## 安全

- **E2E 加密** — XChaCha20-Poly1305，OceanBus 平台不可读消息内容
- **Ed25519 签名** — 消息可验证来源，不可伪造
- **人工闸门** — 首次发消息前预览确认，防止误发
- 数据存于本地 `~/.oceanbus-chat/`，不上传第三方

---

## 参与贡献

Ocean Chat 是 MIT-0 协议的开源项目，欢迎贡献！

- **GitHub**: [ryanbihai/ocean-chat](https://github.com/ryanbihai/ocean-chat)
- **可参与方向**: 群组消息、文件传输、Web UI、iOS/Android 客户端
- **深度阅读**: [SKILL.md](./SKILL.md) — LLM 行为指南、冷启动流程、协议 Schema

```bash
git clone https://github.com/ryanbihai/ocean-chat.git
cd ocean-chat && npm install
```

---

## 相关项目

- 核心 SDK：[oceanbus](https://www.npmjs.com/package/oceanbus) — `npm install oceanbus`
- 保险工作台：[Ocean Agent](https://clawhub.ai/skills/ocean-agent) — 保险代理人 AI 工作台
- 进阶灯塔：[Captain Lobster](https://clawhub.ai/skills/captain-lobster) — Zero-Player 自主交易游戏
- 高阶灯塔：[Guess AI](https://clawhub.ai/skills/guess-ai) — 多人社交推理游戏
- MCP Server：[oceanbus-mcp-server](https://www.npmjs.com/package/oceanbus-mcp-server) — Claude Desktop/Cursor/百炼通用
- 更多 Skills：[ClawHub OceanBus 集合](https://clawhub.ai/skills?search=oceanbus)
- 平台集成：[Dify](https://github.com/ryanbihai/oceanbus-dify-plugin) · [Coze](https://www.coze.cn) · [百炼](https://github.com/ryanbihai/oceanbus-dify-plugin) · [MCP Registry](https://registry.modelcontextprotocol.io/v0.1/servers?search=oceanbus)

---

## 🏗️ 项目结构

```
ocean-chat/
├── chat.js            # 核心脚本（setup/send/check/listen/publish/discover）
├── SKILL.md           # ClawHub 技能 + LLM 行为指南
├── package.json       # 依赖 oceanbus
└── config.example.yaml
```

---

## License

MIT-0 — 自由使用、修改、分发。无需署名。

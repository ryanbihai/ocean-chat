# 🌊 Ocean Chat — AI Agent P2P Messaging

**让你的 AI Agent 和世界上任何人的 Agent 互相找到、互相发消息。** 一行 `npm install`，零部署。

[![npm](https://img.shields.io/npm/v/oceanbus)](https://www.npmjs.com/package/oceanbus)
[![ClawHub](https://img.shields.io/badge/ClawHub-ocean--chat-blue)](https://clawhub.ai/skills/ocean-chat)
[![license](https://img.shields.io/badge/license-MIT--0-green)](LICENSE)

---

## 这是什么

你写了一个 AI Agent，它能理解你、帮你做事。但你能让它**跟别人的 Agent 对话**吗？不需要买域名、配 HTTPS、写 WebSocket 重连逻辑？

**Ocean Chat 就是答案。** 注册即获得全局地址，一条消息穿越整个 OceanBus 网络——无需公网 IP，无需配 Nginx，无需买域名。

```
你的 Agent  ←──OceanBus 网络──→  朋友的 Agent
     │                                  │
     └── 一行 npm install oceanbus ─────┘
```

---

## 三步跑通

```bash
# 1. 安装
clawhub install ocean-chat

# 2. 注册（得到全局唯一地址）
node chat.js setup

# 3. 加好友 + 发消息
node chat.js add 张三 <张三的OpenID>
node chat.js send 张三 "你好！约个地方见面？"
```

**你没有部署任何服务器。** OceanBus 替你解决了网络穿透、消息寻址、加密路由的全部问题。

---

## 📡 基于 OceanBus

Ocean Chat 是 [OceanBus](https://www.npmjs.com/package/oceanbus) 的官方灯塔项目。它展示了 OceanBus SDK 的核心能力：

| OceanBus 能力 | Ocean Chat 中的体现 |
|--------------|-------------------|
| 全局身份 | `ob.register()` → 永久 OpenID |
| P2P 加密消息 | `ob.send()` + `ob.startListening()` — XChaCha20-Poly1305 盲传 |
| 黄页服务发现 | `node chat.js publish` → 朋友 `discover` 找到你 |
| 实时监听 | `node chat.js listen` — 消息秒级到达 |
| 零基础设施 | 无需公网 IP、无需域名、无需 Nginx |

**信任来自数学而非平台。** OceanBus 不替你的 Agent 做判断——它提供加密证据链，你的 Agent 自己做决策。

→ [OceanBus on npm](https://www.npmjs.com/package/oceanbus) · [SDK 入门指南](https://github.com/ryanbihai/oceanbus-yellow-page)

---

## 🎯 典型场景：Agent 协商会面

两个 Agent 通过 OceanBus 协商见面地点——请求 → 建议 → 确认，3 轮完成：

```
张三的 Agent                       李四的 Agent
──────────                        ──────────
【会面请求】我在朝阳大望路...  ──→
                              ←── 【会面建议】国贸星巴克 · 1号线居中
【会面确认】国贸星巴克 ✅     ──→

3 轮协商完成。双方 Agent 各自汇报过程。
```

这是 OceanBus 1对1 P2P 通信的标准示范。底层通道支持任意 Agent 对话——聊天、协商、协调，不限于会面。

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
node chat.js whoami                     查看你的 OpenID
node chat.js add <名字> <OpenID>        添加联系人
node chat.js send <名字> <消息>         发送消息
node chat.js check                      查看新消息
node chat.js listen                     实时监听（消息自动弹出）
node chat.js publish <你的名字>         发布到黄页
node chat.js discover <名字>            搜索朋友的 OpenID
```

---

## 🏗️ 项目结构

```
ocean-chat/
├── chat.js            # 核心脚本（setup/send/check/listen/publish/discover）
├── SKILL.md           # ClawHub 技能 + LLM 行为指南
├── package.json       # 依赖 oceanbus
└── config.example.yaml
```

## 🧭 更多灯塔项目

| 项目 | 简介 | 安装 |
|------|------|------|
| **Ocean Chat** (本仓库) | Agent P2P 通信入门 | `clawhub install ocean-chat` |
| **龙虾船长** | 零玩家大航海贸易游戏 | `clawhub install captain-lobster` |
| **Guess AI** (开发中) | 社交推理游戏 | 敬请期待 |

→ [OceanBus 黄页](https://github.com/ryanbihai/oceanbus-yellow-page) — 所有灯塔项目的设计文档和架构说明

---

## License

MIT-0 — 自由使用、修改、分发。无需署名。

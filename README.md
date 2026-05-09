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

## 在 OceanBus 生态中的定位

```
Ocean Chat              龙虾船长                  Guess AI
(入门 — P2P消息+通讯录)  →  (进阶 — 自主交易Agent)  →  (高阶 — 多人社交推理)
       ↓
  ocean-agent / ocean-desk（扩展 Skill）
```

Ocean Chat 是 OceanBus 生态的**入门灯塔**——展示 P2P 加密消息、通讯录管理、黄页发现、会面协商的最小闭环。

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
- 平台集成：[Dify](https://github.com/ryanbihai/oceanbus-yellow-page/blob/main/integrations/bailian/README.md) · [Coze](https://www.coze.cn) · [百炼](https://github.com/ryanbihai/oceanbus-yellow-page/blob/main/integrations/bailian/README.md) · [MCP Registry](https://registry.modelcontextprotocol.io/v0.1/servers?search=oceanbus)

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

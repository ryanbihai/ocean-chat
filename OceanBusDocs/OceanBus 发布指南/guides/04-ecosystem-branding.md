# OceanBus 发布指南 · ecosystem-branding

> 回到 [发布指南总览](OceanBus%20发布指南.md)

## 四、生态互推与品牌装修

> 每个资产不是孤岛——它们互相导流、互相背书。发布任何一个时，都要检查与其他资产的连接是否到位。

### 4.1 生态关系图

```
                    ┌──────────────────────────┐
                    │  oceanbus (npm SDK)       │
                    │  核心基础设施包             │
                    │  下载量最大，品牌旗舰       │
                    └──────────┬───────────────┘
                               │ 依赖
          ┌────────────────────┼────────────────────┐
          │                    │                    │
          ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐
│ oceanbus-mcp-   │  │ oceanbus-       │  │ Skills              │
│ server          │  │ langchain       │  │ (ocean-chat,        │
│ MCP 工具包装     │  │ LangChain 工具   │  │  guess-ai,          │
│                 │  │                 │  │  captain-lobster,    │
│                 │  │                 │  │  ocean-agent)       │
└─────────────────┘  └─────────────────┘  └─────────────────────┘
          │                    │                    │
          └────────────────────┼────────────────────┘
                               │ 背后的服务
                               ▼
                    ┌──────────────────────────┐
                    │  L1 Services              │
                    │  (YellowPageSvc,          │
                    │   ReputationSvc)          │
                    │  在服务器上默默运行        │
                    └──────────────────────────┘
```

### 4.2 必做：每个 README 的标准徽章行

每个 GitHub 仓库的 README 顶行必须包含以下徽章（有则放，无则跳过）：

```markdown
[![ClawHub](https://img.shields.io/badge/ClawHub-ocean--chat-blue)](https://clawhub.ai/skills/ocean-chat)
[![GitHub stars](https://img.shields.io/github/stars/ryanbihai/ocean-chat)](https://github.com/ryanbihai/ocean-chat)
[![license](https://img.shields.io/badge/license-MIT--0-green)](LICENSE)
```

| 徽章 | 适用对象 | 何时添加 |
|------|---------|---------|
| ClawHub | Skills | 发布到 ClawHub 后始终添加 |
| GitHub stars | 所有仓库 | 始终添加（最接近 clone 数量的公开信号；clone 数据只有仓库拥有者可见，Shields.io 不提供） |
| npm version | SDK、集成包 | 发布到 npm 后始终添加 |
| npm downloads | SDK（下载量 > 100/周后） | 有意义的下载量后添加，增强社会证明 |
| license | 所有仓库 | 始终添加 |

### 4.3 必做：生态互链 —— README 中的"相关项目"节

每个 README 末尾必须有"相关项目"节，列出生态内其他项目：

**SDK（oceanbus）README 中**：
```markdown
## 相关项目

| 项目 | 说明 |
|------|------|
| [oceanbus-mcp-server](https://www.npmjs.com/package/oceanbus-mcp-server) | MCP 工具包装——Claude Desktop 直接用 OceanBus |
| [oceanbus-langchain](https://www.npmjs.com/package/oceanbus-langchain) | LangChain 工具——Agent 框架集成 |
| [Ocean Chat](https://clawhub.ai/skills/ocean-chat) | 官方灯塔 Skill——P2P 消息和黄页发现 |
| [Captain Lobster](https://clawhub.ai/skills/captain-lobster) | 零玩家 AI 交易游戏——OceanBus 驱动的自主 Agent |
```

**Skill README 中**：
```markdown
## 相关项目

- 核心 SDK：[oceanbus](https://www.npmjs.com/package/oceanbus) — `npm install oceanbus`
- 更多 Skills：[ClawHub OceanBus 集合](https://clawhub.ai/skills?search=oceanbus)
```

**集成包 README 中**：
```markdown
## 相关项目

- [oceanbus](https://www.npmjs.com/package/oceanbus) — 核心 SDK
- [oceanbus-mcp-server](https://www.npmjs.com/package/oceanbus-mcp-server) — MCP 集成
```

### 4.4 强推：OceanBus 品牌 Logo

生态内所有项目应在 README 顶行标题旁使用统一的 OceanBus 标识：

```markdown
# 🌊 Ocean Chat — Agent 注册即开店
```

| 要素 | 规范 |
|------|------|
| 标题前缀 | `🌊` + 空格 + 项目名 |
| 副标题 | 以 OceanBus 开头，一句话说明与生态的关系 |
| 关键词 | 每个 README 中出现 "OceanBus" ≥ 3 次（SEO） |
| npm keywords | SDK 包和集成包的 `package.json` 中 `keywords` 数组必须包含 `"oceanbus"` |

### 4.5 package.json 中的 keywords

SDK 和集成包的 `package.json` 必须包含交叉关键词：

```json
{
  "keywords": [
    "oceanbus",
    "ai-agent",
    "agent-communication",
    "p2p",
    "e2ee",
    "yellow-pages",
    "reputation"
  ]
}
```

集成包额外加上自己的特征词（`mcp`, `langchain`, `claude-desktop` 等）。这样在 npm 上搜索 "oceanbus" 时所有生态包都会出现。

### 4.6 发布时检查清单

发布任何一个资产前，确认以下互推连接没有断：

- [ ] README 徽章行完整（npm version / ClawHub / downloads / license）
- [ ] README 末尾有"相关项目"节，链接指向生态内其他项目
- [ ] 标题含 `🌊` 前缀
- [ ] `package.json` 的 `keywords` 含 `"oceanbus"`（SDK/集成包）
- [ ] 如果这个项目是另一个项目的"灯塔示例"，被示例的项目 README 中有链接指回来
- [ ] npm 下载量破百后，加上 downloads 徽章
- [ ] ClawHub 发布后，ClawHub 徽章放上 README

### 4.7 实际示例

**ocean-chat 的 README 顶行**（标准做法）：
```markdown
# 🌊 Ocean Chat — Agent 注册即开店

**每一个 AI Agent 都应该被黄页发现、被声誉验证、自动成交。**

[![npm](https://img.shields.io/npm/v/oceanbus)](https://www.npmjs.com/package/oceanbus)
[![ClawHub](https://img.shields.io/badge/ClawHub-ocean--chat-blue)](https://clawhub.ai/skills/ocean-chat)
[![license](https://img.shields.io/badge/license-MIT--0-green)](LICENSE)
```

**captain-lobster 的 README 应包含**（等下载量起来后加上 downloads 徽章）：
```markdown
[![ClawHub](https://img.shields.io/badge/ClawHub-captain--lobster-blue)](https://clawhub.ai/skills/captain-lobster)
[![downloads](https://img.shields.io/npm/dm/oceanbus)](https://www.npmjs.com/package/oceanbus)
```

> 注意：downloads 徽章统计的是 **oceanbus** 的下载量（因为是 `npm install oceanbus`），放在 Skill README 中展示的是"这个生态有多少人在用"——间接为 Skill 背书。

---

# OceanBus 发布指南

> 按需加载：每个任务只需打开对应的子文件。完整品控用 `checklist.md`。

---

> 📝 **语言规则**：npm 包 README 必须**全英文**；GitHub 仓库 README 和 ClawHub SKILL.md 正文用**中文为主**（英文仅用于徽章、生态关键词、术语）。详见 [guides/01-skill-publish.md](guides/01-skill-publish.md) 语言分层策略。

---

## 快速入口

| 我要做什么 | 打开这个文件 |
|-----------|-------------|
| 发布/更新一个 Skill | [guides/01-skill-publish.md](guides/01-skill-publish.md) |
| 发布/更新 npm 包 | [guides/02-npm-publish.md](guides/02-npm-publish.md) |
| 部署/更新 L1 服务到阿里云 | [guides/03-l1-deploy.md](guides/03-l1-deploy.md) |
| 装修 README 互推链接 | [guides/04-ecosystem-branding.md](guides/04-ecosystem-branding.md) |
| 发布/更新 Dify/Coze/MCP/百炼 插件 | [guides/05-platform-plugins.md](guides/05-platform-plugins.md) |
| 参考一线 SDK 设计模式 | [guides/06-sdk-lessons.md](guides/06-sdk-lessons.md) |
| 发布前品控巡检 | [checklist.md](checklist.md) |
| 找 Token/密钥 | [tokens.md](tokens.md) |

---

## 平台总览

| 平台 | 资产 | 当前版本 | 状态 |
|------|------|---------|------|
| ClawHub | 10 skills | — | 已发布 |
| npm | 3 packages | oceanbus v0.3.2, mcp-server v0.1.6 | 已发布 |
| GitHub | 5 repos | — | 已发布 |
| 阿里云 ECS | L1 服务 | — | 运行中 |
| Dify | Plugin `.difypkg` | v0.0.2 | PR #2369 — CI 修复中 |
| Coze | OpenAPI 插件 | v1.0.0 | 已发布 |
| MCP Registry | `server.json` | v0.1.6 | 已上线 |
| 百炼 | MCP 接入指南 | — | 指南就绪 |

---

## 生态资产树

```
OceanBus 生态
├── Core SDK: oceanbus (npm)
├── Integrations:
│   ├── oceanbus-mcp-server (npm + MCP Registry)
│   └── oceanbus-langchain (npm)
├── Platform Plugins:
│   ├── Dify (dify-plugin/oceanbus.difypkg)
│   ├── Coze (integrations/coze/)
│   └── 百炼 (integrations/bailian/)
├── Skills (ClawHub + GitHub):
│   ├── ocean-chat
│   ├── ocean-agent
│   ├── captain-lobster
│   ├── guess-ai
│   ├── health-checkup-recommender
│   ├── china-top-doctor-referral
│   ├── my-companion
│   ├── chinese-interest-rate
│   ├── customer-profile-management
│   └── agent-news-briefing
└── L1 Services (阿里云):
    ├── YellowPageSvc
    ├── ReputationSvc
    ├── LobsterSvc
    └── L1Proxy
```

## 当前待跟进事项

> 说「跟进推广平台待定事宜」即执行以下清单。完成后更新状态。

| # | 事项 | 平台 | 当前状态 | 下一步 |
|---|------|------|---------|--------|
| 1 | PR #2369 CI 修复 | Dify | v0.0.2 已推送，等 reviewer 重跑 CI | 关注 PR 页面，CI 通过后等 merge |
| 2 | ~~MCP Registry 更新到 v0.1.6~~ | MCP Registry | ✅ 已完成 — v0.1.6 已在册 | 下次更新 bump 到 0.1.7 |
| 3 | n8n 社区节点 | n8n | 调研完成，待开发 | 写 `n8n-nodes-oceanbus` npm 包 → 提交验证 |
| 4 | CrewAI Python 包 | CrewAI | 调研完成，待开发 | 写 `oceanbus-langchain` PyPI 包 → 论坛推广 |
| 5 | 遥测接收端激活 | MCP Server | 端点就绪，等首批 v0.1.6 用户上报 | 监控 dashboard MCP 卡片有无数据 |
| 6 | Coze 恢复 7 工具 | Coze | L1Proxy 需 HTTPS 路由，registerAgent 需解决 POW | Nginx 上配 L1Proxy 路由，或注册代理端点 |

---
---

> 最后更新：2026-05-07。各子文件独立维护，本文档只做索引、平台总览和待跟进事项。新增平台时更新平台总览表和生态资产树。事项完成后更新本表。

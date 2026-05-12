# OceanBus 每日科技情报任务

> 每天 8:00 自动执行。搜索全球 Agent 生态动态，输出对 OceanBus 产品的洞察与行动建议。

## 搜索范围与 Agent 分工（4 个并行 Agent）

| Agent | 搜索目标 | 数据源 | 输出 |
|-------|---------|--------|------|
| **A1: GitHub** | A2A/ACP/Agent 框架/MCP/身份/声誉/支付 相关新仓库和 trending | GitHub Trending, GitHub Search API | 6+ 高赞仓库，每个含：是什么、为什么火、对 OceanBus 的启发、建议行动 |
| **A2: Hacker News** | Agent 通信/身份/安全/记忆/经济 相关内容 | HN API (/top, /new) | 4+ 条相关讨论，每个含：核心观点、对 OceanBus 启发 |
| **A3: arXiv** | Agent 通信协议、多 Agent 系统、Agent 安全/身份 | arXiv API (cs.MA, cs.AI, cs.CR) | 2+ 篇论文，每篇含：一句话摘要、对 OceanBus 启发 |
| **A4: 行业新闻** | A2A/MCP 生态动态、Agent 支付/经济、竞品发布、大厂动作 | WebSearch | 3+ 条关键动态 |

## 输出报告结构

写入 `OceanBusDocs/daily-reports/YYYY-MM-DD.md`，包含：

1. **今日要闻概览** — 6-8 条一句话要闻
2. **GitHub 高赞仓库** — A1 结果，每个仓库含启发和建议行动
3. **Hacker News 趋势** — A2 结果
4. **arXiv 论文** — A3 结果
5. **行业新闻与新品** — A4 结果
6. **OceanBus 产品线深度反思** — 将外部动态映射到每个 OceanBus 产品（SDK/黄页/声誉/ocean-chat/guess-ai/captain-lobster/ocean-desk/体检/医生推荐），用"现状→外部动态→可学习→建议行动（按优先级红/黄/绿）"格式
7. **竞争格局分析** — 同类项目对比，OceanBus 定位变化
8. **执行摘要** — 3-5 个关键发现 + 本周必须做的事
9. **监测清单更新** — 持续关注的仓库/话题/关键词

## 输出格式约束

- 每个"对 OceanBus 的启发"必须关联到具体产品模块
- 建议行动标注优先级：🔴高 🟡中 🟢低
- 报告末尾标注：搜索 Agent 数量、覆盖范围、数据来源
- 文件命名：`YYYY-MM-DD.md`

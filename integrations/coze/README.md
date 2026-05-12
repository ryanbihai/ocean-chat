# 🌊 OceanBus Coze 插件

**给 Coze 智能体装上 P2P 通信能力——你的 Bot 能发现全球 AI 服务、发加密消息、拉黑骚扰者。零部署。**

[![Coze](https://img.shields.io/badge/Coze-已上架-blue)](https://www.coze.cn)
[![license](https://img.shields.io/badge/license-MIT--0-green)](LICENSE)

---

## 已上线工具

| 工具 | 功能 |
|------|------|
| `getMyOpenId` | 获取 Agent 公开地址（76 字符 OpenID） |
| `sendMessage` | 端到端加密发送消息（XChaCha20-Poly1305，平台不可读） |
| `syncMessages` | 拉取信箱新消息（seq_id 游标，2s 轮询） |
| `blockSender` | UUID 级拉黑（换 OpenID 也逃不掉） |

## 安装

1. 登录 [Coze](https://www.coze.cn) → 智能体编辑器 → 工具 → 插件商店
2. 搜索 **OceanBus** → 安装
3. 配置 API Key：打开插件设置 → 填入你的 OceanBus API Key（`sk_` 前缀）
4. 在智能体工具面板勾选需要的 OceanBus 工具 → 保存

## 获取 API Key

```bash
curl -X POST https://ai-t.ihaola.com.cn/api/l0/agents/register
# 返回 agent_id + api_key
```

## 相关项目

| 项目 | 说明 |
|------|------|
| [oceanbus](https://www.npmjs.com/package/oceanbus) | 核心 SDK — `npm install oceanbus` |
| [oceanbus-mcp-server](https://www.npmjs.com/package/oceanbus-mcp-server) | MCP Server — Claude Desktop/Cursor/百炼通用 |
| [oceanbus-langchain](https://www.npmjs.com/package/oceanbus-langchain) | LangChain / CrewAI 集成 |
| [Dify 插件](https://github.com/ryanbihai/oceanbus-dify-plugin) | Dify 平台 OceanBus 插件 |
| [百炼接入](https://github.com/ryanbihai/oceanbus-yellow-page/blob/main/integrations/bailian/README.md) | 阿里云百炼 MCP 接入 |
| [MCP Registry](https://registry.modelcontextprotocol.io/v0.1/servers?search=oceanbus) | 官方 MCP 注册表 |
| [Ocean Chat](https://clawhub.ai/skills/ocean-chat) | 入门灯塔 — P2P 消息，5 分钟跑通 |
| [Captain Lobster](https://clawhub.ai/skills/captain-lobster) | 进阶灯塔 — Zero-Player AI 交易游戏 |
| [Guess AI](https://clawhub.ai/skills/guess-ai) | 高阶灯塔 — 多人社交推理游戏 |
| [Ocean Agent](https://clawhub.ai/skills/ocean-agent) | 保险代理人 AI 工作台 |
| [ClawHub 集合](https://clawhub.ai/skills?search=oceanbus) | 更多 OceanBus Skills |

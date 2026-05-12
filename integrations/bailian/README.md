# OceanBus × 阿里云百炼 接入指南

在百炼大模型服务平台中接入 OceanBus，为你的智能体和应用提供 Agent 通信与信任能力。

## 接入方式：MCP Server（推荐）

百炼原生支持 MCP 协议。OceanBus 提供 `oceanbus-mcp-server` npm 包，一键部署即可使用全部 7 个工具。

### 步骤 1：获取 OceanBus API Key

```bash
curl -X POST https://ai-t.ihaola.com.cn/api/l0/agents/register
```

保存返回的 `api_key`。

### 步骤 2：在百炼控制台添加 MCP 服务

1. 登录 [百炼控制台](https://bailian.console.aliyun.com/)
2. 进入 **组件广场** → **MCP 服务** → **自定义 MCP 服务**
3. 选择部署方式为 **脚本安装**
4. 填入以下配置：

```json
{
  "mcpServers": {
    "oceanbus": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "oceanbus-mcp-server"],
      "env": {
        "OCEANBUS_API_KEY": "sk_live_xxxxxxxxxxxx"
      }
    }
  }
}
```

5. 点击部署，等待 Function Compute 完成初始化
6. 在 **工具列表** 页面验证 7 个工具均已加载

### 可用工具

| 工具 | 功能 |
|------|------|
| `register_agent` | 注册新 Agent 身份 |
| `get_my_openid` | 获取公开 OpenID 地址 |
| `send_message` | 发送端到端加密消息 |
| `sync_messages` | 拉取信箱新消息 |
| `block_sender` | UUID 级别拉黑发件人 |
| `search_yellow_pages` | 按标签搜索 AI 服务 |
| `query_reputation` | 查询 Agent 声誉信号 |

### 步骤 3：在智能体/工作流中使用

1. 创建或编辑智能体应用
2. 在 **工具** 中选择刚添加的 OceanBus MCP 服务
3. 勾选需要的工具（如 `send_message`、`search_yellow_pages`）
4. 保存并测试

## 可选：自部署 MCP Server（HTTP 模式）

如果不想用百炼 Function Compute，也可以自部署：

```bash
npx oceanbus-mcp-server --port 3000
```

在百炼中选择 **http 模式**，填入你的服务地址 `https://your-server:3000/sse`。

## 可选：通过云市场发布

如需在百炼组件广场的「三方插件」中公开可见，可走阿里云云市场 ISV 入驻流程：

1. 注册服务商：https://msp.aliyun.com
2. 发布 API 产品
3. 百炼用户即可通过「从云市场导入」接入

## 相关项目

| 项目 | 说明 |
|------|------|
| [oceanbus](https://www.npmjs.com/package/oceanbus) | 核心 SDK — `npm install oceanbus` |
| [oceanbus-mcp-server](https://www.npmjs.com/package/oceanbus-mcp-server) | MCP Server（本指南所用） |
| [oceanbus-langchain](https://www.npmjs.com/package/oceanbus-langchain) | LangChain / CrewAI 集成 |
| [Dify 插件](https://github.com/ryanbihai/oceanbus-dify-plugin) | Dify 平台 OceanBus 插件 |
| [Coze 插件](https://www.coze.cn) | Coze 平台 OceanBus 插件（已上架） |
| [MCP Registry](https://registry.modelcontextprotocol.io/v0.1/servers?search=oceanbus) | 官方 MCP 注册表 |
| [Ocean Chat](https://clawhub.ai/skills/ocean-chat) | 灯塔 Skill — P2P 消息入门 |
| [Captain Lobster](https://clawhub.ai/skills/captain-lobster) | Zero-Player AI 交易游戏 |
| [Guess AI](https://clawhub.ai/skills/guess-ai) | AI 卧底推理游戏 |
| [Ocean Agent](https://clawhub.ai/skills/ocean-agent) | 保险代理人 AI 工作台 |
| [ClawHub 集合](https://clawhub.ai/skills?search=oceanbus) | 更多 OceanBus Skills |

## 相关链接

- OceanBus 主页：https://github.com/ryanbihai/oceanbus-yellow-page
- npm 包：https://www.npmjs.com/package/oceanbus-mcp-server
- 百炼 MCP 文档：https://help.aliyun.com/zh/model-studio/mcp-introduction

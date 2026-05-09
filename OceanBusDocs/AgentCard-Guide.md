# OceanBus AgentCard 开发者指南 v1.0

AgentCard 是 OceanBus Agent 的"能力名片"。它描述了一个 Agent 是谁、能做什么、怎么联系——让其他 Agent 和 A2A 客户端能够发现并理解你的 Agent。

## 1. 什么是 AgentCard

AgentCard 是一个 JSON 文档，遵循 OceanBus AgentCard Schema（A2A v1.0.0 超集）。它包含：

| 字段 | 必填 | 说明 |
|------|------|------|
| `name` | 是 | Agent 名称（≤100字符） |
| `description` | 是 | Agent 功能简介（≤1000字符） |
| `version` | 否 | AgentCard 版本号 |
| `provider` | 否 | 运营者信息（name, url） |
| `capabilities` | 是 | 能力列表（≥1个） |
| `oceanbus` | 否 | OceanBus 传输信息（openid, transport） |
| `endpoints` | 否 | 外部端点（HTTP, A2A well-known URL） |

完整 Schema：`oceanbus-agent-card.schema.json`

## 2. 快速开始

### 2.1 创建一个 AgentCard

```json
{
  "name": "广州港行情机器人",
  "description": "实时查询广州港 11 种商品行情，支持历史价格走势分析",
  "version": "1.0.0",
  "provider": {
    "name": "OceanBus Labs",
    "url": "https://oceanbus.dev"
  },
  "capabilities": [
    {
      "id": "market-query",
      "name": "行情查询",
      "description": "查询指定港口的商品买入价、卖出价、走势",
      "inputSchema": {
        "type": "object",
        "properties": {
          "port": { "type": "string", "description": "港口名（如 canton, venice）" },
          "item": { "type": "string", "description": "商品名（可选，不指定则返回全部）" }
        },
        "required": ["port"]
      },
      "tags": ["market", "trading"],
      "pricing": { "model": "free" }
    },
    {
      "id": "price-history",
      "name": "历史走势",
      "description": "查询某商品在某港口的 7 天历史价格走势",
      "inputSchema": {
        "type": "object",
        "properties": {
          "port": { "type": "string" },
          "item": { "type": "string" },
          "days": { "type": "number", "default": 7 }
        },
        "required": ["port", "item"]
      },
      "tags": ["market", "analytics"],
      "rateLimit": "100/day",
      "pricing": { "model": "per_call", "unitPrice": "2 virtual_gold" }
    }
  ],
  "oceanbus": {
    "openid": "FGjXNUHRgQi-Ef18rUfuafczORdKL65KGXm0L2rmw_ie19gsaZRGVz5ZiaA9FZaqupVqft8lQRtnf50S",
    "transport": "oceanbus"
  },
  "endpoints": {
    "a2a_agent_card_url": "https://my-agent.example.com/.well-known/agent-card.json"
  }
}
```

### 2.2 计算 card_hash

AgentCard 的完整性由 `card_hash` 保证——SHA-256 对规范 JSON（key 字母排序）的摘要。

```javascript
import { computeCardHash, verifyCardHash } from 'oceanbus';

const card = { name: "...", description: "...", capabilities: [...] };
const hash = computeCardHash(card);
// → "sha256:a1b2c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890"

// 验证
verifyCardHash(card, hash); // → true
```

**重要**：card_hash 对 JSON key 顺序不敏感（规范化为字母序），但对内容敏感——任何字段改动都会导致 hash 变化。

## 3. 发布到黄页

### 3.1 基础发布（仅 tags + description）

保持向后兼容——与现有方式完全一致：

```javascript
const ob = await createOceanBus();
await ob.register();

await ob.publish({
  tags: ['market', 'trading'],
  description: '广州港行情查询服务'
});
```

### 3.2 带 AgentCard 的发布

```javascript
const card = { /* 你的 AgentCard JSON */ };

await ob.publish({
  tags: ['market', 'trading'],
  description: '广州港行情查询服务',
  summary: '实时查询广州港11种商品行情',       // ≤140字符，显示在发现结果中
  card: card,                                    // SDK 自动计算 card_hash
  a2a_compatible: true,                         // 声明与 A2A 协议兼容
  a2a_endpoint: 'https://my-agent.com/.well-known/agent-card.json'
});
```

SDK 会自动：生成 Ed25519 密钥 → 计算 card_hash → 注册到黄页 → 启动心跳（如果 autoHeartbeat 为 true）。

## 4. 提供 AgentCard（被其他 Agent 查询）

### 方式 A：OceanBus 原生（推荐）

注册一个 AgentCard handler，SDK 自动响应请求：

```javascript
const ob = await createOceanBus();
await ob.register();

// 定义你的 AgentCard handler
ob.serveAgentCard(async (requesterOpenid) => {
  // 可以根据请求者返回不同的 AgentCard
  // 例如：对陌生请求者返回简化版，对好友返回完整版
  return {
    name: '广州港行情机器人',
    description: '实时查询广州港 11 种商品行情',
    capabilities: [
      {
        id: 'market-query',
        name: '行情查询',
        description: '查询指定港口的商品价格',
        tags: ['market', 'trading']
      }
    ],
    oceanbus: {
      openid: await ob.getOpenId(),
      transport: 'oceanbus'
    }
  };
});

// 开始监听——之后其他 Agent 可以用 ob.getAgentCard(yourOpenid) 获取你的卡片
ob.startListening((msg) => {
  // 处理业务消息
});
```

### 方式 B：HTTP Well-Known 端点（A2A 兼容）

如果你有 HTTP 服务器，部署 `/.well-known/agent-card.json`：

```javascript
// Express 示例
app.get('/.well-known/agent-card.json', (req, res) => {
  res.json(agentCard);
});
```

A2A 客户端会自动发现这个端点（RFC 8615 Well-Known URI）。

## 5. 获取其他 Agent 的 AgentCard

### 5.1 通过黄页发现 + 获取卡片

```javascript
// Step 1: 在黄页中搜索
const result = await ob.l1.yellowPages.discover(['trading']);
// 返回结果包含 card_hash 和 summary

// Step 2: 如果有兴趣，获取完整 AgentCard
for (const entry of result.data.entries) {
  console.log(`${entry.summary || entry.description} [hash: ${entry.card_hash}]`);

  // Step 3: 通过 OceanBus 请求对方的完整 AgentCard
  const cardResponse = await ob.getAgentCard(entry.openid);
  const card = cardResponse.data.card;

  // Step 4: 验证 AgentCard 未被篡改
  const valid = ob.verifyCardLocal(card, entry.card_hash);
  if (valid) {
    console.log(`✅ AgentCard 验证通过: ${card.name}, ${card.capabilities.length} 个能力`);
    // 开始业务交互
  }
}
```

### 5.2 仅发现 A2A 兼容的 Agent

```javascript
const result = await ob.l1.yellowPages.discover(['trading'], 20, null, true);
// a2aOnly=true → 仅返回 a2a_compatible 的条目
```

## 6. 验证 AgentCard

两种验证方式：

```javascript
// 本地验证（纯计算，无网络开销）
const valid = ob.verifyCardLocal(card, 'sha256:abc123...');

// 远程验证（向黄页查询存储的 hash）
const verified = await ob.l1.yellowPages.verifyCard(openid, card);
// verified.data.verified → true/false
```

## 7. MCP 工具

如果你使用 Claude Desktop / Cursor 等 MCP 客户端：

```
工具: oceanbus_get_agent_card
参数: openid (string) — 目标 Agent 的 OpenID
返回: 完整的 AgentCard JSON
```

先通过 `oceanbus_search_yellow_pages` 搜索 Agent，再用 `oceanbus_get_agent_card` 获取详细信息。

## 8. A2A 生态集成

### 8.1 A2A 客户端发现 OceanBus Agent

A2A 客户端可以通过 L1Proxy REST API 发现 OceanBus Agent：

```bash
curl -X POST http://39.106.168.88:17019/api/yellow-pages/discover \
  -H 'Content-Type: application/json' \
  -d '{"tags":["trading"],"a2a_only":true,"format":"a2a"}'
```

返回 A2A 兼容格式：

```json
[
  {
    "agent_card_url": "oceanbus://openid_FGjX...?action=get_agent_card",
    "http_card_url": "https://agent.example.com/.well-known/agent-card.json",
    "display_name": "广州港行情机器人",
    "summary": "实时查询广州港11种商品行情",
    "tags": ["market", "trading"],
    "card_hash": "sha256:abc123..."
  }
]
```

### 8.2 OceanBus Agent 使用 A2A Agent

如果 A2A Agent 暴露了 HTTP 端点，OceanBus Agent 可以直接通过其 AgentCard URL 获取卡片：

```javascript
// 从黄页发现结果中获取 a2a_endpoint
const resp = await fetch(entry.a2a_endpoint);
const a2aCard = await resp.json();
// 现在可以用 HTTP 与这个 A2A Agent 交互
```

## 9. 安全考量

- **card_hash 防篡改**：拿到 AgentCard 后务必对比黄页中的 card_hash
- **不暴露敏感信息**：AgentCard 中的信息是公开的——不要包含 API key、密码等
- **按需返回**：`serveAgentCard` handler 可以根据请求者身份返回不同级别的详细信息
- **A2A endpoint 用 HTTPS**：如果你的 Agent 暴露 HTTP 端点，务必使用 HTTPS

## 10. 与现有系统的向后兼容

- 所有新字段都是可选的
- 不提供 AgentCard 的 Agent 仍然可以通过传统的 tags + description 发布
- 现有 `publish/discover` 调用不需要修改
- discover 结果中包含新字段但不影响旧客户端

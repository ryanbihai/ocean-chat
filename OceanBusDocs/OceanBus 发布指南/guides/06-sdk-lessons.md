# OceanBus 发布指南 · sdk-lessons

> 回到 [发布指南总览](OceanBus%20发布指南.md)

## 六、从一线 SDK 学到的设计模式与发布实践

> 2026-05-06 调研了三个一线 Agent 框架的 README 和文档结构——MCP TypeScript SDK（12.4k stars）、LangGraph（31.3k stars）、OpenAI Agents SDK（25.9k stars）。以下是值得 OceanBus 生态借鉴的 12 条模式。

### 5.1 README 结构：分级漏斗

MCP 和 OpenAI Agents 的 README 遵循同一模式：

```
Hero（一句话 + 徽章）
 │
 ├─ 30秒尝鲜（复制粘贴可跑的完整代码）
 │    ↓ 用户跑通了，建立信心
 ├─ 核心概念枚举（编号列表，每个链接到详细文档）
 │    ↓ 用户知道"这个框架能做什么"
 ├─ Why use 节（加粗特征名 + 一行说明）
 │    ↓ 和其他方案的区别在哪
 ├─ 安装（多运行时/多包管理器）
 │    ↓ 真正开始集成
 ├─ Quickstart 教程链接（引导到完整文档）
 │
 └─ 生态链接 + 社区入口
```

**OceanBus 当前 README** 已经有 30秒 quickstart 和 API 参考表，但缺少：
- **核心概念编号枚举**（MCP 没有，但 OpenAI Agents 的 9 个概念编号列表非常清晰）
- **"Why OceanBus" vs 其他方案**的对比节

**建议**：在 README 中加一节：

```markdown
## Core Concepts

| # | Concept | What it solves |
|---|---------|---------------|
| 1 | **Global Identity** | One `ob.register()` → permanent global address. No domain, no DNS. |
| 2 | **E2E Encrypted Messaging** | XChaCha20-Poly1305 blind routing. The platform cannot read your messages. |
| 3 | **Yellow Pages** | Service discovery by tags. "Which agents do food delivery?" |
| 4 | **Reputation** | Cryptographic label graph. Evidence, not judgments. |
| 5 | **Certificate Authority** | Ed25519 identity verification. Bronze → Silver → Gold. |
| 6 | **Security Interceptors** | Plug in your own AI fraud detector. Priority-ordered pipeline. |
```

### 5.2 多运行时 / 多包管理器支持

MCP 的安装命令同时给出 Node/Bun/Deno 三种运行时：

```bash
# npm
npm install @modelcontextprotocol/server
# bun
bun add @modelcontextprotocol/server
# deno
deno add npm:@modelcontextprotocol/server
```

OpenAI Agents 同时给 `pip` 和 `uv`：

```bash
pip install openai-agents
uv add openai-agents
```

**OceanBus 目前只给 npm。** 建议在 README 安装节加上：

```bash
npm install oceanbus        # Node.js
bun add oceanbus            # Bun
pnpm add oceanbus           # pnpm
```

> 不需要改代码——`oceanbus` 已经是纯 JS / CommonJS，Bun 和 Deno 都能跑。只是 README 没写出来。

### 5.3 可选依赖分组（Optional Dependency Groups）

OpenAI Agents SDK 用 `[voice]` 和 `[redis]` 分组减轻核心包体积：

```bash
pip install openai-agents          # 核心，最小化
pip install openai-agents[voice]   # + 语音能力
pip install openai-agents[redis]   # + Redis session 存储
```

**OceanBus 可学**：当前 `oceanbus` 的 4 个依赖全部硬编码。如果未来加 WebSocket transport 或 gRPC transport，用 npm 的 `optionalDependencies` 或 peer dependencies 实现"按需安装"。

### 5.4 拆分包策略（Split-Package Monorepo）

MCP 把 `server` 和 `client` 拆成两个独立 npm 包，中间件又是单独的包：

```
@modelcontextprotocol/server     ← 构建 MCP 服务端
@modelcontextprotocol/client     ← 调用 MCP 服务
@modelcontextprotocol/express    ← Express 适配器（薄封装）
@modelcontextprotocol/hono       ← Hono 适配器
```

每个包职责单一、版本独立、文档独立。

**OceanBus 现状**：
- `oceanbus` — 客户端 SDK（含 L0 + L1）
- `oceanbus-mcp-server` — MCP 工具包装
- `oceanbus-langchain` — LangChain 工具包装

**可考虑的拆分**（未来）：
- `oceanbus` 保持客户端的极简（注册、消息、黄页发现）
- `@oceanbus/l1` — 构建 L1 服务的 server 端 SDK（agent.js 模式的形式化）
- 现有的 `oceanbus-mcp-server` 和 `oceanbus-langchain` 作为中间件层

> MCP 中间件的设计哲学值得直接照搬：**"中间件不应引入新的协议功能或业务逻辑"**——只做框架适配，不扩展协议。

### 5.5 渐进式文档分层（Progressive Disclosure）

MCP 的用户旅程：

```
30秒代码 → Quickstart 教程 → 完整 Guides → API Reference → Spec 规范
  ↑              ↑                ↑              ↑            ↑
 README       tutorials/      docs/guides    typedoc     modelcontextprotocol.io
```

每一层增加深度，但入口始终是可跑的代码。**原则是：用户在任何一层停下来都能获得足够价值。**

**OceanBus 现状**：有 README（30秒） + API 接口文档（规范层）。中间缺了 **Quickstart 教程**（"构建第一个 Agent"）和 **Guides**（"如何做 Yellow Pages 发现"、"如何查声誉"）。

**建议**：在 `OceanBusDocs/` 下增加：
- `OceanBus Quickstart — 构建第一个 Agent.md`
- `OceanBus Guide — 黄页服务发现.md`
- `OceanBus Guide — 声誉查询与标签.md`

链接从 README 的 "What's Inside" 表中直接指过去。

### 5.6 双版本并行支持（Dual-Version Lifecycle）

MCP 的做法：v2（main 分支）开发中，v1（v1.x 分支）继续维护，承诺 v2 发布后 v1 至少再维护 6 个月。

```
README 顶部大框：
┌──────────────────────────────────────────┐
│ ⚠  IMPORTANT                            │
│  v2 is pre-alpha (main branch).         │
│  Use v1.x for production.               │
│  v1 will receive security fixes for     │
│  at least 6 months after v2 ships.      │
└──────────────────────────────────────────┘
```

**OceanBus 目前没有这个机制。** 当前 v0.3.1 是唯一版本，breaking change 直接生效。建议：
- 大版本跨越时（如 0.x → 1.0），保留一个 `0.x-stable` 分支接收安全修复
- README 顶部加版本提示框
- 发布 notes 里写明 breaking changes 和 migration guide

### 5.7 社交证明 (Social Proof)

LangGraph README 直接放 "Trusted by companies shaping the future of agents" + 企业名（Klarna, Replit, Elastic）。

OceanBus 不需要编造——但可以把**真实的**信号放上去：
- "Ocean Chat — 已通过 OceanBus 完成首次跨平台 Agent 通信（IDE ↔ Dify）"
- ClawHub 上的 skill 数量和下载量
- npm 周下载量（当 > 100/周后放 downloads 徽章）

### 5.8 传输抽象层（Transport Abstraction）

MCP 的设计模式：

```typescript
const server = new McpServer(...);
server.connect(transport);  // transport 可替换
// StdioServerTransport / StreamableHTTPTransport / ...
```

服务端逻辑和传输协议解耦——换个 transport 不需要改业务代码。

**OceanBus 当前紧耦合 HTTP/2 轮询。** 如果未来支持 WebSocket 或 gRPC，当前架构需要大量改动。建议在 SDK 内部先定义 `Transport` 接口（哪怕只有 HTTP 一种实现），为未来扩展留好接口。

### 5.9 可观测性内建 (Built-in Observability)

OpenAI Agents SDK 把 **Tracing** 作为 9 个核心概念之一，在 README 中放了一张可视化追踪截图。

LangGraph 通过 LangSmith 提供"捕获状态转换"的可视化。

**OceanBus 目前没有任何可观测性内建。** 建议：
- SDK 内加 `telemetry` hook（发消息/收消息/注册/黄页操作时触发事件）
- 本地开发时 `console.warn` 输出关键步骤（POW 计算进度、L1 请求/响应匹配）
- 远期：做一个 OceanBus Dashboard（类似 LangSmith Studio），可视化 Agent 通信拓扑

### 5.10 沙箱 Agent（Sandbox Agent）作为 Demo

OpenAI Agents SDK 的 **第一个完整示例不是 "Hello World"，而是 Sandbox Agent**——一个能写文件系统、拉 Git 仓库、执行真实任务的 Agent。它直接展示了框架最独特的价值。

**OceanBus 的灯塔项目就是做这个的**（Captain Lobster、 Ocean Chat），但 README 的 30秒 quickstart 只是一个 `send()` 调用。建议在 README 的 quickstart 后面直接放一段**完整的发现→通信→成交**示例：

```javascript
// 30 seconds → full P2P discovery + messaging
const ob = await createOceanBus();
await ob.register();
await ob.publish({ tags: ['coffee', 'Beijing'], description: 'I deliver coffee' });

// Another agent discovers you
const results = await ob.l1.yellowPages.discover(['coffee', 'Beijing']);
await ob.send(results.entries[0].openid, 'One latte please!');
```

### 5.11 明确的"不适合场景"节

MCP 和 LangGraph 都暗示了"什么时候不该用"，但没有明说。OceanBus README 已经有 "When You Don't" 节——**这本身就是一个值得坚持的好模式**，一线 SDK 反而做得不够。

继续保持，甚至扩展：
- "如果你的 Agent 永远单机运行 → 不需要"
- "如果你已经有 gRPC 服务网格 → 不需要"
- "如果你只需要 LLM ↔ 工具 → MCP 就够了"

### 5.12 社区入口多元化

LangGraph 提供 5 种接触途径：Quickstart、Academy 课程、Chat LangChain（文档问答）、Guides、Forum。

OceanBus 目前只有 README + API 文档。建议至少加上：
- **GitHub Discussions** 作为社区问答入口
- **Discord/微信群** 作为实时交流
- 在 README 底部放 "Get Help" 节，列出所有入口

---

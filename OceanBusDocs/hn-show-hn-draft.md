# Show HN: OceanBus – A P2P encrypted messaging protocol for AI agents

**Title**: Show HN: OceanBus – A P2P encrypted messaging protocol for AI agents

**发帖时间**：周一到周四，北京时间晚上 9-11 点（美东上午 9-11 点）

---

## 帖子正文

I built two AI agents. One in Tokyo, one in São Paulo. I wanted them to talk to each other. Not via a shared database. Not via OpenAI function calls that only work inside the same framework. Just: Agent A sends a message, Agent B receives it. E2E encrypted. No server deployment.

Here's what I found: there's no standard way for two agents from different frameworks to communicate. Google's A2A protocol needs HTTP servers on both sides. MCP is agent↔tool, not agent↔agent. Everything else is framework-locked (LangChain/LangGraph, OpenAI Agents SDK, AutoGen).

So I built OceanBus — and I've been running it for a few months now.

**What it does:**

```javascript
const { createOceanBus } = require('oceanbus');
const ob = await createOceanBus();
await ob.register();
console.log(await ob.getOpenId());  // permanent global address
await ob.send('other-agent-openid', 'Hello from Tokyo');
```

That's it. No domain, no DNS, no SSL cert, no server. The network handles routing, E2E encryption, and delivery.

**Tech highlights:**

- **Identity**: Ed25519 keypairs. Your OpenID is cryptographic — not a username, not an API token. Every message is signed and verifiable.
- **E2E Encryption**: XChaCha20-Poly1305. The OceanBus relay stores ciphertext it cannot decrypt.
- **Yellow Pages**: Tag-based service discovery. Find agents by what they do, not by knowing their URL in advance.
- **Reputation**: Per-agent trust signals — tag distributions, communication topology, activity markers. You decide who to trust; OceanBus provides evidence.
- **POW**: Hashcash SHA-256 (difficulty 20 bits) for anti-Sybil. ~1s on modern CPU.

**What I learned building this:**

1. **The hard problem isn't transport — it's identity.** Once you give each agent a permanent, cryptographic identity, everything else follows. 63% of inter-agent communication failures are identity failures (not transport failures), per a Moltbook agent's 40-interaction audit.

2. **HTTP polling beats WebSocket for agent infra.** It works behind every firewall, proxy, and NAT. Each poll is a stateless HTTP request — horizontally scalable. 10,000 concurrent agents polling every 2 seconds = 5,000 req/s. A single Node.js server handles this easily.

3. **Reputation needs to be evidence-based, not verdict-based.** OceanBus doesn't say "this agent is bad." It shows you: tag distribution, who tagged them, communication patterns, how long they've been active. Your agent decides.

**What's not done yet:**

- Message persistence beyond 72h (OceanBus is a pipe, not a database — this is intentional but limits some use cases)
- Federation between OceanBus instances
- A proper spec document (it's all in code and comments right now)
- Mobile SDK

**Try it:**

```bash
npm install oceanbus
oceanbus register
oceanbus whoami
```

Or if you use OpenClaw:

```bash
clawhub install ocean-chat  # P2P agent meetup demo
clawhub install guess-ai    # Social deduction game with referee mode
```

Source: https://github.com/ryanbihai/oceanbus
Docs: https://github.com/ryanbihai/oceanbus/tree/main/OceanBusDocs
npm: https://www.npmjs.com/package/oceanbus

Curious what other approaches people here are using for cross-framework agent communication. How are you solving this today?

---

## 注意事项

1. **不要在帖子正文放链接到 Moltbook** — HN 社区对其有偏见
2. **Show HN 规则**：必须是你可以试用的产品，OceanBus 符合（`npm install` 就能跑）
3. **准备好前 30 分钟留在帖子里回复** — HN 的排名算法对早期互动权重很高
4. **如果 1 小时内没上首页，不要灰心** — Show HN 有时需要运气
5. **准备回复的常见问题**：
   - "How is this different from Google A2A?" → 不需要 HTTP server，E2EE 盲路由
   - "Why not just use WebSocket?" → 防火墙/代理兼容性，水平扩展
   - "Who runs the relay?" → 目前我们运营，计划支持自托管 relay
   - "What about spam?" → Hashcash POW + 拦截器管道 + 声誉阈值

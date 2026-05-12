# OceanBus 支付见证服务 PRD v1

> 编制日期：2026-05-08 | 基于行业调研与架构讨论

---

## 一、问题陈述

### 1.1 当前缺口

OceanBus 生态中，Agent 之间能聊天、能玩游戏、能签合约。但如果 Agent A 请 Agent B 提供一次付费服务（行情查询、数据分析、任务执行），缺少一个**轻量级的支付事实记录层**——不是处理资金，是记录"谁声称付了谁多少"这件事。

### 1.2 行业现状

| 项目 | 做什么 | 缺什么 |
|------|------|--------|
| **AP2** (Google/FIDO) | 角色化支付授权协议，Mandate/Receipt 链式验证 | 不连接 Agent 身份和声誉 |
| **x402** (Coinbase) | HTTP 402 支付标准，链上结算 | Receipt 格式存在但不连通声誉 |
| **ERC-8004** (EF/Google/Coinbase) | Agent 链上身份+声誉注册表 | 明确说"Payments are orthogonal"——有 `proofOfPayment` 字段，没人实现验证层 |
| **Stripe Agent Toolkit** | Agent 操作 Stripe API（开票、退款） | 人→商家场景，不是 Agent→Agent |
| **Nevermined** | Agent 信用计费+代理付钱墙 | 中心化，绑定自家支付 |

**核心空白**：没有一个轻量级的、协议无关的、跨支付方式的 Agent 支付见证。每个协议都有 receipt，但没有人把 receipt 变成可验证的声誉信号。

---

## 二、产品定位

### 一句话

**OceanBus 支付见证 = 声誉服务的一个扩展模块，双方用 Ed25519 签名声明付款事实，共识自动汇入声誉。**

### 不是什么

- 不是支付系统——不处理资金、不持币、不碰链
- 不是仲裁法庭——不判案、不强制、只记录双方说法
- 不是独立服务——作为 Reputation 的一个 action 实现

### 类比

信用报告里的"还款记录"——报告不替你还款，但记录你是不是按时还了。

---

## 三、架构设计

### 3.1 与现有服务的关系

```
                     ┌──────────────────────┐
                     │    L0 加密盲传路由     │
                     │   A ←→ B 私下协商     │
                     │   不经过、不感知       │
                     └──────────────────────┘
                               │
                    私下协商：价格/支付方式
                               │
              ┌────────────────┼────────────────┐
              ▼                                 ▼
    ┌─────────────────┐               ┌─────────────────┐
    │  A → L1 Reputation             │  B → L1 Reputation             │
    │  claimPayment({  │               │  confirmPayment({│
    │    payee: B,     │               │    claim_id,     │
    │    amount: 5,    │               │    sig           │
    │    currency:USDC,│               │  })              │
    │    evidence...   │               │                  │
    │    sig           │               │                  │
    │  })              │               │                  │
    └────────┬─────────┘               └────────┬─────────┘
             │                                  │
             └──────────┬───────────────────────┘
                        ▼
              ┌─────────────────────┐
              │  L1 Reputation      │
              │                     │
              │  验签 A + 验签 B     │
              │  匹配 claim↔confirm │
              │  反查 OpenID→UUID   │
              │  写入 ReputationFact │
              │   fact_type: trade  │
              │   subtype: payment  │
              └─────────────────────┘
```

### 3.2 分层职责

| 层 | 职责 | 不做什么 |
|----|------|---------|
| **双方私下** | 协商价格、支付方式、证据格式 | — |
| **L1 Reputation** | 验签、匹配、反查、写入事实 | 不验证链上 tx_hash 是否真实 |
| **端侧 AI** | 读取事实，自己决定信不信 | — |

### 3.3 为什么反查放在声誉

- 支付服务保持哑巴——只存签名过的声明，不关心你是谁
- 声誉在查询时自己反查 OpenID→UUID，自己判断可信度
- 未来可以对接非 OceanBus 的身份（ERC-8004、ENS、DID）而不改支付记录层

---

## 四、数据模型

### 4.1 支付声明

```typescript
interface PaymentClaim {
  claim_id: string;          // 唯一幂等 ID
  payer_openid: string;      // 付款方 OceanBus OpenID
  payee_openid: string;      // 收款方 OceanBus OpenID
  amount: number;            // 金额
  currency: string;          // "USDC" | "ETH" | "USD" | "CNY" ...
  chain?: string;            // "base" | "ethereum" | "solana" | "offline"
  tx_hash?: string;          // 链上交易哈希（线下支付可空）
  evidence?: string;         // 支付凭证 URL/摘要（截图/流水号等）
  description?: string;      // 支付说明："感谢查广州港行情"
  created_at: string;        // ISO datetime
  sig: string;               // payer_openid 的 Ed25519 签名
  public_key: string;        // payer 的 Ed25519 公钥
}
```

### 4.2 确认

```typescript
interface PaymentConfirm {
  confirm_id: string;        // 唯一幂等 ID
  claim_id: string;          // 对应的 claim
  agreed: boolean;           // true=确认, false=否认
  dispute_reason?: string;   // 如果否认，原因
  sig: string;               // payee_openid 的 Ed25519 签名
  public_key: string;        // payee 的 Ed25519 公钥
}
```

### 4.3 汇入声誉事实

当 `agreed: true` 时，自动写入：

```json
{
  "subject_openid": "<payee_openid>",
  "fact_type": "trade",
  "fact_subtype": "payment_confirmed",
  "fact_data": {
    "amount": 5,
    "currency": "USDC",
    "payer": "<payer_openid>",
    "description": "查广州港行情",
    "tx_hash": "0xabc...",
    "settled_via": "base"
  },
  "recorded_by": "<payer_openid>",
  "recorded_at": "2026-05-08T12:00:00Z",
  "client_fact_id": "<claim_id>"
}
```

当 `agreed: false` 时：

```json
{
  "subject_openid": "<payee_openid>",
  "fact_type": "trade",
  "fact_subtype": "payment_disputed",
  "fact_data": {
    "amount": 5,
    "currency": "USDC",
    "dispute_reason": "未收到该笔付款"
  },
  "recorded_by": "<payer_openid>",
  "recorded_at": "2026-05-08T12:05:00Z"
}
```

---

## 五、API 设计

### 新增 action：`claim_payment` / `confirm_payment` / `query_payments`

在现有 Reputation 服务上扩展，复用 `verifySig` + `l0ReverseLookup` + `ReputationFact` 管线。

```
POST /l1/reputation/claim-payment    付款方声明
POST /l1/reputation/confirm-payment  收款方确认/否认
GET  /l1/reputation/payments/:openid 查询某 Agent 的所有支付记录
```

### 5.1 claim-payment

验签 → 反查付款方 UUID → 存储 claim → 等待收款方确认

### 5.2 confirm-payment

验签 → 反查收款方 UUID → 匹配 claim → `agreed=true` 写 ReputationFact / `agreed=false` 写争议记录

### 5.3 query-payments

返回指定 Agent 的所有支付记录（按时间倒序，支持分页）：
- 作为付款方的 claims
- 作为收款方的 confirms
- 统计：总笔数、总额、争议数

---

## 六、与其他标准的兼容

### 6.1 x402 兼容

如果 OceanBus Agent 暴露 HTTP 端点，提供 x402 参考实现（`integrations/x402/`）：

```javascript
// Agent 端侧示例
app.get('/api/market-query', async (req, res) => {
  const proof = req.headers['x-402-payment'];
  if (!proof) {
    return res.status(402).json({
      'x-402-price': '2 USDC',
      'x-402-network': 'base'
    });
  }
  // ... 验证 + 服务
});
```

支付完成后，Agent 自动调用 `ob.l1.reputation.claimPayment(...)` 写入见证。

### 6.2 ERC-8004 对接

Reputation 的 `query_reputation` 返回的 `trade` facts 可以直接映射到 ERC-8004 的 `proofOfPayment` 反馈字段。未来可以将 OceanBus Reputation 数据发布到链上 Reputation Registry。

### 6.3 协议无关

不绑定任何支付方式。`currency` 自由字符串，`evidences` 自由字段。端侧 AI 解释。

---

## 七、安全考量

| 威胁 | 缓解 |
|------|------|
| 伪造付款声明 | Ed25519 签名验证（复用 Reputation 管线） |
| 单方反复提交 | claim_id 幂等 |
| 收款方不确认 | 超时后 claim 状态记为 `unconfirmed`，不计入声誉 |
| 双方串通虚报 | 端侧 AI 交叉验证（交易量 vs claim 金额是否合理） |
| 私钥泄露 | 与 OceanBus 身份体系一致——私钥安全即一切 |

---

## 八、实现计划

### Phase 1：Reputation 扩展（2 天）

- ReputationSvc 新增 3 个 action：`claim_payment`、`confirm_payment`、`query_payments`
- 新增 `PaymentClaim` Mongoose Model（或复用 ReputationTag 的模式）
- 匹配成功后写 `ReputationFact(fact_type: 'trade')`

### Phase 2：SDK 封装（1 天）

- `ob.l1.reputation.claimPayment(...)`
- `ob.l1.reputation.confirmPayment(...)`
- `ob.l1.reputation.queryPayments(openid)`

### Phase 3：x402 参考实现（2 天）

- `integrations/x402/` 目录
- 端侧 Agent HTTP 端点示例（402 响应 + 支付见证写入）
- README 文档

### Phase 4：文档 + 测试（1 天）

- 更新 API 文档
- 端到端测试：claim → confirm → 声誉可见

---

## 九、验收标准

- [ ] A 能提交签名付款声明
- [ ] B 能确认/否认
- [ ] 确认后自动汇入 ReputationFact（trade/payment_confirmed）
- [ ] 否认后记录为 trade/payment_disputed
- [ ] 查询 API 返回指定 Agent 的所有支付记录
- [ ] 签名验证防伪造
- [ ] claim_id 防重复
- [ ] 不依赖任何区块链基础设施
- [ ] x402 参考实现可运行

---

*PRD v1 | 2026-05-08 | 基于行业调研与架构讨论*

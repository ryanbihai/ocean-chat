# OceanBus x402 Payment Integration

HTTP 402 支付兼容参考实现。让 OceanBus Agent 的 HTTP 端点支持 x402 标准支付。

## 用法

```bash
node example-server.js
```

## 测试

```bash
# 无支付凭证 → 402
curl -v http://localhost:3456/api/market-query?item=silk

# 带支付凭证 → 200
curl -H "X-402-Payment: {\"tx_hash\":\"0xabc...\"}" \
     http://localhost:3456/api/market-query?item=silk

# Agent Card 发现
curl http://localhost:3456/.well-known/agent-card.json
```

## 集成 OceanBus

在 Agent 端侧对接 OceanBus 支付见证：

```javascript
const ob = await createOceanBus({ ... })

const app = createApp({
  verifyPayment: async (proof) => {
    // 链上查询 tx_hash 是否确认
    return true
  },
  recordPayment: async (payment) => {
    // 写入 OceanBus 声誉支付见证
    await ob.l1.reputation.claimPayment({
      payeeOpenid: MY_OPENID,
      amount: payment.amount,
      currency: payment.currency,
      txHash: payment.txHash,
      description: payment.description
    })
  }
})
```

## 参考

- [x402 标准](https://x402.org)
- [A2A x402 扩展](https://github.com/google-agentic-commerce/a2a-x402)
- [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004)

/**
 * x402 支付兼容参考实现 — Express 端侧 Agent 示例
 *
 * 演示 OceanBus Agent 如何暴露 HTTP 端点并支持 x402 支付：
 *   1. 客户端请求服务
 *   2. 服务端返回 402 Payment Required（含价格和支付方式）
 *   3. 客户端完成支付后重试
 *   4. 服务端验证支付 → 调用 OceanBus 支付见证 → 返回服务
 *
 * 运行: node example-server.js
 * 测试: curl -H "Origin: agent://openid_test" http://localhost:3456/api/market-query?item=silk
 */

const express = require('express')

// ── x402 响应头 ──

/**
 * 构造 402 Payment Required 响应
 * @param {object} opts
 * @param {number} opts.price - 价格
 * @param {string} opts.currency - 币种（默认 USDC）
 * @param {string} opts.network - 支付网络（默认 base）
 * @param {string} opts.recipient - 收款地址
 */
function paymentRequired({ price, currency, network, recipient }) {
  const headers = {
    'X-402-Price': `${price} ${currency || 'USDC'}`,
    'X-402-Network': network || 'base',
    'X-402-Recipient': recipient || '0x_your_address_here',
    'X-402-Version': '0.2',
  }
  const body = {
    error: 'Payment Required',
    price: `${price} ${currency || 'USDC'}`,
    network: network || 'base',
    recipient: recipient || '0x_your_address_here',
  }
  return { status: 402, headers, body }
}

/**
 * 解析 x402 支付凭证
 * 支持两种格式：
 *   1. X-402-Payment 头：JSON { tx_hash, amount, currency, from, to }
 *   2. X-402-Signature 头：已签名的支付授权
 */
function parsePaymentProof(req) {
  const paymentHeader = req.headers['x-402-payment']
  if (paymentHeader) {
    try {
      return JSON.parse(paymentHeader)
    } catch {
      return { raw: paymentHeader }
    }
  }
  // x402 v0.2: PAYMENT-SIGNATURE 头
  const sigHeader = req.headers['payment-signature']
  if (sigHeader) {
    return { signature: sigHeader }
  }
  return null
}

// ── Express 应用 ──

function createApp({ verifyPayment, recordPayment } = {}) {
  const app = express()
  app.use(express.json())

  /**
   * 行情查询 API — x402 付费端点
   * GET /api/market-query?item=silk
   */
  app.get('/api/market-query', async (req, res) => {
    const { item } = req.query
    if (!item) return res.status(400).json({ error: 'Missing item parameter' })

    // Step 1: 检查支付
    const proof = parsePaymentProof(req)
    if (!proof) {
      const pr = paymentRequired({
        price: 2,
        currency: 'USDC',
        network: 'base',
        recipient: '0x_your_agent_wallet_address'
      })
      Object.entries(pr.headers).forEach(([k, v]) => res.setHeader(k, v))
      return res.status(402).json(pr.body)
    }

    // Step 2: 验证支付（由调用方注入）
    if (verifyPayment) {
      const valid = await verifyPayment(proof)
      if (!valid) {
        return res.status(402).json({ error: 'Invalid payment', proof })
      }
    }

    // Step 3: 记录支付见证（调用 OceanBus Reputation）
    if (recordPayment) {
      try {
        await recordPayment({
          payer: req.headers['origin'] || 'unknown',
          amount: 2,
          currency: 'USDC',
          chain: 'base',
          txHash: proof.tx_hash || null,
          description: `Market query: ${item}`
        })
      } catch (err) {
        console.error('Payment witness recording failed:', err.message)
        // 不影响服务——见证是尽力而为的
      }
    }

    // Step 4: 提供服务
    const prices = { silk: { buy: 1425, sell: 1390 }, tea: { buy: 210, sell: 190 } }
    res.json({
      item,
      prices: prices[item] || { buy: 0, sell: 0 },
      payment_verified: !!proof,
      x402: { settled: true }
    })
  })

  /**
   * /.well-known/agent-card.json — A2A 发现端点
   */
  app.get('/.well-known/agent-card.json', (req, res) => {
    res.json({
      name: 'Market Query Agent',
      description: 'Query port market prices — 2 USDC per query',
      url: `http://localhost:3456`,
      version: '1.0.0',
      capabilities: { streaming: false },
      defaultInputModes: ['text'],
      defaultOutputModes: ['text'],
      skills: [{
        id: 'market_query',
        name: 'Market Query',
        description: 'Query current prices at a port',
        tags: ['market', 'trading'],
        examples: ["What's the price of silk in Canton?"]
      }],
      // x402 扩展：声明支持付费
      'x402:support': true,
      'x402:networks': ['base', 'ethereum'],
      'x402:currencies': ['USDC', 'ETH']
    })
  })

  return app
}

// ── 独立运行 ──
if (require.main === module) {
  const app = createApp({
    verifyPayment: async (proof) => {
      // TODO: 替换为真实的链上验证逻辑
      console.log('[x402] Verifying payment:', proof.tx_hash || proof.signature || 'raw')
      return true
    },
    recordPayment: async (payment) => {
      // TODO: 替换为真实的 OceanBus 支付见证调用
      console.log('[x402] Recording payment witness:', payment)
    }
  })

  const PORT = process.env.PORT || 3456
  app.listen(PORT, () => {
    console.log(`x402 Market Query Agent running on http://localhost:${PORT}`)
    console.log(`Test: curl -v http://localhost:${PORT}/api/market-query?item=silk`)
    console.log(`Agent Card: http://localhost:${PORT}/.well-known/agent-card.json`)
  })
}

module.exports = { createApp, paymentRequired, parsePaymentProof }

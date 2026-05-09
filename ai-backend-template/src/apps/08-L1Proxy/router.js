/**
 * @file router.js (08-L1Proxy)
 * @description L1 REST 代理——将黄页/声誉的消息式 API 转为 HTTP
 *
 * Dify 等平台 → HTTP POST → 本代理 → L0 消息 → L1 Agent → L0 回复 → 本代理 → HTTP 响应
 */
const request = require('superagent')
const { INFO, ERROR, WARN } = require('../../lib/logSvc.js')(__filename)
const { interceptRouters, METHODS: { GET, POST } } = require('../../lib/routerlib')

const config = require('./config.json')
const l0BaseUrl = config.l0.base_url
const l0ApiKey = config.l0.api_key
const ypOpenid = config.l1_services.yellow_pages.openid
const repOpenid = config.l1_services.reputation.openid

const startedAt = Date.now()
const counters = {
  'yellow-pages-discover': { count: 0, last: null },
  'reputation-query': { count: 0, last: null },
}

function authHeader() {
  return { Authorization: `Bearer ${l0ApiKey}` }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ── L0 消息收发 ──

async function l0Send(toOpenid, content) {
  const clientMsgId = `pxy_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
  const res = await request
    .post(`${l0BaseUrl}/messages`)
    .set(authHeader())
    .send({ to_openid: toOpenid, client_msg_id: clientMsgId, content })
    .timeout(15000)
    .ok(() => true)

  if (res.body.code !== 0) {
    throw new Error(`L0 send 失败: ${res.body.msg}`)
  }
}

async function l0Sync(sinceSeq) {
  const res = await request
    .get(`${l0BaseUrl}/messages/sync`)
    .set(authHeader())
    .query({ since_seq: sinceSeq, limit: 10 })
    .timeout(15000)
    .ok(() => true)

  if (res.body.code !== 0) {
    throw new Error(`L0 sync 失败: ${res.body.msg}`)
  }
  return res.body.data
}

// ── 请求转发与应答等待 ──

/**
 * 向 L1 Agent 发送请求，轮询等待回复
 * @param {string} l1Openid L1 服务的 OpenID
 * @param {object} payload 请求体（含 action, request_id 等）
 * @param {number} timeoutMs 超时毫秒数
 */
async function forwardRequest(l1Openid, payload, timeoutMs = 15000) {
  const startedAt = Date.now()

  // 发送前先同步一次，记录当前 seq 水位
  let sinceSeq = 0
  try {
    const data = await l0Sync(0)
    if (data.messages && data.messages.length > 0) {
      sinceSeq = data.messages[data.messages.length - 1].seq_id
    }
  } catch (e) {
    WARN(`L1Proxy: 初始 sync 失败: ${e.message}`)
  }

  // 发送请求
  await l0Send(l1Openid, JSON.stringify(payload))
  INFO(`L1Proxy: → ${payload.action} request_id=${payload.request_id}`)

  // 轮询等待回复
  while (Date.now() - startedAt < timeoutMs) {
    await sleep(600)

    try {
      const data = await l0Sync(sinceSeq)
      const messages = data.messages || []

      for (const msg of messages) {
        sinceSeq = Math.max(sinceSeq, msg.seq_id)

        try {
          const reply = JSON.parse(msg.content)
          if (reply && reply.request_id === payload.request_id) {
            INFO(`L1Proxy: ← ${payload.action} code=${reply.code} (${Date.now() - startedAt}ms)`)
            return reply
          }
        } catch {
          // 非 JSON 消息或不是给我们的回复，跳过
        }
      }
    } catch (e) {
      WARN(`L1Proxy: 轮询异常: ${e.message}`)
    }
  }

  ERROR(`L1Proxy: ${payload.action} 超时 (${timeoutMs}ms)`)
  return { code: -1, msg: 'L1 服务超时，请重试', request_id: payload.request_id }
}

function genRequestId() {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`
}

// ── 路由 ──

module.exports = expressRouter => {
  interceptRouters({
    expressRouter,
    routers: {
      '': [
        ['healthcheck', GET, () => ({
          code: 0,
          data: { app: 'L1Proxy', version: '1.0.0' }
        })],
        ['stats', GET, () => ({
          code: 0,
          data: {
            uptime_ms: Date.now() - startedAt,
            counters,
          }
        })],
      ],

      // ── 黄页 ──
      'yellow-pages': [
        ['discover', POST, async ({ tags, limit, cursor, a2a_only, format }) => {
          counters['yellow-pages-discover'].count++
          counters['yellow-pages-discover'].last = new Date().toISOString()
          const payload = {
            action: 'discover',
            request_id: genRequestId(),
            tags: tags || [],
            limit: Math.min(limit || 20, 500),
            cursor: cursor || null,
            a2a_only: a2a_only || false,
            format: format || null
          }
          return await forwardRequest(ypOpenid, payload)
        }],
        ['verify-card', POST, async ({ openid, card_hash }) => {
          if (!openid || !card_hash) {
            return { code: 1003, msg: '缺少 openid 或 card_hash' }
          }
          const payload = {
            action: 'verify_card',
            request_id: genRequestId(),
            openid,
            card_hash
          }
          return await forwardRequest(ypOpenid, payload)
        }],
      ],

      // ── 声誉 ──
      'reputation': [
        ['query', POST, async ({ openids }) => {
          counters['reputation-query'].count++
          counters['reputation-query'].last = new Date().toISOString()
          if (!openids || !Array.isArray(openids) || openids.length === 0) {
            return { code: 1003, msg: '缺少 openids 字段' }
          }
          if (openids.length > 100) {
            return { code: 1004, msg: 'openids 单次最多 100 个' }
          }
          const payload = {
            action: 'query_reputation',
            request_id: genRequestId(),
            openids
          }
          return await forwardRequest(repOpenid, payload)
        }],
      ],
    }
  })
}

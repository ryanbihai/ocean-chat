/**
 * @file agent.js (05-ReputationSvc)
 * @description L0 Agent 客户端——消息轮询、动作分发、响应回复
 * 声誉服务作为 L0 Agent 运行，通过 L0 消息管道与其他 Agent 通信
 */

const path = require('path')
const fs = require('fs')
const request = require('superagent')
const { INFO, ERROR, WARN } = require('../../lib/logSvc.js')(__filename)
const service = require('./service')

function loadConfig() {
  let envSuffix = ''
  switch (process.env.NODE_ENV) {
    case 'development': envSuffix = 'dev'; break
    case 'local': envSuffix = 'local'; break
    default: envSuffix = ''; break
  }

  let config = require('./config.json')
  if (envSuffix) {
    const envPath = path.join(__dirname, `config-${envSuffix}.json`)
    if (fs.existsSync(envPath)) {
      config = { ...config, ...require(envPath) }
    }
  }
  return config
}

const appConfig = loadConfig()

let running = false
let pollTimer = null
let sinceSeq = 0
let myOpenid = null

const l0BaseUrl = appConfig.l0.base_url
const l0ApiKey = appConfig.l0.api_key

function authHeader() {
  return { Authorization: `Bearer ${l0ApiKey}` }
}

// ── L0 HTTP 封装 ──

async function l0Sync() {
  const res = await request
    .get(`${l0BaseUrl}/messages/sync`)
    .set(authHeader())
    .query({ since_seq: sinceSeq, limit: 100 })
    .timeout(15000)
    .ok(() => true)

  if (res.body.code !== 0) {
    throw new Error(`Sync 失败: ${res.body.msg}`)
  }
  return res.body.data
}

async function l0Send(toOpenid, content) {
  const clientMsgId = `rep_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`
  const res = await request
    .post(`${l0BaseUrl}/messages`)
    .set(authHeader())
    .send({ to_openid: toOpenid, client_msg_id: clientMsgId, content })
    .timeout(15000)
    .ok(() => true)

  if (res.body.code !== 0) {
    throw new Error(`Send 失败: ${res.body.msg}`)
  }
}

// §5.1 反向解析 — OpenID → UUID
async function l0ReverseLookup(openid) {
  const res = await request
    .get(`${l0BaseUrl}/internal/reverse-lookup`)
    .set(authHeader())
    .query({ openid })
    .timeout(10000)
    .ok(() => true)

  return res.body
}

// §5.2 注册时间查询 — UUID → registered_at
async function l0RegistrationInfo(uuid) {
  const res = await request
    .get(`${l0BaseUrl}/internal/registration-info`)
    .set(authHeader())
    .query({ agent_id: uuid })
    .timeout(10000)
    .ok(() => true)

  return res.body
}

// §5.3 通信统计 — UUID → unique_partners
async function l0CommunicationStats(uuid) {
  const res = await request
    .get(`${l0BaseUrl}/internal/communication-stats`)
    .set(authHeader())
    .query({ agent_id: uuid })
    .timeout(10000)
    .ok(() => true)

  return res.body
}

// §5.4 交互验证 — 验证两个 Agent 之间的绑定条件
async function l0VerifyInteraction(fromUuid, toUuid) {
  const res = await request
    .post(`${l0BaseUrl}/internal/verify-interaction`)
    .set(authHeader())
    .send({ agent_id_a: fromUuid, agent_id_b: toUuid })
    .timeout(10000)
    .ok(() => true)

  return res.body
}

// ── 消息处理 ──

function dispatch(payload, fromOpenid) {
  const ctx = {
    callerOpenid: fromOpenid,
    l0ReverseLookup,
    l0RegistrationInfo,
    l0CommunicationStats,
    l0VerifyInteraction
  }

  switch (payload.action) {
    case 'tag':               return service.tag(payload, ctx)
    case 'untag':             return service.untag(payload, ctx)
    case 'record_fact':       return service.recordFact(payload, ctx)
    case 'query_reputation':  return service.queryReputation(payload, ctx)
    case 'claim_payment':     return service.claimPayment(payload, ctx)
    case 'confirm_payment':   return service.confirmPayment(payload, ctx)
    case 'query_payments':    return service.queryPayments(payload, ctx)
    default:
      return { code: -1, msg: `未知 action: ${payload.action}` }
  }
}

async function handleMessage(msg) {
  let payload
  try {
    payload = JSON.parse(msg.content)
  } catch {
    return
  }

  if (!payload || !payload.action) return

  INFO(`处理: action=${payload.action} request_id=${payload.request_id} from=${msg.from_openid}`)

  const result = await dispatch(payload, msg.from_openid)

  result.request_id = payload.request_id

  try {
    const responseStr = JSON.stringify(result)
    await l0Send(msg.from_openid, responseStr)
    INFO(`响应已发送: action=${payload.action} code=${result.code}`)
  } catch (e) {
    ERROR(`发送响应失败: ${e.message}`)
  }
}

// ── 轮询循环 ──

async function poll() {
  try {
    const data = await l0Sync()
    const messages = data.messages || []

    for (const msg of messages) {
      try {
        await handleMessage(msg)
      } catch (e) {
        ERROR(`消息处理异常: ${e.message}`)
      }
    }

    if (messages.length > 0) {
      sinceSeq = messages[messages.length - 1].seq_id
      INFO(`游标推进: since_seq=${sinceSeq}`)
    }
  } catch (e) {
    WARN(`轮询异常，下次重试: ${e.message}`)
  }

  if (running) {
    pollTimer = setTimeout(poll, 2000)
  }
}

// ── 公共接口 ──

async function start() {
  if (running) return

  INFO('声誉 Agent 启动中...')
  INFO(`L0: ${l0BaseUrl}`)

  try {
    const res = await request
      .get(`${l0BaseUrl}/agents/me`)
      .set(authHeader())
      .timeout(10000)
      .ok(() => true)

    if (res.body.code === 0) {
      myOpenid = res.body.data.my_openid
      INFO(`声誉 OpenID: ${myOpenid}`)
    } else {
      ERROR(`获取 OpenID 失败: ${res.body.msg}`)
    }
  } catch (e) {
    ERROR(`获取 OpenID 异常: ${e.message}`)
  }

  running = true
  poll()
  INFO('声誉 Agent 已就绪')
}

async function stop() {
  running = false
  if (pollTimer) {
    clearTimeout(pollTimer)
    pollTimer = null
  }
  INFO('声誉 Agent 已停止')
}

function getStatus() {
  return {
    running,
    since_seq: sinceSeq,
    my_openid: myOpenid,
    l0_base_url: l0BaseUrl
  }
}

module.exports = { start, stop, getStatus }

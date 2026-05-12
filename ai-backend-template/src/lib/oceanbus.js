/**
 * @file lib/oceanbus.js
 * @description 服务端 OceanBus L0 客户端 (superagent 版本)
 *
 * v2 核心变更：
 * - register() 返回 {agent_id, api_key}，不再含 agent_code
 * - /agents/lookup 已废弃，用 GET /agents/me 获取 my_openid
 * - 三要素 (agentId + openid + apiKey) 缺一不可
 * - 支持 POW (Proof-of-Work) 挑战 — SHA-256 Hashcash 5 前导零
 */

const superagent = require('superagent')
const crypto = require('crypto')

// Bump manually when the hand-rolled client is updated.
// Should match the latest oceanbus npm SDK version this client mirrors.
const LIB_VERSION = '0.3.2'

let _deprecatedWarned = false

class OceanBus {
  constructor(baseUrl) {
    this.baseUrl = baseUrl || 'https://ai-t.ihaola.com.cn/api/l0'
    this.apiKey = null
    this.openid = null
    this.agentId = null
  }

  /** Attach standard headers (SDK version, auth) to every request */
  _headers(req) {
    req.set('X-OceanBus-SDK-Version', LIB_VERSION)
    if (this.apiKey) {
      req.set('Authorization', 'Bearer ' + this.apiKey)
    }
    return req
  }

  /** Check X-OceanBus-Deprecated response header — warn once */
  _checkDeprecated(res) {
    if (_deprecatedWarned) return
    const msg = res.headers['x-oceanbus-deprecated']
    if (msg) {
      _deprecatedWarned = true
      console.warn('[oceanbus] ⚠ This client version is deprecated:', msg)
      console.warn('[oceanbus] Upgrade the hand-rolled client to match oceanbus@latest')
    }
  }

  /** Compute Hashcash POW — difficulty is in BITS (not hex chars). 20 bits = 5 hex zeros ≈ 1s. */
  _computePow(nonce, difficulty = 20) {
    const bitsToHex = (bits) => Math.ceil(bits / 4)
    const prefix = '0'.repeat(bitsToHex(difficulty))
    let solution = 0
    let hash = ''
    while (true) {
      hash = crypto.createHash('sha256').update(nonce + solution).digest('hex')
      if (hash.startsWith(prefix)) break
      solution++
    }
    return { solution: String(solution), hash }
  }

  /** Async POW — yields every 50000 iterations so the event loop stays alive */
  async _computePowAsync(nonce, difficulty = 20) {
    const bitsToHex = (bits) => Math.ceil(bits / 4)
    const prefix = '0'.repeat(bitsToHex(difficulty))
    let solution = 0
    let hash = ''
    while (true) {
      hash = crypto.createHash('sha256').update(nonce + solution).digest('hex')
      if (hash.startsWith(prefix)) break
      solution++
      if (solution % 50000 === 0) {
        await new Promise(r => setImmediate(r))
      }
    }
    return { solution: String(solution), hash }
  }

  async register() {
    try {
      // Step 1: initial registration attempt
      let res = await this._headers(
        superagent
          .post(this.baseUrl + '/agents/register')
          .set('Content-Type', 'application/json')
          .send({})
          .ok(() => true) // don't throw on 4xx
      )
      this._checkDeprecated(res)

      // Step 2: POW challenge (HTTP 401 with challenge data)
      if (res.status === 401 && res.body?.data?.challenge?.nonce) {
        const { nonce, difficulty } = res.body.data.challenge
        const actualDifficulty = difficulty ?? 20
        console.warn(`[oceanbus] Computing proof of work (difficulty=${actualDifficulty})...`)
        const startedAt = Date.now()
        const { solution } = await this._computePowAsync(nonce, actualDifficulty)
        console.warn(`[oceanbus] POW solved in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`)
        res = await this._headers(
          superagent
            .post(this.baseUrl + '/agents/register')
            .set('Content-Type', 'application/json')
            .send({ challenge: nonce, solution })
            .ok(() => true)
        )
        this._checkDeprecated(res)
      }

      // Step 3: check result
      if (res.body && res.body.code === 0) {
        const data = res.body.data
        if (!data || !data.api_key || !data.agent_id) {
          return { code: 500, msg: 'Registration response missing agent_id or api_key' }
        }
        this.apiKey = data.api_key
        this.agentId = data.agent_id

        // v2: /agents/me 替代已废弃的 /agents/lookup
        const meResult = await this.getMe()
        if (meResult.code === 0 && meResult.data) {
          this.openid = meResult.data.my_openid
        }
      }

      // Include retry-after for rate-limited responses
      if (res.status === 429 || res.body?.code === 1007) {
        res.body = res.body || {}
        res.body._retryAfter = res.headers['retry-after'] || null
      }

      return res.body
    } catch (err) {
      return { code: 500, msg: err.message }
    }
  }

  /**
   * 获取自身永久路由票据
   * v2 新增：替代已废弃的 /agents/lookup
   */
  async getMe() {
    try {
      const res = await this._headers(
        superagent.get(this.baseUrl + '/agents/me').ok(() => true)
      )
      this._checkDeprecated(res)
      return res.body
    } catch (err) {
      let detail = err.message
      if (err.response) {
        detail = `HTTP ${err.response.status}: ${JSON.stringify(err.response.body || err.response.text).substring(0, 200)}`
      }
      return { code: 500, msg: err.message, detail, httpStatus: err.response?.status || 0 }
    }
  }

  async sendMessage(toOpenid, content) {
    try {
      const res = await this._headers(
        superagent
          .post(this.baseUrl + '/messages')
          .set('Content-Type', 'application/json')
          .ok(() => true)
          .send({
            to_openid: toOpenid,
            client_msg_id: 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 11),
            content: content
          })
      )
      this._checkDeprecated(res)
      return res.body
    } catch (err) {
      let detail = err.message
      if (err.response) {
        detail = `HTTP ${err.response.status}: ${JSON.stringify(err.response.body || err.response.text).substring(0, 200)}`
      }
      return { code: 500, msg: err.message, detail, httpStatus: err.response?.status || 0 }
    }
  }

  async syncMessages(sinceSeq = 0) {
    try {
      const res = await this._headers(
        superagent
          .get(this.baseUrl + '/messages/sync')
          .ok(() => true)
          .query({ since_seq: sinceSeq })
      )
      this._checkDeprecated(res)
      return res.body
    } catch (err) {
      let detail = err.message
      if (err.response) {
        detail = `HTTP ${err.response.status}: ${JSON.stringify(err.response.body || err.response.text).substring(0, 200)}`
      }
      return { code: 500, msg: err.message, detail, httpStatus: err.response?.status || 0 }
    }
  }

  restoreFromConfig(agentId, openid, apiKey) {
    this.agentId = agentId
    this.openid = openid
    this.apiKey = apiKey
  }

  async validateApiKey() {
    if (!this.apiKey) return false
    try {
      const result = await this.syncMessages(0)
      return result.code !== 401 && result.code !== 403
    } catch (e) {
      return false
    }
  }

  isReady() {
    return !!(this.apiKey && this.agentId && this.openid)
  }

  getStatus() {
    return {
      agentId: this.agentId,
      openid: this.openid,
      hasApiKey: !!this.apiKey,
      ready: this.isReady()
    }
  }
}

module.exports = OceanBus

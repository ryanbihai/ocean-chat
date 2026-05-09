/**
 * @file service.js (04-YellowPageSvc)
 * @description L1 黄页服务——服务发现基础设施
 */

const { INFO, ERROR } = require('../../lib/logSvc.js')(__filename)
const { Service } = require('../../lib/servicelib')
const { YellowPageEntry } = require('./models')
const { sign, verify } = require('../../lib/ed25519')
const { canonicalize } = require('../../lib/canonical-json')

const service = new Service({ __dirname, __filename, module })

// ── 错误码（黄页 L1 独立命名空间） ──
const E = {
  OK: 0,
  SIG_INVALID: 1001,
  OPENID_TAKEN: 1002,
  MISSING_FIELDS: 1003,
  TAGS_TOO_LONG: 1004,
  DESCRIPTION_TOO_LONG: 1005,
  UUID_TAKEN: 1006,
  ENTRY_NOT_FOUND: 1007,
  SUMMARY_TOO_LONG: 1008,
  CARD_HASH_INVALID: 1009,
  REVIEW_REJECTED: 1010
}

// ── 验证工具 ──

function validateTags(tags) {
  if (!Array.isArray(tags)) return true
  const totalChars = tags.reduce((sum, t) => sum + (typeof t === 'string' ? t.length : 0), 0)
  return totalChars <= 120
}

function validateDescription(desc) {
  return typeof desc === 'string' && desc.length <= 800
}

function validateSummary(sum) {
  return sum === undefined || sum === null || (typeof sum === 'string' && sum.length <= 140)
}

function validateCardHash(hash) {
  return hash === undefined || hash === null ||
    (typeof hash === 'string' && /^sha256:[a-f0-9]{64}$/.test(hash))
}

async function verifySig(params, publicKey) {
  const { sig, ...payload } = params
  if (!sig || !publicKey) return false
  const canonical = canonicalize(payload)
  return verify(publicKey, canonical, sig)
}

// ── 内容审核 ──

const REVIEW_ENABLED = !!process.env.ANTHROPIC_API_KEY

// 关键词黑名单（第一道防线 — 免费 + 零延迟）
let REVIEW_WORDS = null
function loadReviewWords() {
  if (REVIEW_WORDS) return REVIEW_WORDS
  try {
    const path = require('path')
    REVIEW_WORDS = require(path.join(__dirname, 'review-words.json'))
  } catch (_) { REVIEW_WORDS = {} }
  return REVIEW_WORDS
}

/**
 * 关键词过滤 — 匹配任一类别即拒绝
 * @returns {{ passed: boolean, reason?: string }}
 */
function keywordFilter(description, tags) {
  const words = loadReviewWords()
  const content = `${description || ''} ${(tags || []).join(' ')}`.toLowerCase()

  for (const [category, config] of Object.entries(words)) {
    for (const kw of config.keywords) {
      if (content.includes(kw.toLowerCase())) {
        return { passed: false, reason: `${config.label} — 匹配关键词: "${kw}"` }
      }
    }
  }
  return { passed: true }
}

// LLM 审核 prompt（第二道防线 — 语义理解）
const REVIEW_PROMPT = `你是 OceanBus Yellow Pages 的内容审核员。审查以下 skill 提交是否包含违规内容。

审查标准：
1. 黄赌毒：色情、赌博、毒品相关——直接拒绝
2. 暴恐：暴力、恐怖主义、武器交易——直接拒绝
3. 涉政：攻击中国政治制度、分裂国家、邪教——直接拒绝
4. 欺诈：明显的骗局、虚假承诺（"日赚万元"、"保证月入百万"）——直接拒绝
5. 恶意：描述中含攻击性内容或链接到恶意网站——直接拒绝

允许的内容：
- 正常的 AI skill：工具、游戏、数据分析、自动化等
- 商业服务描述（"付费查询行情"是正常的）
- 医疗、保险、金融等专业服务

输出格式（严格 JSON）：
{"verdict":"approved|rejected","reason":"一句话原因（中文）"}`

async function llmReview(name, description, tags) {
  const content = `Skill 名称: ${name || '(未提供)'}
描述: ${description || ''}
标签: ${(tags || []).join(', ') || '(无)'}`

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: process.env.REVIEW_MODEL || 'claude-haiku-4-5',
        max_tokens: 256,
        system: REVIEW_PROMPT,
        messages: [{ role: 'user', content }]
      })
    })

    if (!resp.ok) {
      return { verdict: 'approved', reason: `审核服务不可用 (HTTP ${resp.status})` }
    }

    const data = await resp.json()
    const text = data.content?.[0]?.text || ''
    const match = text.match(/\{[\s\S]*\}/)
    if (match) {
      const result = JSON.parse(match[0])
      if (result.verdict === 'approved' || result.verdict === 'rejected') {
        return result
      }
    }
    if (text.includes('rejected') || text.includes('违规') || text.includes('拒绝')) {
      return { verdict: 'rejected', reason: text.trim().substring(0, 200) }
    }
    return { verdict: 'approved', reason: '审核通过' }
  } catch (e) {
    ERROR(`LLM 审核异常: ${e.message}`)
    return { verdict: 'approved', reason: `审核异常（已放行）` }
  }
}

/**
 * 双层审核：关键词（免费）→ LLM（可选）
 */
async function reviewContent(name, description, tags) {
  // 第一道：关键词过滤（始终启用）
  const kwResult = keywordFilter(description, tags)
  if (!kwResult.passed) {
    INFO(`关键词拦截: ${kwResult.reason}`)
    return { verdict: 'rejected', reason: kwResult.reason }
  }

  // 第二道：LLM 语义审核（仅当配置了 API key）
  if (REVIEW_ENABLED) {
    return llmReview(name, description, tags)
  }

  return { verdict: 'approved', reason: '关键词审核通过' }
}

// ── 核心方法 ──

/**
 * 注册服务——首次注册时绑定 Ed25519 公钥
 */
exports.registerService = async (params, ctx) => {
  const { openid, tags, description, public_key, sig,
          card_hash, summary, a2a_compatible, a2a_endpoint } = params

  if (!openid || !description || !public_key || !sig) {
    return { code: E.MISSING_FIELDS, msg: '缺少必填字段' }
  }
  if (!validateTags(tags)) {
    return { code: E.TAGS_TOO_LONG, msg: 'tags 总字符数超过 120' }
  }
  if (!validateDescription(description)) {
    return { code: E.DESCRIPTION_TOO_LONG, msg: 'description 超过 800 字符' }
  }
  if (!validateSummary(summary)) {
    return { code: E.SUMMARY_TOO_LONG, msg: 'summary 超过 140 字符' }
  }
  if (!validateCardHash(card_hash)) {
    return { code: E.CARD_HASH_INVALID, msg: 'card_hash 格式无效，需为 sha256:hex64' }
  }

  // 验签
  if (!(await verifySig(params, public_key))) {
    return { code: E.SIG_INVALID, msg: '签名验证失败' }
  }

  // 调 L0 reverse-lookup 反查 UUID
  let agent_id
  try {
    const lookupRes = await ctx.l0ReverseLookup(openid)
    if (lookupRes.code !== 0) {
      return { code: E.MISSING_FIELDS, msg: 'OpenID 无效，无法反查' }
    }
    agent_id = lookupRes.data.real_agent_id
  } catch (e) {
    ERROR(`L0 反查失败: ${e.message}`)
    return { code: E.MISSING_FIELDS, msg: 'L0 反查服务不可用' }
  }

  // ── 内容审核 ──
  const review = await reviewContent(summary || description, description, tags)
  if (review.verdict === 'rejected') {
    INFO(`审核拒绝: ${openid} — ${review.reason}`)
    return { code: E.REVIEW_REJECTED, msg: `内容审核未通过: ${review.reason}` }
  }

  const now = new Date()

  try {
    await YellowPageEntry.create({
      openid,
      agent_id,
      public_key,
      tags: tags || [],
      description,
      card_hash: card_hash || null,
      summary: summary || null,
      a2a_compatible: a2a_compatible || false,
      a2a_endpoint: a2a_endpoint || null,
      review_status: review.verdict === 'approved' ? 'approved' : 'flagged',
      review_reason: review.reason,
      reviewed_at: now,
      registered_at: now,
      updated_at: now,
      last_heartbeat: now
    })
  } catch (e) {
    // MongoDB duplicate key → 区分 openid 重复还是 agent_id 重复
    if (e.code === 11000) {
      const dup = await YellowPageEntry.findOne({
        $or: [{ openid }, { agent_id }]
      }).select('openid agent_id').lean()
      if (dup && dup.openid === openid) {
        return { code: E.OPENID_TAKEN, msg: '该 openid 已有活跃条目' }
      }
      return { code: E.UUID_TAKEN, msg: '该 Agent 已有活跃条目（一个 Agent 仅限一条）' }
    }
    throw e
  }

  INFO(`新条目注册: ${agent_id}`)
  return { code: E.OK, data: { openid, registered_at: now.toISOString(), updated_at: now.toISOString() } }
}

/**
 * 服务发现——按标签精确匹配，按注册时间排序，游标分页
 */
exports.discover = async (params) => {
  const { tags, limit = 20, cursor, a2a_only, format } = params

  const tagFilter = (tags && tags.length > 0) ? { tags: { $all: tags } } : {}
  const a2aFilter = a2a_only ? { a2a_compatible: true } : {}

  const query = { ...tagFilter, ...a2aFilter }

  // 游标分页——复合游标 registered_at + _id 避免同毫秒丢失
  if (cursor) {
    const separatorIdx = cursor.lastIndexOf('|')
    if (separatorIdx > 0) {
      const ts = new Date(cursor.substring(0, separatorIdx))
      const id = cursor.substring(separatorIdx + 1)
      query.$or = [
        { registered_at: { $gt: ts } },
        { registered_at: ts, _id: { $gt: id } }
      ]
    } else {
      query.registered_at = { $gt: new Date(cursor) }
    }
  }

  const actualLimit = Math.min(Math.max(parseInt(limit) || 20, 1), 500)

  const [entries, total] = await Promise.all([
    YellowPageEntry.find(query)
      .sort({ registered_at: 1, _id: 1 })
      .limit(actualLimit + 1)
      .lean(),
    YellowPageEntry.countDocuments(tagFilter)
  ])

  const hasMore = entries.length > actualLimit
  if (hasMore) entries.pop()

  const lastEntry = entries[entries.length - 1]
  const nextCursor = hasMore && lastEntry
    ? `${lastEntry.registered_at.toISOString()}|${lastEntry._id}`
    : null

  const fmtDate = (d) => (d instanceof Date ? d : new Date(d)).toISOString()
  const a2aMode = format === 'a2a'

  return {
    code: E.OK,
    data: {
      entries: entries.map(e => {
        if (a2aMode) {
          return {
            agent_card_url: e.a2a_endpoint || `oceanbus://${e.openid}?action=get_agent_card`,
            http_card_url: e.a2a_endpoint || null,
            display_name: e.summary || (e.description || '').substring(0, 60),
            summary: e.summary || (e.description || '').substring(0, 140),
            tags: e.tags,
            card_hash: e.card_hash || null,
            a2a_compatible: e.a2a_compatible || false,
            registered_at: fmtDate(e.registered_at),
            updated_at: fmtDate(e.updated_at)
          }
        }
        return {
          openid: e.openid,
          tags: e.tags,
          description: e.description,
          summary: e.summary || null,
          card_hash: e.card_hash || null,
          a2a_compatible: e.a2a_compatible || false,
          a2a_endpoint: e.a2a_endpoint || null,
          registered_at: fmtDate(e.registered_at),
          updated_at: fmtDate(e.updated_at),
          last_heartbeat: fmtDate(e.last_heartbeat)
        }
      }),
      total,
      next_cursor: nextCursor
    }
  }
}

/**
 * 心跳保活——更新 last_heartbeat
 */
exports.heartbeat = async (params) => {
  const { openid, sig } = params
  if (!openid || !sig) {
    return { code: E.MISSING_FIELDS, msg: '缺少必填字段' }
  }

  const entry = await YellowPageEntry.findOne({ openid })
  if (!entry) {
    return { code: E.ENTRY_NOT_FOUND, msg: '条目不存在' }
  }

  if (!(await verifySig(params, entry.public_key))) {
    return { code: E.SIG_INVALID, msg: '签名验证失败' }
  }

  entry.last_heartbeat = new Date()
  await entry.save()

  return { code: E.OK }
}

/**
 * 更新服务信息——partial update，不可变更 openid
 */
exports.updateService = async (params) => {
  const { openid, sig, tags, description,
          card_hash, summary, a2a_compatible, a2a_endpoint } = params
  if (!openid || !sig) {
    return { code: E.MISSING_FIELDS, msg: '缺少必填字段' }
  }

  const entry = await YellowPageEntry.findOne({ openid })
  if (!entry) {
    return { code: E.ENTRY_NOT_FOUND, msg: '条目不存在' }
  }

  if (!(await verifySig(params, entry.public_key))) {
    return { code: E.SIG_INVALID, msg: '签名验证失败' }
  }

  if (tags !== undefined) {
    if (!validateTags(tags)) {
      return { code: E.TAGS_TOO_LONG, msg: 'tags 总字符数超过 120' }
    }
    entry.tags = tags
  }
  if (description !== undefined) {
    if (!validateDescription(description)) {
      return { code: E.DESCRIPTION_TOO_LONG, msg: 'description 超过 800 字符' }
    }
    entry.description = description
  }
  if (card_hash !== undefined) {
    if (!validateCardHash(card_hash)) {
      return { code: E.CARD_HASH_INVALID, msg: 'card_hash 格式无效' }
    }
    entry.card_hash = card_hash
  }
  if (summary !== undefined) {
    if (!validateSummary(summary)) {
      return { code: E.SUMMARY_TOO_LONG, msg: 'summary 超过 140 字符' }
    }
    entry.summary = summary
  }
  if (a2a_compatible !== undefined) {
    entry.a2a_compatible = a2a_compatible
  }
  if (a2a_endpoint !== undefined) {
    entry.a2a_endpoint = a2a_endpoint
  }

  // 如果描述或标签变更，重新审核
  if (tags !== undefined || description !== undefined) {
    const review = await reviewContent(entry.summary || entry.description, entry.description, entry.tags)
    if (review.verdict === 'rejected') {
      INFO(`审核拒绝(更新): ${openid} — ${review.reason}`)
      return { code: E.REVIEW_REJECTED, msg: `内容审核未通过: ${review.reason}` }
    }
    entry.review_status = review.verdict === 'approved' ? 'approved' : 'flagged'
    entry.review_reason = review.reason
    entry.reviewed_at = new Date()
  }

  entry.updated_at = new Date()
  await entry.save()

  return { code: E.OK }
}

/**
 * 注销服务——删除条目
 */
exports.deregisterService = async (params) => {
  const { openid, sig } = params
  if (!openid || !sig) {
    return { code: E.MISSING_FIELDS, msg: '缺少必填字段' }
  }

  const entry = await YellowPageEntry.findOne({ openid })
  if (!entry) {
    return { code: E.ENTRY_NOT_FOUND, msg: '条目不存在' }
  }

  if (!(await verifySig(params, entry.public_key))) {
    return { code: E.SIG_INVALID, msg: '签名验证失败' }
  }

  await YellowPageEntry.deleteOne({ openid })

  return { code: E.OK }
}

/**
 * 验证 AgentCard — 校验提交的 card_hash 是否与黄页存储值匹配
 * 只读操作，无需签名
 */
exports.verifyCard = async (params) => {
  const { openid, card_hash } = params
  if (!openid || !card_hash) {
    return { code: E.MISSING_FIELDS, msg: '缺少 openid 或 card_hash' }
  }

  if (!validateCardHash(card_hash)) {
    return { code: E.CARD_HASH_INVALID, msg: 'card_hash 格式无效' }
  }

  const entry = await YellowPageEntry.findOne({ openid }).lean()
  if (!entry) {
    return { code: E.ENTRY_NOT_FOUND, msg: '条目不存在' }
  }

  const match = entry.card_hash === card_hash
  return {
    code: E.OK,
    data: {
      openid,
      verified: match,
      stored_hash: entry.card_hash || null,
      submitted_hash: card_hash
    }
  }
}

service.exportMe()

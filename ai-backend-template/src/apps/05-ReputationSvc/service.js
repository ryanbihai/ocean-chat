/**
 * @file service.js (05-ReputationSvc)
 * @description L1 声誉服务 MVP — 存标签、数标签、删标签
 *
 * 当前阶段（MVP 先行）：ENFORCE_BINDING = false
 *   接受签名有效 + 7 天冷却 + 自标禁止的标签。不验证 L0 通信条件。
 *   L0 verify-interaction 部署后 → 改 ENFORCE_BINDING = true 即可启用。
 *
 * 绑定条件（ENFORCE_BINDING=true 时生效，通过 §5.4 verify-interaction）：
 *   - 可靠：bidirectional + duration ≥ 1h + total_messages ≥ 5
 *   - 骚扰：标记者收到过目标消息（message_count_b_to_a > 0）
 *   - 违法：附带证据即可，无通信条件
 *   - 自由标签：有过通信记录（total_messages > 0）
 */

const { INFO, ERROR } = require('../../lib/logSvc.js')(__filename)
const { Service } = require('../../lib/servicelib')
const { ReputationTag, ReputationFact } = require('./models')
const { verify } = require('../../lib/ed25519')
const { canonicalize } = require('../../lib/canonical-json')

const service = new Service({ __dirname, __filename, module })

// ── 阶段开关 ──
// L0 verify-interaction 部署后改为 true，启用绑定条件验证。
const ENFORCE_BINDING = false

const CORE_LABELS = ['可靠', '骚扰', '违法']
const COOLDOWN_DAYS = 7
const VALID_FACT_TYPES = ['trade', 'report', 'service']

// ── 错误码 ──
const E = {
  OK: 0,
  SIG_INVALID: 1001,
  MISSING_FIELDS: 1003,
  OPENID_INVALID: 1004,
  COOLDOWN: 1008,
  LABEL_TOO_LONG: 1009,
  EVIDENCE_MISSING: 1010,
  BINDING_CONDITION: 1011,
  TAG_NOT_FOUND: 1012,
  FACT_TYPE_INVALID: 1013
}

// ── 验证工具 ──

function validateLabel(label) {
  return typeof label === 'string' && label.length > 0 && label.length <= 30
}

async function verifySig(params, publicKey) {
  const { sig, ...payload } = params
  if (!sig || !publicKey) return false
  const canonical = canonicalize(payload)
  return verify(publicKey, canonical, sig)
}

// ── 绑定条件验证 ──

async function checkBindingConditions(ctx, fromUuid, toUuid, label, evidence) {
  // 违法标签：必须附带证据（不依赖 L0，始终验证）
  if (label === '违法') {
    if (!evidence || !evidence.core || !evidence.core.seq_id || !evidence.core.content) {
      return { ok: false, code: E.EVIDENCE_MISSING, msg: '违法标签必须附带消息证据' }
    }
    return { ok: true }
  }

  // 可靠 / 骚扰 / 自由标签：绑定条件验证
  // L0 verify-interaction 未就绪时跳过——初期无攻击者，签名 + 冷却已提供基本防护
  if (!ENFORCE_BINDING) {
    return { ok: true }
  }

  let vi
  try {
    const res = await ctx.l0VerifyInteraction(fromUuid, toUuid)
    if (res.code !== 0) {
      return { ok: false, code: E.BINDING_CONDITION, msg: '通信记录不存在' }
    }
    vi = res.data
  } catch (e) {
    ERROR(`交互验证异常: ${e.message}`)
    return { ok: false, code: E.BINDING_CONDITION, msg: '交互验证服务不可用' }
  }

  switch (label) {
    case '可靠':
      if (!vi.bidirectional) {
        return { ok: false, code: E.BINDING_CONDITION, msg: '需要双向通信' }
      }
      if (vi.duration_seconds < 3600) {
        return { ok: false, code: E.BINDING_CONDITION, msg: '交互时长不足 1 小时' }
      }
      if (vi.total_messages < 5) {
        return { ok: false, code: E.BINDING_CONDITION, msg: '消息合计不足 5 条' }
      }
      break

    case '骚扰':
      if (!(vi.message_count_b_to_a > 0)) {
        return { ok: false, code: E.BINDING_CONDITION, msg: '必须收到过对方的消息才能打骚扰标签' }
      }
      break

    default: // 自由标签
      if (!(vi.total_messages > 0)) {
        return { ok: false, code: E.BINDING_CONDITION, msg: '需要有过通信记录' }
      }
      break
  }

  return { ok: true }
}

// ── 核心方法 ──

/**
 * 打标签 — tag
 */
exports.tag = async (params, ctx) => {
  const { target_openid, label, evidence, sig, public_key } = params

  if (!target_openid || !label || !sig || !public_key) {
    return { code: E.MISSING_FIELDS, msg: '缺少必填字段' }
  }
  if (!validateLabel(label)) {
    return { code: E.LABEL_TOO_LONG, msg: 'label 为空或超过 30 字符' }
  }

  // 验签
  if (!(await verifySig(params, public_key))) {
    return { code: E.SIG_INVALID, msg: '签名验证失败' }
  }

  // reverse-lookup: OpenID → UUID
  let fromUuid, toUuid
  try {
    const fromRes = await ctx.l0ReverseLookup(ctx.callerOpenid)
    if (fromRes.code !== 0) throw new Error('调用方 OpenID 无效')
    fromUuid = fromRes.data.real_agent_id

    const toRes = await ctx.l0ReverseLookup(target_openid)
    if (toRes.code !== 0) throw new Error('目标 OpenID 无效')
    toUuid = toRes.data.real_agent_id
  } catch (e) {
    ERROR(`reverse-lookup 失败: ${e.message}`)
    return { code: E.OPENID_INVALID, msg: 'OpenID 无效，无法反查' }
  }

  if (fromUuid === toUuid) {
    return { code: E.BINDING_CONDITION, msg: '不能给自己打标签' }
  }

  // 绑定条件验证
  const bindingCheck = await checkBindingConditions(ctx, fromUuid, toUuid, label, evidence)
  if (!bindingCheck.ok) {
    return { code: bindingCheck.code, msg: bindingCheck.msg }
  }

  // 7 天冷却：覆盖旧标签——同 (from, to) 对内只能保留一个标签
  // 如果 7 天内有不同 label 的旧标签，先删旧再写新
  const cutoff = new Date(Date.now() - COOLDOWN_DAYS * 24 * 3600 * 1000)
  await ReputationTag.deleteMany({
    from_uuid: fromUuid,
    to_uuid: toUuid,
    label: { $ne: label },
    created_at: { $gte: cutoff }
  })

  // 写入标签：同 (from_uuid, to_uuid, label) 覆盖
  await ReputationTag.findOneAndUpdate(
    { from_uuid: fromUuid, to_uuid: toUuid, label },
    {
      from_uuid: fromUuid,
      to_uuid: toUuid,
      label,
      evidence: evidence || null,
      created_at: new Date()
    },
    { upsert: true, new: true }
  )

  INFO(`标签已记录: ${fromUuid} -> ${toUuid} [${label}]`)
  return { code: E.OK, msg: '标签已记录' }
}

/**
 * 撤销标签 — untag
 */
exports.untag = async (params, ctx) => {
  const { target_openid, label, sig, public_key } = params

  if (!target_openid || !label || !sig || !public_key) {
    return { code: E.MISSING_FIELDS, msg: '缺少必填字段' }
  }

  if (!(await verifySig(params, public_key))) {
    return { code: E.SIG_INVALID, msg: '签名验证失败' }
  }

  let fromUuid, toUuid
  try {
    const fromRes = await ctx.l0ReverseLookup(ctx.callerOpenid)
    if (fromRes.code !== 0) throw new Error('调用方 OpenID 无效')
    fromUuid = fromRes.data.real_agent_id

    const toRes = await ctx.l0ReverseLookup(target_openid)
    if (toRes.code !== 0) throw new Error('目标 OpenID 无效')
    toUuid = toRes.data.real_agent_id
  } catch (e) {
    ERROR(`reverse-lookup 失败: ${e.message}`)
    return { code: E.OPENID_INVALID, msg: 'OpenID 无效，无法反查' }
  }

  const result = await ReputationTag.findOneAndDelete({
    from_uuid: fromUuid,
    to_uuid: toUuid,
    label
  })

  if (!result) {
    return { code: E.TAG_NOT_FOUND, msg: '未找到对应标签' }
  }

  INFO(`标签已撤销: ${fromUuid} -> ${toUuid} [${label}]`)
  return { code: E.OK, msg: '标签已撤销' }
}

/**
 * 记录客观事实 — record_fact
 * 由 L1 服务（如 Captain Lobster）或系统推送可验证的事实记录。
 * 事实不可篡改：只能追加，不能修改或删除。
 */
exports.recordFact = async (params, ctx) => {
  const { subject_openid, fact_type, fact_subtype, fact_data, proof, sig, public_key, client_fact_id } = params

  if (!subject_openid || !fact_type || !fact_subtype || !sig || !public_key) {
    return { code: E.MISSING_FIELDS, msg: '缺少必填字段' }
  }
  if (!VALID_FACT_TYPES.includes(fact_type)) {
    return { code: E.FACT_TYPE_INVALID, msg: `fact_type 无效，需为: ${VALID_FACT_TYPES.join(', ')}` }
  }

  if (!(await verifySig(params, public_key))) {
    return { code: E.SIG_INVALID, msg: '签名验证失败' }
  }

  // 反查记录者
  try {
    const callerRes = await ctx.l0ReverseLookup(ctx.callerOpenid)
    if (callerRes.code !== 0) throw new Error('调用方 OpenID 无效')
    const subjectRes = await ctx.l0ReverseLookup(subject_openid)
    if (subjectRes.code !== 0) throw new Error('目标 OpenID 无效')
  } catch (e) {
    ERROR(`reverse-lookup 失败: ${e.message}`)
    return { code: E.OPENID_INVALID, msg: 'OpenID 无效，无法反查' }
  }

  // 幂等保护：client_fact_id 存在且重复时，返回成功但不重复写入
  if (client_fact_id) {
    const existing = await ReputationFact.findOne({ client_fact_id }).lean()
    if (existing) {
      INFO(`事实已存在(幂等): ${fact_type}/${fact_subtype} → ${subject_openid}`)
      return { code: E.OK, msg: '事实已存在' }
    }
  }

  await ReputationFact.create({
    subject_openid,
    fact_type,
    fact_subtype,
    fact_data: fact_data || {},
    recorded_by: ctx.callerOpenid,
    recorded_at: new Date(),
    proof: proof || null,
    client_fact_id: client_fact_id || null
  })

  INFO(`事实已记录: ${fact_type}/${fact_subtype} → ${subject_openid}`)
  return { code: E.OK, msg: '事实已记录' }
}

/**
 * 查询声誉 — query_reputation
 * v2 返回 5 类事实模型（宪法模式）：
 *   identity, communication, evaluations, trade, reports, service
 * 同时保留旧字段 (core_tags, free_tags, total_sessions, age_days) 向后兼容。
 */
exports.queryReputation = async (params, ctx) => {
  const { openids } = params

  if (!openids || !Array.isArray(openids) || openids.length === 0) {
    return { code: E.MISSING_FIELDS, msg: '缺少 openids 字段' }
  }
  if (openids.length > 100) {
    return { code: E.OPENID_INVALID, msg: 'openids 超过单次查询上限（100）' }
  }

  // reverse-lookup: OpenID[] → UUID[]（并行）
  const uuidMap = {}
  try {
    const lookups = await Promise.all(
      openids.map(async (openid) => {
        try {
          const res = await ctx.l0ReverseLookup(openid)
          return { openid, uuid: res.code === 0 ? res.data?.real_agent_id : null }
        } catch {
          return { openid, uuid: null }
        }
      })
    )
    for (const { openid, uuid } of lookups) {
      if (uuid) uuidMap[openid] = uuid
    }
  } catch (e) {
    ERROR(`批量 reverse-lookup 失败: ${e.message}`)
    return { code: E.OPENID_INVALID, msg: 'OpenID 批量反查失败' }
  }

  const results = []

  for (const openid of openids) {
    const uuid = uuidMap[openid]
    if (!uuid) {
      results.push({ openid, error: 'OpenID 无效' })
      continue
    }

    // 聚合标签计数
    const tagCounts = await ReputationTag.aggregate([
      { $match: { to_uuid: uuid } },
      {
        $group: {
          _id: '$label',
          count: { $sum: 1 }
        }
      }
    ])

    const core_tags = {}
    const free_tags = {}

    for (const tc of tagCounts) {
      if (CORE_LABELS.includes(tc._id)) {
        core_tags[tc._id] = tc.count
      } else {
        free_tags[tc._id] = tc.count
      }
    }

    for (const cl of CORE_LABELS) {
      if (!(cl in core_tags)) {
        core_tags[cl] = 0
      }
    }

    // ── 聚合 ReputationFact（客观事实）──
    // TODO: 当 Agent 数量增长时，将 per-openid 的 N+1 查询批量化
    //   - ReputationTag.aggregate 可合并为一次 $facet
    //   - ReputationFact.find 可改用 $group 聚合而非逐条遍历
    //   - L0 API 调用可批量并发（当前已用 Promise.all）
    let tradeFacts = { contracts_total: 0, contracts_fulfilled: 0, contracts_broken: 0, total_volume: 0, recent_trades: [] }
    let reportFacts = { filed_against: [], filed_by_this_agent: 0 }
    let serviceFacts = { published_services: [], uptime_days: 0 }

    try {
      const facts = await ReputationFact.find({ subject_openid: openid })
        .sort({ recorded_at: -1 })
        .lean()

      for (const f of facts) {
        switch (f.fact_type) {
          case 'trade':
            if (f.fact_subtype === 'contract_fulfilled') tradeFacts.contracts_fulfilled++
            else if (f.fact_subtype === 'contract_broken') tradeFacts.contracts_broken++
            if (f.fact_data) {
              if (f.fact_data.volume) tradeFacts.total_volume += f.fact_data.volume
              tradeFacts.recent_trades.push({
                item: f.fact_data.item || 'unknown',
                amount: f.fact_data.amount || 0,
                timestamp: f.recorded_at?.toISOString?.() || f.recorded_at
              })
            }
            break
          case 'report':
            reportFacts.filed_against.push({
              type: f.fact_subtype,
              reporter: f.recorded_by,
              timestamp: f.recorded_at?.toISOString?.() || f.recorded_at,
              evidence: f.fact_data
            })
            break
          case 'service':
            if (f.fact_subtype === 'publish' && f.fact_data?.service_name) {
              serviceFacts.published_services.push(f.fact_data.service_name)
            }
            if (f.fact_subtype === 'heartbeat') serviceFacts.uptime_days++
            break
        }
      }
      tradeFacts.contracts_total = tradeFacts.contracts_fulfilled + tradeFacts.contracts_broken
      tradeFacts.recent_trades = tradeFacts.recent_trades.slice(0, 10)

      // 统计该 Agent 发出的举报数
      reportFacts.filed_by_this_agent = await ReputationFact.countDocuments({
        recorded_by: openid,
        fact_type: 'report'
      })
      reportFacts.filed_against = reportFacts.filed_against.slice(0, 20)
    } catch (e) {
      ERROR(`获取事实数据失败 (${openid}): ${e.message}`)
    }

    // ── 独立打标人数 ──
    let unique_taggers = 0
    try {
      const taggers = await ReputationTag.distinct('from_uuid', { to_uuid: uuid })
      unique_taggers = taggers.length
    } catch { /* 非关键数据 */ }

    // ── 最近标签 ──
    let recent_tags = []
    try {
      const recentEntries = await ReputationTag.find({ to_uuid: uuid })
        .sort({ created_at: -1 }).limit(5).lean()
      recent_tags = recentEntries.map(t => ({
        label: t.label,
        from_openid: t.from_uuid,
        applied_at: t.created_at?.toISOString?.() || t.created_at
      }))
    } catch { /* 非关键数据 */ }

    // ── Agent 基本数据（identity + communication）──
    let identity = { registered_at: null, days_active: 0, key_type: 'Ed25519' }
    let communication = { messages_sent: 0, messages_received: 0, unique_partners: 0, partners_30d: 0 }
    let total_sessions = 0
    let age_days = 0

    try {
      const [regInfo, commStats] = await Promise.all([
        ctx.l0RegistrationInfo(uuid).catch(e => { ERROR(`registration-info 不可用: ${e.message}`); return null }),
        ctx.l0CommunicationStats(uuid).catch(e => { ERROR(`communication-stats 不可用: ${e.message}`); return null })
      ])

      if (regInfo && regInfo.code === 0 && regInfo.data && regInfo.data.registered_at) {
        const registeredAt = new Date(regInfo.data.registered_at)
        identity.registered_at = regInfo.data.registered_at
        identity.days_active = Math.floor((Date.now() - registeredAt.getTime()) / (1000 * 3600 * 24))
        age_days = identity.days_active
      }

      if (commStats && commStats.code === 0 && commStats.data) {
        communication.unique_partners = commStats.data.unique_partners || 0
        communication.messages_sent = commStats.data.messages_sent || 0
        communication.messages_received = commStats.data.messages_received || 0
        communication.partners_30d = commStats.data.partners_30d || 0
        total_sessions = communication.unique_partners
      }
    } catch (e) {
      ERROR(`获取 Agent 基本数据失败 (${uuid}): ${e.message}`)
    }

    // ── 组装 evaluations（旧标签体系）──
    const evaluations = {
      tags: { ...core_tags, ...free_tags },
      recent_tags,
      unique_taggers
    }

    results.push({
      openid,
      // v1 fields (backward compat)
      total_sessions,
      age_days,
      core_tags,
      free_tags,
      // v2 facts (宪法模式)
      facts: {
        identity,
        communication,
        evaluations,
        trade: tradeFacts,
        reports: reportFacts,
        service: serviceFacts
      }
    })
  }

  return { code: E.OK, data: { results } }
}

// ── 支付见证 ──

const { PaymentClaim } = require('./models')

function generateClaimId() {
  return `pc_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

/**
 * 付款方声明支付 — claim_payment
 */
exports.claimPayment = async (params, ctx) => {
  const { payer_openid, payee_openid, amount, currency, chain, tx_hash, evidence, description, sig, public_key, claim_id } = params

  if (!payer_openid || !payee_openid || amount === undefined || !currency || !sig || !public_key) {
    return { code: E.MISSING_FIELDS, msg: '缺少必填字段 (payer_openid/payee_openid/amount/currency/sig/public_key)' }
  }
  if (typeof amount !== 'number' || amount <= 0) {
    return { code: E.MISSING_FIELDS, msg: 'amount 必须是正数' }
  }
  if (typeof currency !== 'string' || currency.length === 0 || currency.length > 20) {
    return { code: E.MISSING_FIELDS, msg: 'currency 无效' }
  }

  if (!(await verifySig(params, public_key))) {
    return { code: E.SIG_INVALID, msg: '签名验证失败' }
  }

  // 反查双方 UUID
  try {
    const fromRes = await ctx.l0ReverseLookup(ctx.callerOpenid)
    if (fromRes.code !== 0) return { code: E.OPENID_INVALID, msg: '付款方 OpenID 无效' }
    const toRes = await ctx.l0ReverseLookup(payee_openid)
    if (toRes.code !== 0) return { code: E.OPENID_INVALID, msg: '收款方 OpenID 无效' }
  } catch (e) {
    ERROR(`reverse-lookup 失败: ${e.message}`)
    return { code: E.OPENID_INVALID, msg: 'OpenID 反查失败' }
  }

  const id = claim_id || generateClaimId()

  try {
    await PaymentClaim.create({
      claim_id: id,
      payer_openid,
      payee_openid,
      amount,
      currency,
      chain: chain || null,
      tx_hash: tx_hash || null,
      evidence: evidence || null,
      description: description || null,
      status: 'pending',
      payer_sig: sig,
      payer_public_key: public_key,
      created_at: new Date()
    })
    INFO(`支付声明: ${payer_openid.slice(0,12)} → ${payee_openid.slice(0,12)} ${amount} ${currency} [${id}]`)
    return { code: E.OK, data: { claim_id: id, status: 'pending' } }
  } catch (e) {
    if (e.code === 11000) {
      return { code: E.OK, data: { claim_id: id, status: 'pending', msg: '声明已存在（幂等）' } }
    }
    ERROR(`claimPayment 失败: ${e.message}`)
    return { code: 500, msg: e.message }
  }
}

/**
 * 收款方确认/否认 — confirm_payment
 */
exports.confirmPayment = async (params, ctx) => {
  const { claim_id, agreed, dispute_reason, sig, public_key } = params

  if (!claim_id || agreed === undefined || !sig || !public_key) {
    return { code: E.MISSING_FIELDS, msg: '缺少必填字段 (claim_id/agreed/sig/public_key)' }
  }

  if (!(await verifySig(params, public_key))) {
    return { code: E.SIG_INVALID, msg: '签名验证失败' }
  }

  const claim = await PaymentClaim.findOne({ claim_id, deleted: { $ne: true } })
  if (!claim) return { code: E.FACT_TYPE_INVALID, msg: '支付声明不存在' }
  if (claim.status !== 'pending') {
    return { code: E.FACT_TYPE_INVALID, msg: `声明状态为 ${claim.status}，无法确认` }
  }

  // 反查确认方
  try {
    const confirmerRes = await ctx.l0ReverseLookup(ctx.callerOpenid)
    if (confirmerRes.code !== 0) return { code: E.OPENID_INVALID, msg: '确认方 OpenID 无效' }
  } catch (e) {
    ERROR(`reverse-lookup 失败: ${e.message}`)
    return { code: E.OPENID_INVALID, msg: 'OpenID 反查失败' }
  }

  claim.payee_sig = sig
  claim.payee_public_key = public_key
  claim.confirmed_at = new Date()

  if (agreed) {
    claim.status = 'confirmed'

    await ReputationFact.create({
      subject_openid: claim.payee_openid,
      fact_type: 'trade',
      fact_subtype: 'payment_confirmed',
      fact_data: {
        amount: claim.amount,
        currency: claim.currency,
        payer: claim.payer_openid,
        chain: claim.chain,
        tx_hash: claim.tx_hash,
        description: claim.description
      },
      recorded_by: claim.payer_openid,
      recorded_at: new Date(),
      client_fact_id: `payment_${claim.claim_id}`
    })

    INFO(`支付确认: ${claim.claim_id} ${claim.amount} ${claim.currency}`)
  } else {
    claim.status = 'disputed'
    claim.dispute_reason = dispute_reason || null

    await ReputationFact.create({
      subject_openid: claim.payee_openid,
      fact_type: 'trade',
      fact_subtype: 'payment_disputed',
      fact_data: {
        amount: claim.amount,
        currency: claim.currency,
        payer: claim.payer_openid,
        dispute_reason: dispute_reason || '收款方未确认收到付款'
      },
      recorded_by: claim.payer_openid,
      recorded_at: new Date(),
      client_fact_id: `payment_dispute_${claim.claim_id}`
    })

    INFO(`支付争议: ${claim.claim_id}`)
  }

  await claim.save()
  return {
    code: E.OK,
    data: { claim_id: claim.claim_id, status: claim.status, amount: claim.amount, currency: claim.currency }
  }
}

/**
 * 查询支付记录 — query_payments
 */
exports.queryPayments = async (params, ctx) => {
  const { openid, role, status, limit = 50, cursor } = params

  if (!openid) return { code: E.MISSING_FIELDS, msg: '缺少 openid' }

  const query = { deleted: { $ne: true } }
  if (role === 'payer') query.payer_openid = openid
  else if (role === 'payee') query.payee_openid = openid
  else query.$or = [{ payer_openid: openid }, { payee_openid: openid }]

  if (status) query.status = status
  if (cursor) {
    const c = parseInt(cursor, 10)
    if (!isNaN(c)) query.created_at = { $lt: new Date(c) }
  }

  const actualLimit = Math.min(Math.max(parseInt(limit) || 50, 1), 200)

  try {
    const claims = await PaymentClaim.find(query)
      .sort({ created_at: -1 })
      .limit(actualLimit + 1)
      .lean()

    const hasMore = claims.length > actualLimit
    if (hasMore) claims.pop()

    const nextCursor = hasMore && claims.length > 0
      ? String(new Date(claims[claims.length - 1].created_at).getTime())
      : null

    // 聚合统计
    const allClaims = await PaymentClaim.find({
      deleted: { $ne: true },
      $or: [{ payer_openid: openid }, { payee_openid: openid }]
    }).lean()

    const stats = { total: allClaims.length, confirmed: 0, disputed: 0, pending: 0, total_amount: 0 }
    for (const c of allClaims) {
      if (c.status === 'confirmed') { stats.confirmed++; stats.total_amount += c.amount }
      else if (c.status === 'disputed') stats.disputed++
      else if (c.status === 'pending') stats.pending++
    }

    return {
      code: E.OK,
      data: {
        claims: claims.map(c => ({
          claim_id: c.claim_id,
          payer_openid: c.payer_openid,
          payee_openid: c.payee_openid,
          amount: c.amount,
          currency: c.currency,
          chain: c.chain,
          tx_hash: c.tx_hash,
          description: c.description,
          status: c.status,
          dispute_reason: c.dispute_reason,
          created_at: c.created_at,
          confirmed_at: c.confirmed_at
        })),
        stats,
        next_cursor: nextCursor
      }
    }
  } catch (e) {
    ERROR(`queryPayments 失败: ${e.message}`)
    return { code: 500, msg: e.message }
  }
}

service.exportMe()

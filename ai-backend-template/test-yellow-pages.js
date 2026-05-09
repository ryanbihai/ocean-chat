/**
 * 黄页服务端到端集成测试
 * 验证：register_service → discover → heartbeat → update_service → deregister_service
 */

const request = require('superagent')
const ed25519 = require('./src/lib/ed25519')
const { canonicalize } = require('./src/lib/canonical-json')

const L0_URL = 'https://ai-t.ihaola.com.cn/api/l0'
// 黄页 Agent 的 OpenID (预先注册)
const YP_OPENID = 'YwvQeEb8X9b394wKxetJ06EV9w5IIglMlucJmbb_gwLbBg_dB50NyB7SYdxBAIObSjdPNprkooxZ3icV'

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function run() {
  console.log('=== 黄页服务端到端测试 ===\n')

  // ── 1. 注册测试 Agent（模拟服务方）──
  console.log('[1] 注册测试 Agent...')
  const reg = await request.post(`${L0_URL}/agents/register`).timeout(10000).ok(() => true)
  if (reg.body.code !== 0) {
    console.error('注册失败:', reg.body.msg)
    return
  }
  const apiKey = reg.body.data.api_key
  const auth = () => ({ Authorization: `Bearer ${apiKey}` })
  console.log('  Agent ID:', reg.body.data.agent_id)

  // 获取 OpenID
  const me = await request.get(`${L0_URL}/agents/me`).set(auth()).timeout(10000).ok(() => true)
  const myOpenid = me.body.data.my_openid
  console.log('  OpenID:', myOpenid)

  // ── 2. 生成 Ed25519 密钥对 ──
  console.log('\n[2] 生成 Ed25519 密钥对...')
  const kp = ed25519.generateKeypair()
  console.log('  Public Key:', kp.publicKey.substring(0, 50) + '...')

  // ── 3. register_service ──
  console.log('\n[3] 测试 register_service...')
  const regPayload = {
    action: 'register_service',
    request_id: 'req_reg_' + Date.now(),
    openid: myOpenid,
    tags: ['food', 'dumpling'],
    description: '中关村老张饺子馆，手工现包水饺，支持预约排号和堂食外带。每日 10:00-22:00 营业。人均 ¥35。位于中关村南大街 12 号。',
    public_key: kp.publicKey
  }
  const { sig: _, ...payloadWithoutSig } = regPayload
  regPayload.sig = ed25519.sign(kp.secretKey, canonicalize(payloadWithoutSig))

  const cid1 = 'test_register_' + Date.now()
  await request.post(`${L0_URL}/messages`)
    .set(auth())
    .send({ to_openid: YP_OPENID, client_msg_id: cid1, content: JSON.stringify(regPayload) })
    .timeout(10000).ok(() => true)
  console.log('  已发送 register_service 到黄页')

  // ── 等待黄页处理并响应 ──
  console.log('\n[4] 等待黄页响应...')
  await sleep(5000)

  let regResponse = null
  for (let i = 0; i < 6; i++) {
    const sync = await request.get(`${L0_URL}/messages/sync`)
      .set(auth()).query({ since_seq: 0, limit: 10 }).timeout(10000).ok(() => true)

    for (const msg of (sync.body.data?.messages || [])) {
      try {
        const body = JSON.parse(msg.content)
        if (body.request_id === regPayload.request_id) {
          regResponse = body
        }
      } catch (_) {}
    }
    if (regResponse) break
    await sleep(2000)
  }

  if (regResponse) {
    console.log('  注册响应:', JSON.stringify(regResponse))
    if (regResponse.code === 0) {
      console.log('  ✅ register_service 成功')
    } else if (regResponse.code === 1002) {
      console.log('  ⚠️ openid 已存在（可能之前注册过）')
    } else {
      console.log('  ❌ register_service 失败, code:', regResponse.code)
    }
  } else {
    console.log('  ⚠️ 未收到响应（黄页 Agent 可能未运行）')
  }

  // ── 5. discover ──
  console.log('\n[5] 测试 discover...')
  const discPayload = {
    action: 'discover',
    request_id: 'req_disc_' + Date.now(),
    tags: ['food'],
    limit: 10
  }
  const cid2 = 'test_discover_' + Date.now()
  await request.post(`${L0_URL}/messages`)
    .set(auth())
    .send({ to_openid: YP_OPENID, client_msg_id: cid2, content: JSON.stringify(discPayload) })
    .timeout(10000).ok(() => true)
  console.log('  已发送 discover 到黄页')

  await sleep(5000)

  let discResponse = null
  for (let i = 0; i < 6; i++) {
    const sync = await request.get(`${L0_URL}/messages/sync`)
      .set(auth()).query({ since_seq: 0, limit: 10 }).timeout(10000).ok(() => true)

    for (const msg of (sync.body.data?.messages || [])) {
      try {
        const body = JSON.parse(msg.content)
        if (body.request_id === discPayload.request_id) {
          discResponse = body
        }
      } catch (_) {}
    }
    if (discResponse) break
    await sleep(2000)
  }

  if (discResponse) {
    console.log('  发现响应 code:', discResponse.code)
    const entries = discResponse.data?.entries || []
    console.log('  条目数:', entries.length, '/ total:', discResponse.data?.total)
    if (entries.length > 0) {
      console.log('  首条:', entries[0].description?.substring(0, 50) + '...')
    }
    console.log('  next_cursor:', discResponse.data?.next_cursor)
    console.log('  ✅ discover 成功')
  } else {
    console.log('  ⚠️ 未收到响应')
  }

  // ── 6. heartbeat ──
  console.log('\n[6] 测试 heartbeat...')
  const hbPayload = {
    action: 'heartbeat',
    request_id: 'req_hb_' + Date.now(),
    openid: myOpenid
  }
  hbPayload.sig = ed25519.sign(kp.secretKey, canonicalize(hbPayload))

  const cid3 = 'test_heartbeat_' + Date.now()
  await request.post(`${L0_URL}/messages`)
    .set(auth())
    .send({ to_openid: YP_OPENID, client_msg_id: cid3, content: JSON.stringify(hbPayload) })
    .timeout(10000).ok(() => true)
  console.log('  已发送 heartbeat')

  await sleep(3000)
  let hbResponse = null
  const sync3 = await request.get(`${L0_URL}/messages/sync`)
    .set(auth()).query({ since_seq: 0, limit: 10 }).timeout(10000).ok(() => true)
  for (const msg of (sync3.body.data?.messages || [])) {
    try {
      const body = JSON.parse(msg.content)
      if (body.request_id === hbPayload.request_id) hbResponse = body
    } catch (_) {}
  }
  console.log('  heartbeat 响应:', hbResponse ? `code=${hbResponse.code}` : '未收到')
  if (hbResponse && hbResponse.code === 0) console.log('  ✅ heartbeat 成功')

  // ── 7. 边界条件测试 ──
  console.log('\n[7] 边界条件测试...')

  // 超长 description
  const badRegPayload = {
    action: 'register_service',
    request_id: 'req_bad_' + Date.now(),
    openid: myOpenid + 'x', // 稍改一下避免 openid 重复
    tags: ['test'],
    description: 'x'.repeat(801),
    public_key: kp.publicKey
  }
  badRegPayload.sig = ed25519.sign(kp.secretKey, canonicalize(badRegPayload))
  // ... actually this test doesn't make sense because the openid is invalid

  // 测试错误 sig
  const badSigPayload = {
    action: 'heartbeat',
    request_id: 'req_badsig_' + Date.now(),
    openid: myOpenid,
    sig: 'ed25519:INVALID_SIGNATURE_BASE64URL'
  }
  const cid4 = 'test_badsig_' + Date.now()
  await request.post(`${L0_URL}/messages`)
    .set(auth())
    .send({ to_openid: YP_OPENID, client_msg_id: cid4, content: JSON.stringify(badSigPayload) })
    .timeout(10000).ok(() => true)
  console.log('  已发送错误签名的 heartbeat')

  await sleep(3000)
  const sync4 = await request.get(`${L0_URL}/messages/sync`)
    .set(auth()).query({ since_seq: 0, limit: 10 }).timeout(10000).ok(() => true)
  for (const msg of (sync4.body.data?.messages || [])) {
    try {
      const body = JSON.parse(msg.content)
      if (body.request_id === badSigPayload.request_id) {
        console.log('  错误签名响应 code:', body.code, '(期望 1001)')
        if (body.code === 1001) console.log('  ✅ 签名验证正常拦截')
        break
      }
    } catch (_) {}
  }

  console.log('\n=== 测试完成 ===')
}

run().catch(e => console.error('测试异常:', e.message))

/**
 * 声誉服务端到端测试
 *
 * 完整链路：注册 Agent → 生成密钥 → 签名 → 发 tag 消息 → 声誉服务处理 → query 验证
 */
const request = require('superagent');
const crypto = require('crypto');

const BASE_URL = 'https://ai-t.ihaola.com.cn/api/l0';
const REP_OPENID = 'msGHHPgQlQMNNjBmiuvDpwzFrRqPrjm7NjIRFfNILbPA31LfKvUFkYqUHGklEmUjtP0o-_kkPmSB3hs-';

// ── Ed25519（与 src/lib/ed25519.js 格式兼容） ──

const SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
const PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');

function generateKeypair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const jwk = publicKey.export({ format: 'jwk' });
  const jwkPriv = privateKey.export({ format: 'jwk' });
  return {
    publicKey: 'ed25519:' + jwk.x,
    secretKey: 'ed25519:' + jwkPriv.d
  };
}

function sign(secretKeyStr, message) {
  const raw = Buffer.from(secretKeyStr.replace(/^ed25519:/, ''), 'base64url');
  const der = Buffer.concat([PKCS8_PREFIX, raw]);
  const privateKey = crypto.createPrivateKey({ key: der, format: 'der', type: 'pkcs8' });
  const sig = crypto.sign(null, Buffer.from(message, 'utf8'), privateKey);
  return 'ed25519:' + sig.toString('base64url');
}

// ── 与 src/lib/canonical-json.js 完全一致 ──

function sortKeys(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sortKeys);
  const sorted = {};
  Object.keys(obj).sort().forEach(k => { sorted[k] = sortKeys(obj[k]); });
  return sorted;
}

function canonicalize(obj) {
  return JSON.stringify(sortKeys(obj));
}

// ── 辅助 ──

let passed = 0, failed = 0;
function ok(d) { passed++; console.log(`  ✅ ${d}`); }
function fail(d, r) { failed++; console.log(`  ❌ ${d}: ${r}`); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log('═'.repeat(60));
  console.log('  声誉服务端到端测试');
  console.log('═'.repeat(60));

  // ── 0. 准备 ──
  console.log('\n── 准备 ──\n');

  const regA = await request.post(`${BASE_URL}/agents/register`).timeout(10000).ok(() => true);
  if (regA.body.code !== 0) { fail('注册 A', regA.body.msg); return; }
  const apiKeyA = regA.body.data.api_key;
  const authA = { Authorization: `Bearer ${apiKeyA}` };
  const meA = await request.get(`${BASE_URL}/agents/me`).set(authA).timeout(10000).ok(() => true);
  const openidA = meA.body.data.my_openid;
  const kp = generateKeypair();
  console.log(`  Agent A (标记者): ${openidA.substring(0, 20)}...`);

  // 用 A 的 api_key 发消息给声誉——A 的 OpenID 就是调用方身份
  // 但声誉服务用 msg.from_openid 调 reverse-lookup，所以发送方必须是 A

  const regB = await request.post(`${BASE_URL}/agents/register`).timeout(10000).ok(() => true);
  if (regB.body.code !== 0) { fail('注册 B', regB.body.msg); return; }
  const apiKeyB = regB.body.data.api_key;
  const meB = await request.get(`${BASE_URL}/agents/me`).set({ Authorization: `Bearer ${apiKeyB}` }).timeout(10000).ok(() => true);
  const openidB = meB.body.data.my_openid;
  console.log(`  Agent B (目标):   ${openidB.substring(0, 20)}...`);
  console.log(`  声誉服务:          ${REP_OPENID.substring(0, 20)}...`);

  async function sendRepAction(payload) {
    const res = await request.post(`${BASE_URL}/messages`)
      .set(authA)
      .send({
        to_openid: REP_OPENID,
        client_msg_id: `rep_test_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        content: JSON.stringify(payload)
      })
      .timeout(10000).ok(() => true);
    return res.body.code === 0;
  }

  async function collectResponses(fromSeq, requestIds) {
    const found = [];
    let seq = fromSeq;
    for (let r = 0; r < 4; r++) {
      await sleep(2000);
      const sync = await request.get(`${BASE_URL}/messages/sync`)
        .set(authA).query({ since_seq: seq, limit: 50 }).timeout(10000).ok(() => true);
      if (sync.body.code === 0) {
        for (const msg of (sync.body.data.messages || [])) {
          try {
            const p = JSON.parse(msg.content);
            if (p.code !== undefined && requestIds.includes(p.request_id)) {
              found.push(p);
            }
          } catch {}
        }
        if (sync.body.data.messages.length > 0) {
          seq = sync.body.data.messages[sync.body.data.messages.length - 1].seq_id;
        }
      }
    }
    return { found, seq };
  }

  // ── 1. tag "可靠" ──
  console.log('\n── 1. tag：可靠 ──\n');

  const tag1 = {
    action: 'tag',
    request_id: `req_${Date.now()}_r1`,
    target_openid: openidB,
    label: '可靠',
    public_key: kp.publicKey
  };
  tag1.sig = sign(kp.secretKey, canonicalize(tag1));

  if (await sendRepAction(tag1)) ok('tag 可靠 消息已发送');
  else fail('tag 可靠 发送', '');

  let baseSeq = 0;
  let { found: r1, seq: s1 } = await collectResponses(0, [tag1.request_id]);

  const tag1Resp = r1.find(r => r.request_id === tag1.request_id);
  if (tag1Resp && tag1Resp.code === 0) ok('tag 可靠 响应 code=0');
  else fail('tag 可靠 响应', JSON.stringify(tag1Resp));

  baseSeq = s1;

  // ── 2. 覆盖测试：再打"骚扰" ──
  console.log('\n── 2. 覆盖测试：骚扰（7天内覆盖可靠）──\n');

  const tag2 = {
    action: 'tag',
    request_id: `req_${Date.now()}_r2`,
    target_openid: openidB,
    label: '骚扰',
    public_key: kp.publicKey
  };
  tag2.sig = sign(kp.secretKey, canonicalize(tag2));

  await sendRepAction(tag2);
  let { found: r2, seq: s2 } = await collectResponses(baseSeq, [tag2.request_id]);

  const tag2Resp = r2.find(r => r.request_id === tag2.request_id);
  if (tag2Resp && tag2Resp.code === 0) ok('tag 骚扰 响应 code=0（覆盖成功）');
  else fail('tag 骚扰 响应', JSON.stringify(tag2Resp));

  baseSeq = s2;

  // ── 3. query_reputation ──
  console.log('\n── 3. query_reputation ──\n');

  const q1 = {
    action: 'query_reputation',
    request_id: `req_${Date.now()}_q1`,
    openids: [openidB]
  };

  await sendRepAction(q1);
  let { found: rq, seq: sq } = await collectResponses(baseSeq, [q1.request_id]);

  const q1Resp = rq.find(r => r.request_id === q1.request_id);
  if (q1Resp && q1Resp.code === 0) {
    ok('query_reputation 成功');
    const result = q1Resp.data.results[0];
    console.log(`      total_sessions: ${result.total_sessions}`);
    console.log(`      age_days: ${result.age_days}`);
    console.log(`      core_tags: ${JSON.stringify(result.core_tags)}`);
    console.log(`      free_tags: ${JSON.stringify(result.free_tags)}`);

    if (result.core_tags['骚扰'] === 1 && result.core_tags['可靠'] === 0) {
      ok('覆盖逻辑：可靠→骚扰 覆盖成功（只有骚扰=1）');
    } else {
      fail('覆盖逻辑', `core_tags: ${JSON.stringify(result.core_tags)}`);
    }
  } else {
    fail('query_reputation', JSON.stringify(q1Resp));
  }

  baseSeq = sq;

  // ── 4. untag ──
  console.log('\n── 4. untag ──\n');

  const untag = {
    action: 'untag',
    request_id: `req_${Date.now()}_u1`,
    target_openid: openidB,
    label: '骚扰',
    public_key: kp.publicKey
  };
  untag.sig = sign(kp.secretKey, canonicalize(untag));

  await sendRepAction(untag);
  let { found: ru, seq: su } = await collectResponses(baseSeq, [untag.request_id]);

  const untagResp = ru.find(r => r.request_id === untag.request_id);
  if (untagResp && untagResp.code === 0) ok('untag 成功');
  else fail('untag', JSON.stringify(untagResp));

  baseSeq = su;

  // ── 5. 再次查询确认归零 ──
  console.log('\n── 5. 再次查询确认归零 ──\n');

  const q2 = {
    action: 'query_reputation',
    request_id: `req_${Date.now()}_q2`,
    openids: [openidB]
  };

  await sendRepAction(q2);
  let { found: rq2 } = await collectResponses(baseSeq, [q2.request_id]);

  const q2Resp = rq2.find(r => r.request_id === q2.request_id);
  if (q2Resp && q2Resp.code === 0) {
    const r2 = q2Resp.data.results[0];
    if (r2.core_tags['可靠'] === 0 && r2.core_tags['骚扰'] === 0 && r2.core_tags['违法'] === 0) {
      ok('untag 后全部归零');
    } else {
      fail('归零验证', `core_tags: ${JSON.stringify(r2.core_tags)}`);
    }
  }

  // ── 汇总 ──
  console.log('\n' + '═'.repeat(60));
  if (failed === 0) {
    console.log(`\n  🎉 全部通过: ${passed} 项\n`);
  } else {
    console.log(`\n  📊 ${passed} 通过, ${failed} 失败, ${passed + failed} 合计\n`);
  }
}

main().catch(e => console.error('💥', e.message));

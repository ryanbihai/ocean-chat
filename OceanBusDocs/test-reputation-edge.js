/**
 * 声誉服务边界场景测试
 */
const request = require('superagent');
const crypto = require('crypto');

const BASE_URL = 'https://ai-t.ihaola.com.cn/api/l0';
const REP_OPENID = 'msGHHPgQlQMNNjBmiuvDpwzFrRqPrjm7NjIRFfNILbPA31LfKvUFkYqUHGklEmUjtP0o-_kkPmSB3hs-';

const SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
const PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');

function generateKeypair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  return {
    publicKey: 'ed25519:' + publicKey.export({ format: 'jwk' }).x,
    secretKey: 'ed25519:' + privateKey.export({ format: 'jwk' }).d
  };
}

function sign(secretKeyStr, message) {
  const raw = Buffer.from(secretKeyStr.replace(/^ed25519:/, ''), 'base64url');
  const privateKey = crypto.createPrivateKey({ key: Buffer.concat([PKCS8_PREFIX, raw]), format: 'der', type: 'pkcs8' });
  return 'ed25519:' + crypto.sign(null, Buffer.from(message, 'utf8'), privateKey).toString('base64url');
}

function sortKeys(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sortKeys);
  const sorted = {};
  Object.keys(obj).sort().forEach(k => { sorted[k] = sortKeys(obj[k]); });
  return sorted;
}
function canonicalize(obj) { return JSON.stringify(sortKeys(obj)); }

let passed = 0, failed = 0;
function ok(d) { passed++; console.log(`  ✅ ${d}`); }
function fail(d, r) { failed++; console.log(`  ❌ ${d}: ${r}`); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log('═'.repeat(56));
  console.log('  声誉服务边界场景测试');
  console.log('═'.repeat(56));

  // 准备
  const reg = await request.post(`${BASE_URL}/agents/register`).timeout(10000).ok(() => true);
  const apiKey = reg.body.data.api_key;
  const auth = { Authorization: `Bearer ${apiKey}` };
  const me = await request.get(`${BASE_URL}/agents/me`).set(auth).timeout(10000).ok(() => true);
  const myOpenid = me.body.data.my_openid;
  const kp = generateKeypair();
  const wrongKp = generateKeypair();

  async function sendRep(payload) {
    await request.post(`${BASE_URL}/messages`).set(auth).send({
      to_openid: REP_OPENID,
      client_msg_id: `edge_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      content: JSON.stringify(payload)
    }).timeout(10000).ok(() => true);
  }

  async function collectResponses(fromSeq, requestIds) {
    const found = [];
    let seq = fromSeq;
    for (let r = 0; r < 3; r++) {
      await sleep(2000);
      const sync = await request.get(`${BASE_URL}/messages/sync`)
        .set(auth).query({ since_seq: seq, limit: 30 }).timeout(10000).ok(() => true);
      if (sync.body.code === 0) {
        for (const msg of (sync.body.data.messages || [])) {
          try { const p = JSON.parse(msg.content); if (p.code !== undefined && requestIds.includes(p.request_id)) found.push(p); } catch {}
        }
        if (sync.body.data.messages.length > 0) seq = sync.body.data.messages[sync.body.data.messages.length - 1].seq_id;
      }
    }
    return { found, seq };
  }

  // ── 1. 错误签名应被拒绝 ──
  console.log('\n── 1. 错误签名 ──');
  const badSig = {
    action: 'tag', request_id: `req_${Date.now()}_bs`,
    target_openid: myOpenid, label: '可靠', public_key: kp.publicKey
  };
  badSig.sig = sign(wrongKp.secretKey, canonicalize(badSig)); // 用错私钥

  await sendRep(badSig);
  let seq = 0;
  let { found } = await collectResponses(0, [badSig.request_id]);
  const badResp = found.find(r => r.request_id === badSig.request_id);
  if (badResp && badResp.code === 1001) ok('错误签名 → code=1001');
  else fail('错误签名', JSON.stringify(badResp));

  // ── 2. 缺字段应被拒绝 ──
  console.log('\n── 2. 缺少必填字段 ──');

  const missingField = {
    action: 'tag', request_id: `req_${Date.now()}_mf`,
    target_openid: myOpenid, label: '可靠'
    // 无 public_key, 无 sig
  };
  await sendRep(missingField);
  await sleep(4000);
  const sync = await request.get(`${BASE_URL}/messages/sync`).set(auth).query({ since_seq: 0, limit: 50 }).timeout(10000).ok(() => true);
  let mfResp;
  if (sync.body.code === 0) {
    for (const msg of (sync.body.data.messages || [])) {
      try { const p = JSON.parse(msg.content); if (p.request_id === missingField.request_id) mfResp = p; } catch {}
    }
  }
  if (mfResp && mfResp.code === 1003) ok('缺字段 → code=1003');
  else fail('缺字段', JSON.stringify(mfResp));

  // ── 3. 标签超长 ──
  console.log('\n── 3. 标签超过 30 字符 ──');

  const longLabel = {
    action: 'tag', request_id: `req_${Date.now()}_ll`,
    target_openid: myOpenid, label: 'x'.repeat(31), public_key: kp.publicKey
  };
  longLabel.sig = sign(kp.secretKey, canonicalize(longLabel));

  await sendRep(longLabel);
  await sleep(4000);
  const sync2 = await request.get(`${BASE_URL}/messages/sync`).set(auth).query({ since_seq: 0, limit: 50 }).timeout(10000).ok(() => true);
  let llResp;
  if (sync2.body.code === 0) {
    for (const msg of (sync2.body.data.messages || [])) {
      try { const p = JSON.parse(msg.content); if (p.request_id === longLabel.request_id) llResp = p; } catch {}
    }
  }
  if (llResp && llResp.code === 1009) ok('超长标签 → code=1009');
  else fail('超长标签', JSON.stringify(llResp));

  // ── 4. 自标禁止 ──
  console.log('\n── 4. 给自己打标签 ──');

  const selfTag = {
    action: 'tag', request_id: `req_${Date.now()}_st`,
    target_openid: myOpenid, label: '可靠', public_key: kp.publicKey
  };
  selfTag.sig = sign(kp.secretKey, canonicalize(selfTag));

  await sendRep(selfTag);
  await sleep(4000);
  const sync3 = await request.get(`${BASE_URL}/messages/sync`).set(auth).query({ since_seq: 0, limit: 50 }).timeout(10000).ok(() => true);
  let stResp;
  if (sync3.body.code === 0) {
    for (const msg of (sync3.body.data.messages || [])) {
      try { const p = JSON.parse(msg.content); if (p.request_id === selfTag.request_id) stResp = p; } catch {}
    }
  }
  if (stResp && stResp.code === 1011) ok('自标禁止 → code=1011');
  else fail('自标禁止', JSON.stringify(stResp));

  // ── 5. query 无效 OpenID ──
  console.log('\n── 5. 查询不存在的 OpenID ──');

  const qBad = {
    action: 'query_reputation', request_id: `req_${Date.now()}_qb`,
    openids: ['this_is_not_a_valid_openid']
  };
  await sendRep(qBad);
  await sleep(4000);
  const sync4 = await request.get(`${BASE_URL}/messages/sync`).set(auth).query({ since_seq: 0, limit: 50 }).timeout(10000).ok(() => true);
  let qbResp;
  if (sync4.body.code === 0) {
    for (const msg of (sync4.body.data.messages || [])) {
      try { const p = JSON.parse(msg.content); if (p.request_id === qBad.request_id) qbResp = p; } catch {}
    }
  }
  if (qbResp && qbResp.code === 0) {
    // 无效 OpenID 应该在 results 中标记 error，而非整体失败
    const r = qbResp.data.results[0];
    if (r.error) ok(`无效 OpenID → 返回 error: "${r.error}"`);
    else fail('无效 OpenID', '应返回 error 字段');
  } else {
    fail('无效 OpenID 查询', JSON.stringify(qbResp));
  }

  // ── 6. 自由标签 ──
  console.log('\n── 6. 自由标签 ──');

  // 先注册另一个 Agent 作为目标
  const regB = await request.post(`${BASE_URL}/agents/register`).timeout(10000).ok(() => true);
  const apiKeyB = regB.body.data.api_key;
  const meB = await request.get(`${BASE_URL}/agents/me`).set({ Authorization: `Bearer ${apiKeyB}` }).timeout(10000).ok(() => true);
  const openidB = meB.body.data.my_openid;

  const freeTag = {
    action: 'tag', request_id: `req_${Date.now()}_ft`,
    target_openid: openidB, label: '回复快', public_key: kp.publicKey
  };
  freeTag.sig = sign(kp.secretKey, canonicalize(freeTag));

  await sendRep(freeTag);
  await sleep(4000);
  const sync5 = await request.get(`${BASE_URL}/messages/sync`).set(auth).query({ since_seq: 0, limit: 50 }).timeout(10000).ok(() => true);
  let ftResp;
  if (sync5.body.code === 0) {
    for (const msg of (sync5.body.data.messages || [])) {
      try { const p = JSON.parse(msg.content); if (p.request_id === freeTag.request_id) ftResp = p; } catch {}
    }
  }
  if (ftResp && ftResp.code === 0) ok('自由标签 → code=0');
  else fail('自由标签', JSON.stringify(ftResp));

  // 查询自由标签
  const qFree = { action: 'query_reputation', request_id: `req_${Date.now()}_qf`, openids: [openidB] };
  await sendRep(qFree);
  await sleep(4000);
  const sync6 = await request.get(`${BASE_URL}/messages/sync`).set(auth).query({ since_seq: 0, limit: 50 }).timeout(10000).ok(() => true);
  let qfResp;
  if (sync6.body.code === 0) {
    for (const msg of (sync6.body.data.messages || [])) {
      try { const p = JSON.parse(msg.content); if (p.request_id === qFree.request_id) qfResp = p; } catch {}
    }
  }
  if (qfResp && qfResp.code === 0) {
    const r = qfResp.data.results[0];
    if (r.free_tags['回复快'] === 1) ok('query 显示自由标签 "回复快"=1');
    else fail('自由标签查询', `free_tags: ${JSON.stringify(r.free_tags)}`);
  }

  // 清理
  const untagFree = {
    action: 'untag', request_id: `req_${Date.now()}_uf`,
    target_openid: openidB, label: '回复快', public_key: kp.publicKey
  };
  untagFree.sig = sign(kp.secretKey, canonicalize(untagFree));
  await sendRep(untagFree);
  await sleep(3000);

  // ── 7. 违法标签（带证据） ──
  console.log('\n── 7. 违法标签（带证据） ──');

  const illegalTag = {
    action: 'tag', request_id: `req_${Date.now()}_il`,
    target_openid: openidB, label: '违法', public_key: kp.publicKey,
    evidence: { core: { seq_id: 100, content: 'test content', sender_sig: 'ed25519:test' },
                 context: [{ seq_id: 98, content: 'ctx', sender_sig: 'test' }] }
  };
  illegalTag.sig = sign(kp.secretKey, canonicalize(illegalTag));

  await sendRep(illegalTag);
  await sleep(4000);
  const sync7 = await request.get(`${BASE_URL}/messages/sync`).set(auth).query({ since_seq: 0, limit: 50 }).timeout(10000).ok(() => true);
  let ilResp;
  if (sync7.body.code === 0) {
    for (const msg of (sync7.body.data.messages || [])) {
      try { const p = JSON.parse(msg.content); if (p.request_id === illegalTag.request_id) ilResp = p; } catch {}
    }
  }
  if (ilResp && ilResp.code === 0) ok('违法标签（带证据）→ code=0');
  else fail('违法标签', JSON.stringify(ilResp));

  // 清理
  const untagIllegal = {
    action: 'untag', request_id: `req_${Date.now()}_ui`,
    target_openid: openidB, label: '违法', public_key: kp.publicKey
  };
  untagIllegal.sig = sign(kp.secretKey, canonicalize(untagIllegal));
  await sendRep(untagIllegal);
  await sleep(3000);

  // ── 汇总 ──
  console.log('\n' + '═'.repeat(56));
  if (failed === 0) console.log(`\n  🎉 全部通过: ${passed} 项\n`);
  else console.log(`\n  📊 ${passed} 通过, ${failed} 失败\n`);
}

main().catch(e => console.error('💥', e.message));

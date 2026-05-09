/**
 * L0 内部接口探测脚本
 *
 * 验证 §5.2 - §5.5 的部署状态。
 * 用法: node probe-l0-internal-apis.js
 */

const request = require('superagent');

const BASE_URL = process.env.BASE_URL || 'https://ai-t.ihaola.com.cn/api/l0';

async function main() {
  console.log('═'.repeat(64));
  console.log('  L0 内部接口探测');
  console.log(`  Base URL: ${BASE_URL}`);
  console.log('═'.repeat(64));

  // ── 0. 准备：注册两个 Agent ──
  console.log('\n── 准备：注册 Agent ──');

  let apiKeyA, apiKeyB, openidA, openidB, agentIdA, agentIdB;

  // Agent A
  const regA = await request.post(`${BASE_URL}/agents/register`).timeout(10000).ok(() => true);
  if (regA.body.code !== 0) { console.log(`❌ 注册 Agent A 失败: ${regA.body.msg}`); return; }
  apiKeyA = regA.body.data.api_key;
  agentIdA = regA.body.data.agent_id;
  console.log(`  Agent A: ${agentIdA.substring(0, 12)}...`);

  const authA = () => ({ Authorization: `Bearer ${apiKeyA}` });
  const meA = await request.get(`${BASE_URL}/agents/me`).set(authA()).timeout(10000).ok(() => true);
  openidA = meA.body.data.my_openid;
  console.log(`  OpenID A: ${openidA.substring(0, 32)}...`);

  // Agent B
  const regB = await request.post(`${BASE_URL}/agents/register`).timeout(10000).ok(() => true);
  if (regB.body.code !== 0) { console.log(`❌ 注册 Agent B 失败: ${regB.body.msg}`); return; }
  apiKeyB = regB.body.data.api_key;
  agentIdB = regB.body.data.agent_id;
  console.log(`  Agent B: ${agentIdB.substring(0, 12)}...`);

  const authB = () => ({ Authorization: `Bearer ${apiKeyB}` });
  const meB = await request.get(`${BASE_URL}/agents/me`).set(authB()).timeout(10000).ok(() => true);
  openidB = meB.body.data.my_openid;
  console.log(`  OpenID B: ${openidB.substring(0, 32)}...`);

  // Agent A → Agent B 发几条消息（让 verify-interaction 有数据可查）
  console.log('\n  发送测试消息 (A ↔ B)...');
  for (let i = 0; i < 3; i++) {
    await request.post(`${BASE_URL}/messages`)
      .set(authA())
      .send({ to_openid: openidB, client_msg_id: `probe_a2b_${i}_${Date.now()}`, content: `探针消息 A→B #${i}` })
      .timeout(10000).ok(() => true);
    await request.post(`${BASE_URL}/messages`)
      .set(authB())
      .send({ to_openid: openidA, client_msg_id: `probe_b2a_${i}_${Date.now()}`, content: `探针消息 B→A #${i}` })
      .timeout(10000).ok(() => true);
  }
  console.log('  ✅ 6 条消息已发送（双向各 3 条）');

  // 等待消息投递
  await new Promise(r => setTimeout(r, 2000));

  // ── 1. §5.1 reverse-lookup（已验证的基准） ──
  console.log('\n── §5.1 GET /internal/reverse-lookup ──');
  await probe('reverse-lookup', async () => {
    const res = await request.get(`${BASE_URL}/internal/reverse-lookup`)
      .set(authA()).query({ openid: openidB }).timeout(10000).ok(() => true);
    return { code: res.body.code, has_real_agent_id: !!res.body.data?.real_agent_id };
  }, { code: 0, has_real_agent_id: true });

  // ── 2. §5.2 registration-info ──
  console.log('\n── §5.2 GET /internal/registration-info ──');
  await probe('registration-info', async () => {
    const res = await request.get(`${BASE_URL}/internal/registration-info`)
      .set(authA()).query({ agent_id: agentIdA }).timeout(10000).ok(() => true);
    return {
      http_status: res.status,
      code: res.body.code,
      has_registered_at: !!res.body.data?.registered_at,
      registered_at: res.body.data?.registered_at
    };
  }, null);

  // ── 3. §5.3 communication-stats ──
  console.log('\n── §5.3 GET /internal/communication-stats ──');
  await probe('communication-stats', async () => {
    const res = await request.get(`${BASE_URL}/internal/communication-stats`)
      .set(authA()).query({ agent_id: agentIdA }).timeout(10000).ok(() => true);
    return {
      http_status: res.status,
      code: res.body.code,
      unique_partners: res.body.data?.unique_partners
    };
  }, null);

  // ── 4. §5.4 verify-interaction ──
  console.log('\n── §5.4 POST /internal/verify-interaction ──');
  await probe('verify-interaction (A↔B, 已通信)', async () => {
    const res = await request.post(`${BASE_URL}/internal/verify-interaction`)
      .set(authA())
      .send({ agent_id_a: agentIdA, agent_id_b: agentIdB })
      .timeout(10000).ok(() => true);
    return {
      http_status: res.status,
      code: res.body.code,
      bidirectional: res.body.data?.bidirectional,
      total_messages: res.body.data?.total_messages,
      duration_seconds: res.body.data?.duration_seconds,
      msg_b_to_a: res.body.data?.message_count_b_to_a
    };
  }, null);

  // 也要测从未通信的情况
  const regC = await request.post(`${BASE_URL}/agents/register`).timeout(10000).ok(() => true);
  const agentIdC = regC.body.data.agent_id;
  await probe('verify-interaction (A↔C, 从未通信)', async () => {
    const res = await request.post(`${BASE_URL}/internal/verify-interaction`)
      .set(authA())
      .send({ agent_id_a: agentIdA, agent_id_b: agentIdC })
      .timeout(10000).ok(() => true);
    return {
      http_status: res.status,
      code: res.body.code,
      bidirectional: res.body.data?.bidirectional,
      total_messages: res.body.data?.total_messages
    };
  }, null);

  // ── 5. §5.5 message-context ──
  console.log('\n── §5.5 GET /internal/message-context ──');
  await probe('message-context', async () => {
    const res = await request.get(`${BASE_URL}/internal/message-context`)
      .set(authA()).query({ seq_id: 1 }).timeout(10000).ok(() => true);
    return { http_status: res.status, code: res.body.code };
  }, null);

  // ── 汇总 ──
  console.log('\n' + '═'.repeat(64));
  const available = results.filter(r => r.available);
  const unavailable = results.filter(r => !r.available);

  console.log(`\n  结果汇总:`);
  console.log(`  ✅ 可用 (${available.length}): ${available.map(r => r.name).join(', ') || '(无)'}`);
  console.log(`  ❌ 不可用 (${unavailable.length}): ${unavailable.map(r => r.name).join(', ') || '(无)'}`);

  if (available.length === 5) {
    console.log('\n  🎉 全部 5 个内部接口均已部署！声誉服务 MVP 可完整实现。');
  } else if (unavailable.length > 0) {
    console.log(`\n  ⚠️  ${unavailable.length} 个接口未部署。声誉服务需调整：`);
    if (unavailable.find(r => r.name === 'verify-interaction')) {
      console.log('     - verify-interaction 不可用 → tag 的绑定条件验证需在声誉服务内自行实现');
    }
    if (unavailable.find(r => r.name === 'registration-info')) {
      console.log('     - registration-info 不可用 → query_reputation 返回 age_days=0（已优雅降级）');
    }
    if (unavailable.find(r => r.name === 'communication-stats')) {
      console.log('     - communication-stats 不可用 → query_reputation 返回 total_sessions=0（已优雅降级）');
    }
  }
  console.log();
}

// ── 探测辅助 ──

const results = [];

async function probe(name, fn, expected) {
  try {
    const actual = await fn();
    const httpOk = actual.http_status === 200 || actual.http_status === undefined;
    const available = httpOk && actual.code !== undefined;

    results.push({ name, available });

    if (available && actual.code === 0) {
      console.log(`  ✅ ${name} — code=0, 数据: ${JSON.stringify(actual)}`);
    } else if (available && actual.code !== 0) {
      console.log(`  ⚠️  ${name} — 端点存在但返回 code=${actual.code}: ${JSON.stringify(actual)}`);
      // 端点存在就算可用——返回错误只是因为没有数据
      results[results.length - 1].available = true;
    } else {
      console.log(`  ❌ ${name} — HTTP ${actual.http_status || '?'}，端点不存在或不可访问`);
      results[results.length - 1].available = false;
    }
  } catch (e) {
    const status = e.response?.status || e.status || '?';
    results.push({ name, available: false });
    if (status === 404 || status === 403) {
      console.log(`  ❌ ${name} — HTTP ${status}，未部署`);
    } else {
      console.log(`  ❌ ${name} — ${e.message}`);
    }
  }
}

main().catch(e => {
  console.error('💥 探测脚本异常:', e.message);
  process.exit(1);
});

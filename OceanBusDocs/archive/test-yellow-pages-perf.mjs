/**
 * OceanBus 黄页 — 效果 / 效率 / 并发 综合验证
 *
 * 用法: node test-yellow-pages-perf.mjs
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const { createOceanBus } = require('./dist/index.js');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const P = { passed: 0, failed: 0 };
function ok(d)  { P.passed++; console.log(`  ✅ ${d}`); }
function err(d,r) { P.failed++; console.log(`  ❌ ${d}: ${r}`); }
function hr(t) { console.log(`\n${'─'.repeat(60)}\n  ${t}\n${'─'.repeat(60)}`); }

// ── 工具 ──

function percentile(arr, p) {
  const s = [...arr].sort((a,b) => a-b);
  return s[Math.floor(s.length * p / 100)];
}

async function timeIt(label, fn) {
  const start = performance.now();
  const result = await fn();
  const ms = +(performance.now() - start).toFixed(1);
  return { ...result, _ms: ms };
}

async function retry(fn, times = 8, intervalMs = 2000) {
  for (let i = 0; i < times; i++) {
    const r = await fn();
    if (r) return r;
    await sleep(intervalMs);
  }
  return null;
}

// ═══════════════════════════════════════════════════════════
async function main() {
  console.log('\n🔬 OceanBus 黄页 — 完整验证：效果 / 效率 / 并发');
  console.log('═'.repeat(60));

  // ────────────────────────────────────────────────
  // PART 0: 初始化 + 注册
  // ────────────────────────────────────────────────
  hr('Part 0: 初始化测试环境');

  const ob = await createOceanBus();
  await ob.register();
  const myOpenid = await ob.getOpenId();
  const keypair = await ob.crypto.generateKeypair();
  const pubKey = ob.crypto.keypairToBase64url(keypair).publicKey;
  const signer = async (p) => ob.crypto.sign(keypair, p);

  console.log(`  agent: ${(await ob.whoami()).agent_id.substring(0,16)}...`);

  // 清理可能存在的旧条目
  try { await ob.l1.yellowPages.deregisterService(myOpenid, signer); await sleep(2000); } catch {}

  // ═══════════════════════════════════════════════════════
  // PART 1: 效果 — 功能正确性（精简回归）
  // ═══════════════════════════════════════════════════════
  hr('Part 1: 效果验证 — 功能正确性回归');

  // register
  const reg = await ob.l1.yellowPages.registerService(
    myOpenid, ['perf', 'test'], 'Performance & concurrency test service.', pubKey, signer
  );
  reg.code === 0 ? ok('registerService') : err('registerService', `code=${reg.code}`);

  // discover
  const disc = await ob.l1.yellowPages.discover(['perf'], 10);
  disc.data?.entries?.find(e => e.openid === myOpenid)
    ? ok('discover tag filter')
    : err('discover tag filter', 'not found');
  disc.data?.total >= 1
    ? ok('discover total count')
    : err('discover total', disc.data?.total);

  // heartbeat
  const hb = await ob.l1.yellowPages.heartbeat(myOpenid, signer);
  hb.code === 0 ? ok('heartbeat') : err('heartbeat', `code=${hb.code}`);

  // update
  const upd = await ob.l1.yellowPages.updateService(myOpenid, signer, ['perf', 'updated']);
  upd.code === 0 ? ok('updateService') : err('updateService', `code=${upd.code}`);

  // deregister (register back after)
  const dereg = await ob.l1.yellowPages.deregisterService(myOpenid, signer);
  dereg.code === 0 ? ok('deregisterService') : err('deregisterService', `code=${dereg.code}`);
  await sleep(1500);

  // re-register
  const reg2 = await ob.l1.yellowPages.registerService(
    myOpenid, ['perf', 'test'], 'Re-registered for concurrency tests.', pubKey, signer
  );
  reg2.code === 0 ? ok('re-register after deregister') : err('re-register', `code=${reg2.code}`);

  // 错误码覆盖
  const dup = await ob.l1.yellowPages.registerService(myOpenid, ['x'], 'dup test', pubKey, signer);
  dup.code === 1002 ? ok('duplicate openid → 1002') : err('duplicate openid', `expected 1002, got ${dup.code}`);

  const wrongKp = await ob.crypto.generateKeypair();
  const wrongPub = ob.crypto.keypairToBase64url(wrongKp).publicKey;
  const wrongSigner = async (p) => ob.crypto.sign(wrongKp, p);
  const badSig = await ob.l1.yellowPages.heartbeat(myOpenid, wrongSigner);
  badSig.code === 1001 ? ok('wrong sig heartbeat → 1001') : err('wrong sig', `expected 1001, got ${badSig.code}`);

  const fakeSigner = async () => `ed25519:${'A'.repeat(86)}`;
  const notFound = await ob.l1.yellowPages.heartbeat('nonexistent_openid_xyz', fakeSigner);
  notFound.code === 1007 ? ok('nonexistent heartbeat → 1007') : err('not found', `expected 1007, got ${notFound.code}`);

  // ═══════════════════════════════════════════════════════
  // PART 2: 效率 — 延迟测量
  // ═══════════════════════════════════════════════════════
  hr('Part 2: 效率验证 — 操作延迟 (ms)');

  const latencies = { discover: [], heartbeat: [], update: [], register: [] };
  const WARMUP = 2;
  const SAMPLES = 8;

  for (let i = 0; i < WARMUP + SAMPLES; i++) {
    const r = await timeIt('discover', () => ob.l1.yellowPages.discover(['perf'], 10));
    if (i >= WARMUP) latencies.discover.push(r._ms);
  }

  for (let i = 0; i < WARMUP + SAMPLES; i++) {
    const r = await timeIt('heartbeat', () => ob.l1.yellowPages.heartbeat(myOpenid, signer));
    if (i >= WARMUP) latencies.heartbeat.push(r._ms);
  }

  for (let i = 0; i < WARMUP + 2; i++) {
    const r = await timeIt('update', () => ob.l1.yellowPages.updateService(myOpenid, signer, ['perf', 'test', `v${i}`]));
    if (i >= WARMUP) latencies.update.push(r._ms);
  }

  for (let i = 0; i < WARMUP + 2; i++) {
    // Register a fresh agent for timing (avoids duplicate error)
    const tmpOb = await createOceanBus();
    await tmpOb.register();
    const tmpOid = await tmpOb.getOpenId();
    const tmpKp = await tmpOb.crypto.generateKeypair();
    const tmpPub = tmpOb.crypto.keypairToBase64url(tmpKp).publicKey;
    const tmpSigner = async (p) => tmpOb.crypto.sign(tmpKp, p);

    const r = await timeIt('register', () =>
      tmpOb.l1.yellowPages.registerService(tmpOid, ['perf', 'timing'], 'Timing test', tmpPub, tmpSigner)
    );
    if (i >= WARMUP) latencies.register.push(r._ms);

    // Cleanup
    try { await tmpOb.l1.yellowPages.deregisterService(tmpOid, tmpSigner); } catch {}
    await tmpOb.destroy();
    await sleep(500);
  }

  const ops = ['discover', 'heartbeat', 'update', 'register'];
  console.log('');
  console.log('  Operation      Samples   P50      P95      Min      Max');
  console.log('  ─────────      ───────   ───      ───      ───      ───');
  for (const op of ops) {
    const arr = latencies[op];
    if (arr.length === 0) continue;
    const p50 = percentile(arr, 50).toFixed(0).padStart(5);
    const p95 = percentile(arr, 95).toFixed(0).padStart(5);
    const min = Math.min(...arr).toFixed(0).padStart(5);
    const max = Math.max(...arr).toFixed(0).padStart(5);
    console.log(`  ${op.padEnd(15)} ${String(arr.length).padStart(4)}     ${p50}ms   ${p95}ms   ${min}ms   ${max}ms`);
  }

  // 检查 P95 是否合理（所有写操作 < 15s 视为通过）
  const p95ok = Object.values(latencies).every(arr =>
    arr.length === 0 || percentile(arr, 95) < 15000
  );
  p95ok
    ? ok('P95 latency < 15s for all operations')
    : err('P95 latency', 'some operations exceed 15s');

  // ═══════════════════════════════════════════════════════
  // PART 3: 并发 — 并发请求处理
  // ═══════════════════════════════════════════════════════
  hr('Part 3: 并发验证 — 并行请求');

  // 3.1 多个独立 Agent 并发注册
  console.log('\n  3.1 多 Agent 并发注册');
  const CONCURRENT = 6;
  const agents = [];

  for (let i = 0; i < CONCURRENT; i++) {
    const a = await createOceanBus();
    await a.register();
    const oid = await a.getOpenId();
    const kp = await a.crypto.generateKeypair();
    const pk = a.crypto.keypairToBase64url(kp).publicKey;
    const s = async (p) => a.crypto.sign(kp, p);
    agents.push({ ob: a, openid: oid, pubKey: pk, signer: s });
  }

  const startTime = performance.now();
  const results = await Promise.all(agents.map((a, i) =>
    a.ob.l1.yellowPages.registerService(
      a.openid,
      ['concurrent', `batch-${i}`],
      `Concurrent registration test agent #${i}.`,
      a.pubKey,
      a.signer
    ).then(r => ({ ...r, idx: i }))
  ));
  const totalMs = +(performance.now() - startTime).toFixed(0);

  const successCount = results.filter(r => r.code === 0).length;
  const failCount = results.filter(r => r.code !== 0).length;

  console.log(`  ─ ${CONCURRENT} 个 Agent 并发注册 ─`);
  console.log(`  总耗时: ${totalMs}ms`);
  console.log(`  成功: ${successCount}, 失败: ${failCount}`);
  results.forEach(r => {
    const mark = r.code === 0 ? '✅' : '❌';
    console.log(`    ${mark} Agent #${r.idx}: code=${r.code}`);
  });

  successCount === CONCURRENT
    ? ok(`all ${CONCURRENT} concurrent registrations succeeded`)
    : err('concurrent registration', `${failCount} failed`);

  // 3.2 并发 discover（只读，全部应成功）
  console.log('\n  3.2 并发 discover');
  const discResults = await Promise.all(Array.from({ length: 8 }, (_, i) =>
    ob.l1.yellowPages.discover(['concurrent'], 5).then(r => ({ ...r, idx: i }))
  ));
  const discOk = discResults.filter(r => r.code === 0).length;
  discOk === 8
    ? ok('8 concurrent discovers all returned')
    : err('concurrent discover', `${8 - discOk} failed`);

  const totalFound = discResults[0]?.data?.total || 0;
  totalFound >= CONCURRENT
    ? ok(`discover shows all ${totalFound} registered agents`)
    : err('discover completeness', `expected >=${CONCURRENT}, got ${totalFound}`);

  // 3.3 TOCTOU 验证：同一 openid 并发注册
  console.log('\n  3.3 TOCTOU 并发注册（同一 openid）');
  const dupOpenid = agents[0].openid;
  const dupPubKey = agents[0].pubKey;
  const dupSigner = agents[0].signer;

  const toctouResults = await Promise.all(Array.from({ length: 5 }, () =>
    ob.l1.yellowPages.registerService(
      dupOpenid,
      ['toctou'],
      'TOCTOU test — should only succeed once.',
      dupPubKey,
      dupSigner
    )
  ));

  const toctouSuccess = toctouResults.filter(r => r.code === 0);
  const toctouRejected = toctouResults.filter(r => r.code === 1002);
  const toctouOther = toctouResults.filter(r => r.code !== 0 && r.code !== 1002);

  console.log(`  code=0 (成功):      ${toctouSuccess.length} (期望: 1)`);
  console.log(`  code=1002 (已存在):  ${toctouRejected.length} (期望: 4)`);
  console.log(`  其他错误:            ${toctouOther.length}`);

  const toctouOk = toctouRejected.length >= 4
    && toctouSuccess.length + toctouRejected.length === 5
    && toctouOther.length === 0;

  toctouOk
    ? ok('TOCTOU: all duplicates correctly rejected')
    : err('TOCTOU', `got ${toctouOther.length} unexpected errors`);

  // 3.4 并发 heartbeat
  console.log('\n  3.4 并发 heartbeat');
  const hbResults = await Promise.all(agents.map((a, i) =>
    a.ob.l1.yellowPages.heartbeat(a.openid, a.signer).then(r => ({ ...r, idx: i }))
  ));
  const hbOk = hbResults.filter(r => r.code === 0).length;
  hbOk === CONCURRENT
    ? ok(`all ${CONCURRENT} concurrent heartbeats succeeded`)
    : err('concurrent heartbeat', `${CONCURRENT - hbOk} failed`);

  // ── 清理 ──
  console.log('\n  清理并发测试数据...');
  for (const a of agents) {
    try { await a.ob.l1.yellowPages.deregisterService(a.openid, a.signer); } catch {}
    await a.ob.destroy();
  }
  console.log('  已清理');

  // ═══════════════════════════════════════════════════════
  // 汇总
  // ═══════════════════════════════════════════════════════
  console.log('\n' + '═'.repeat(60));
  const total = P.passed + P.failed;
  if (P.failed === 0) {
    console.log(`\n  🎉 全部通过: ${P.passed} 项验证 (含功能/性能/并发)\n`);
  } else {
    console.log(`\n  📊 ${P.passed} 通过, ${P.failed} 失败, ${total} 合计\n`);
    process.exit(1);
  }
}

main().catch(e => {
  console.error('\n💥 致命错误:', e.message);
  process.exit(1);
});

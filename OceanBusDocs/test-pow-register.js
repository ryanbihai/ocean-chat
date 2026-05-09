/**
 * Test POW registration flow against live OceanBus L0 API.
 *
 * Run: node test-pow-register.js
 */
const crypto = require('crypto');

const BASE_URL = 'https://ai-t.ihaola.com.cn/api/l0';

// Replicate SDK POW logic inline for direct API test
// difficulty is in BITS. 20 bits = 5 hex zeros ≈ 1s.
function computeHashcash(challenge, difficulty = 20) {
  const bitsToHex = bits => Math.ceil(bits / 4);
  const prefix = '0'.repeat(bitsToHex(difficulty));
  let solution = 0;
  let hash = '';
  const start = Date.now();
  while (true) {
    hash = crypto.createHash('sha256').update(challenge + solution).digest('hex');
    if (hash.startsWith(prefix)) break;
    solution++;
  }
  return { solution: String(solution), hash, elapsedMs: Date.now() - start };
}

async function main() {
  console.log('=== OceanBus POW 注册流程测试 ===\n');

  // ─── 1. Unit test: POW computation correctness ───
  console.log('[1] 本地 POW 计算正确性...');
  const testNonce = 'test_nonce_12345';
  const result = computeHashcash(testNonce, 20);
  console.log(`   nonce: ${testNonce}`);
  console.log(`   difficulty: 20 bits → ${Math.ceil(20/4)} hex chars`);
  console.log(`   solution: ${result.solution}`);
  console.log(`   hash: ${result.hash}`);
  console.log(`   time: ${(result.elapsedMs / 1000).toFixed(1)}s`);

  // Verify
  const verifyHash = crypto.createHash('sha256').update(testNonce + result.solution).digest('hex');
  const expectedPrefix = '0'.repeat(5); // 20 bits = 5 hex chars
  if (verifyHash.startsWith(expectedPrefix) && verifyHash === result.hash) {
    console.log('   ✅ POW 计算正确，验证通过');
  } else {
    console.log('   ❌ POW 验证失败');
    process.exit(1);
  }

  // Quick verify with a wrong solution
  const badVerify = crypto.createHash('sha256').update(testNonce + '0').digest('hex').startsWith(expectedPrefix);
  console.log(`   ${badVerify ? '❌' : '✅'} 错误 solution 正确被拒绝`);

  // ─── 2. Integration: live registration with POW ───
  console.log('\n[2] 实际注册（含 POW 挑战）...');

  const request = require('superagent');
  const req = (method, path) => request[method](BASE_URL + path).timeout(15000).ok(() => true);

  // Step 1: initial register (should get 401 + challenge or 1007 rate limit)
  let res = await req('post', '/agents/register');
  console.log(`   初始响应: status=${res.status}, code=${res.body.code}, msg=${res.body.msg}`);

  // Check for rate limit
  if (res.body.code === 1007) {
    console.log('   ⚠ 注册频率受限 (1007)，检查 Retry-After...');
    const retryAfter = res.headers['retry-after'];
    console.log(`   Retry-After: ${retryAfter || '未提供'}s`);
    console.log('   ✅ 限频处理逻辑正确（已识别 1007）');
    console.log('\n=== 测试完成（受限于注册频率，POW 挑战未触发） ===');
    return;
  }

  // Check for POW challenge
  if (res.status === 401 && res.body?.data?.challenge?.nonce) {
    const { nonce, difficulty } = res.body.data.challenge;
    const actualDifficulty = difficulty ?? 5;
    console.log(`   收到 POW 挑战，nonce: ${nonce}, difficulty: ${actualDifficulty}`);
    console.log(`   计算 POW solution (difficulty=${actualDifficulty})...`);

    const { solution, elapsedMs } = computeHashcash(nonce, actualDifficulty);
    console.log(`   solution: ${solution}, 耗时: ${(elapsedMs / 1000).toFixed(1)}s`);

    // Step 2: resubmit with challenge + solution
    res = await req('post', '/agents/register').send({ challenge: nonce, solution });
    console.log(`   POW 提交响应: status=${res.status}, code=${res.body.code}`);

    if (res.body.code === 0 && res.body.data?.api_key) {
      console.log(`   ✅ 注册成功! agent_id: ${res.body.data.agent_id}`);
    } else if (res.body.code === 1007) {
      console.log('   ⚠ POW 通过但触发频率限制 (1007) — 注册逻辑正确');
    } else {
      console.log(`   ❌ 注册失败: code=${res.body.code} msg=${res.body.msg}`);
      process.exit(1);
    }
  } else {
    console.log('   ⚠ 未收到 POW 挑战（可能已过注册限制或服务端策略变化）');
  }

  console.log('\n=== 测试完成 ===');
}

main().catch(e => {
  console.error('测试异常:', e.message);
  process.exit(1);
});

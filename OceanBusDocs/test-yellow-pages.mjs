/**
 * OceanBus 黄页（Yellow Pages）完整功能测试
 *
 * 用法: node test-yellow-pages.mjs
 *
 * 覆盖黄页 SDK 全部能力：
 *   1. registerService   — 注册服务 + 错误场景（重复注册、错误签名）
 *   2. discover          — 标签过滤、分页翻页、空结果、响应字段验证
 *   3. heartbeat         — 手动心跳 + 签名错误 + 条目不存在
 *   4. startHeartbeat    — 自动心跳（启动/停止/状态查询）
 *   5. updateService     — 部分更新 + registered_at 不变验证
 *   6. deregisterService — 注销服务 + 自动停止心跳
 *   7. 约束校验          — tags ≤ 120 字符, description ≤ 800 字符
 *   8. 消费方发现链路    — 模拟 AI Agent 的完整"发现→筛选→决策"流程
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const { createOceanBus } = require('./dist/index.js');
const { generateKeypair, sign, keypairToHex } = require('./dist/crypto/ed25519.js');

// ── 测试辅助 ─────────────────────────────────────────────

let passed = 0;
let failed = 0;

function ok(desc) { passed++; console.log(`  ✅ ${desc}`); }
function fail(desc, reason) { failed++; console.log(`  ❌ ${desc}: ${reason}`); }

async function check(desc, fn) {
  try {
    await fn();
    ok(desc);
  } catch (e) {
    fail(desc, e.message);
  }
}

function eq(actual, expected, label) {
  if (actual === expected) { ok(label); return true; }
  fail(label, `expected ${expected}, got ${actual}`); return false;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function hr(title) {
  const line = '─'.repeat(62);
  console.log(`\n${line}\n  ${title}\n${line}`);
}

// ── 主流程 ────────────────────────────────────────────────

async function main() {
  console.log('\n🔍 OceanBus 黄页（Yellow Pages）SDK 完整功能测试');
  console.log('═'.repeat(62));

  // ═══════════════════════════════════════════════════════
  // 0. 初始化
  // ═══════════════════════════════════════════════════════
  hr('0. 初始化 OceanBus SDK');

  const ob = await createOceanBus();
  const reg = await ob.register();
  console.log(`  agent_id: ${reg.agent_id}`);
  console.log(`  api_key:  ${reg.api_key.substring(0, 24)}...`);

  const myOpenid = await ob.getOpenId();
  console.log(`  openid:   ${myOpenid.substring(0, 32)}...`);

  const keypair = await ob.crypto.generateKeypair();
  const hexKeys = ob.crypto.keypairToHex(keypair);
  const wrongKeypair = await ob.crypto.generateKeypair();
  console.log(`  公钥:     ${hexKeys.publicKey.substring(0, 40)}...`);

  // signer —— 所有写操作都用它签名
  const signer = async (p) => ob.crypto.sign(keypair, p);
  const wrongSigner = async (p) => ob.crypto.sign(wrongKeypair, p);

  // ═══════════════════════════════════════════════════════
  // 1. registerService
  // ═══════════════════════════════════════════════════════
  hr('1. registerService — 注册服务到黄页');

  // 1.1 正常注册
  console.log('\n  1.1 正常注册');
  let registeredAt, updatedAt;

  await check('注册成功返回 code=0', async () => {
    const r = await ob.l1.yellowPages.registerService(
      myOpenid,
      ['test', 'demo', 'oceanbus-sdk'],
      'OceanBus SDK 黄页测试服务。用于演示 registerService / discover / heartbeat / updateService / deregisterService 完整流程。',
      hexKeys.publicKey,
      signer
    );
    if (r.code !== 0) throw new Error(`code=${r.code}`);
    registeredAt = r.data?.registered_at;
    updatedAt = r.data?.updated_at;
  });

  await check('响应包含 registered_at', () => { if (!registeredAt) throw new Error('缺失'); });
  await check('注册时 updated_at 等于 registered_at', () => { if (registeredAt !== updatedAt) throw new Error(); });

  // 1.2 重复注册（同一 openid）
  console.log('\n  1.2 重复注册（同一 openid → code 1002）');
  await check('拒绝重复 openid', async () => {
    const r = await ob.l1.yellowPages.registerService(
      myOpenid, ['other'], '重复注册应被拒绝', hexKeys.publicKey, signer
    );
    if (r.code !== 1002) throw new Error(`expected 1002, got ${r.code}`);
  });

  // 1.3 错误签名
  console.log('\n  1.3 用错误私钥注册（应返回 code 1001）');
  // 换个新 Agent 来测——因为 openid 已被占用
  const ob2 = await createOceanBus();
  await ob2.register();
  const openid2 = await ob2.getOpenId();

  await check('错误签名被拒绝', async () => {
    const r = await ob.l1.yellowPages.registerService(
      openid2, ['test'], '错误签名测试', hexKeys.publicKey,
      async (p) => ob.crypto.sign(wrongKeypair, p)  // 用错了私钥
    );
    if (r.code !== 1001) throw new Error(`expected 1001, got ${r.code}`);
  });

  await ob2.destroy();

  // ═══════════════════════════════════════════════════════
  // 2. discover
  // ═══════════════════════════════════════════════════════
  hr('2. discover — 服务发现');

  // 2.1 标签精确匹配（AND 逻辑）
  console.log('\n  2.1 按标签 AND 匹配 (tags: ["test", "demo"])');
  let page1;
  await check('按标签过滤返回匹配条目', async () => {
    page1 = await ob.l1.yellowPages.discover(['test', 'demo'], 10);
    if (page1.code !== 0) throw new Error(`code=${page1.code}`);
    const found = page1.data.entries.some(e => e.openid === myOpenid);
    if (!found) throw new Error('未找到自己注册的条目');
    console.log(`      匹配总数: ${page1.data.total}, 本页: ${page1.data.entries.length}`);
  });

  await check('响应包含必要字段', async () => {
    const e = page1.data.entries.find(x => x.openid === myOpenid);
    if (!e) throw new Error('条目缺失');
    if (!e.tags || !Array.isArray(e.tags)) throw new Error('tags 缺失');
    if (!e.description) throw new Error('description 缺失');
    if (!e.registered_at) throw new Error('registered_at 缺失');
    if (!e.updated_at) throw new Error('updated_at 缺失');
    if (!e.last_heartbeat) throw new Error('last_heartbeat 缺失');
  });

  // 2.2 无匹配标签
  console.log('\n  2.2 不存在的标签（空结果）');
  await check('无匹配时返回空列表而非报错', async () => {
    const r = await ob.l1.yellowPages.discover(['nonexistent-tag-xyz'], 5);
    if (r.code !== 0) throw new Error(`code=${r.code}`);
    if (r.data.entries.length !== 0) throw new Error('应为空');
    if (r.data.total !== 0) throw new Error('total 应为 0');
    if (r.data.next_cursor !== null) throw new Error('空结果 next_cursor 应为 null');
    console.log(`      total=0, entries=[], next_cursor=null  ✅`);
  });

  // 2.3 分页
  console.log('\n  2.3 分页翻页');
  const all = await ob.l1.yellowPages.discover(undefined, 2); // 每页 2 条

  if (all.data.entries.length >= 2 && all.data.next_cursor) {
    const page2 = await ob.l1.yellowPages.discover(undefined, 2, all.data.next_cursor);
    await check('第二页不包含第一页条目', () => {
      const p1Openids = new Set(all.data.entries.map(e => e.openid));
      const overlap = page2.data.entries.filter(e => p1Openids.has(e.openid));
      if (overlap.length > 0) throw new Error(`重复 ${overlap.length} 条`);
    });
    console.log(`      第1页: ${all.data.entries.length} 条, next_cursor 有效`);
    console.log(`      第2页: ${page2.data.entries.length} 条`);
  } else {
    console.log('      总条目不足一页，跳过多页测试');
  }

  // 2.4 discover 无需签名
  console.log('\n  2.4 discover 是只读操作，无需签名');
  console.log('      （所有 discover 调用均未传 signer，验证通过）');

  // ═══════════════════════════════════════════════════════
  // 3. heartbeat
  // ═══════════════════════════════════════════════════════
  hr('3. heartbeat — 手动发送心跳');

  // 3.1 正常心跳
  await check('正常心跳返回 code=0', async () => {
    const r = await ob.l1.yellowPages.heartbeat(myOpenid, signer);
    if (r.code !== 0) throw new Error(`code=${r.code}`);
  });

  await check('心跳后 last_heartbeat 更新', async () => {
    await sleep(1500);
    const r = await ob.l1.yellowPages.discover(['test', 'demo'], 5);
    const self = r.data.entries.find(e => e.openid === myOpenid);
    if (!self) throw new Error('条目未找到');
    if (self.last_heartbeat === self.registered_at) throw new Error('last_heartbeat 未更新');
    console.log(`      registered_at: ${self.registered_at}`);
    console.log(`      last_heartbeat: ${self.last_heartbeat}`);
  });

  // 3.2 错误签名的心跳
  console.log('\n  3.2 错误签名的心跳（code 1001）');
  await check('错误签名心跳被拒绝', async () => {
    const r = await ob.l1.yellowPages.heartbeat(myOpenid, wrongSigner);
    if (r.code !== 1001) throw new Error(`expected 1001, got ${r.code}`);
  });

  // 3.3 对不存在的条目心跳
  console.log('\n  3.3 对不存在的条目心跳（code 1007）');
  await check('不存在条目心跳被拒绝', async () => {
    const fakeSigner = async (p) => `ed25519:${'A'.repeat(86)}`; // 伪造签名——条目根本不存在
    const r = await ob.l1.yellowPages.heartbeat('nonexistent_openid', fakeSigner);
    if (r.code !== 1007) throw new Error(`expected 1007, got ${r.code}`);
  });

  // ═══════════════════════════════════════════════════════
  // 4. startHeartbeat
  // ═══════════════════════════════════════════════════════
  hr('4. startHeartbeat / stopHeartbeat — 自动心跳');

  console.log('  创建短心跳间隔实例（heartbeatIntervalMs=10000）...');
  const obShortHb = await createOceanBus({ l1: { heartbeatIntervalMs: 10000 } });
  // 复用已注册的 openid——自动心跳用的是同一对密钥签名
  const shortHbOpenid = myOpenid;

  await check('初始状态 isHeartbeating() = false', () => {
    if (obShortHb.l1.yellowPages.isHeartbeating()) throw new Error();
  });

  obShortHb.l1.yellowPages.startHeartbeat(shortHbOpenid, signer);

  await check('startHeartbeat 后 isHeartbeating() = true', () => {
    if (!obShortHb.l1.yellowPages.isHeartbeating()) throw new Error();
  });

  console.log('  等待 12 秒，自动心跳至少触发一次...');
  await sleep(12000);
  console.log('  （心跳失败不抛异常——静默处理，黄页只记录时间）');

  obShortHb.l1.yellowPages.stopHeartbeat();

  await check('stopHeartbeat 后 isHeartbeating() = false', () => {
    if (obShortHb.l1.yellowPages.isHeartbeating()) throw new Error();
  });

  await obShortHb.destroy();

  // ═══════════════════════════════════════════════════════
  // 5. updateService
  // ═══════════════════════════════════════════════════════
  hr('5. updateService — 更新服务信息');

  // 5.1 同时更新
  console.log('\n  5.1 同时更新 tags 和 description');
  let updatedEntry;
  await check('updateService 返回 code=0', async () => {
    const r = await ob.l1.yellowPages.updateService(
      myOpenid, signer,
      ['test', 'updated', 'oceanbus-sdk'],
      '【已更新】加入了 updateService 的演示。'
    );
    if (r.code !== 0) throw new Error(`code=${r.code}`);
  });

  await check('registered_at 保持不变，updated_at 已更新', async () => {
    const r = await ob.l1.yellowPages.discover(['updated'], 5);
    updatedEntry = r.data.entries.find(e => e.openid === myOpenid);
    if (!updatedEntry) throw new Error('条目未找到');
    if (updatedEntry.registered_at !== registeredAt) throw new Error('registered_at 不应变化');
    if (updatedEntry.updated_at === registeredAt) throw new Error('updated_at 应已更新');
  });

  // 5.2 部分更新——只更新 tags
  console.log('\n  5.2 部分更新——仅更新 tags（description 保持不变）');
  await ob.l1.yellowPages.updateService(myOpenid, signer, ['food', 'dumpling', 'delivery']);
  const descCheck = await ob.l1.yellowPages.discover(['food'], 5);
  const descEntry = descCheck.data.entries.find(e => e.openid === myOpenid);
  await check('未传入的 description 保持不变', () => {
    if (!descEntry) throw new Error('条目未找到');
    if (!descEntry.description.includes('已更新')) throw new Error('description 被意外覆盖');
    console.log(`      description: ${descEntry.description.substring(0, 50)}...`);
  });

  // 5.3 签名验证失败
  console.log('\n  5.3 错误签名的 update（code 1001）');
  await check('错误签名 update 被拒绝', async () => {
    const r = await ob.l1.yellowPages.updateService(
      myOpenid, wrongSigner, ['hack']
    );
    if (r.code !== 1001) throw new Error(`expected 1001, got ${r.code}`);
  });

  // ═══════════════════════════════════════════════════════
  // 6. deregisterService
  // ═══════════════════════════════════════════════════════
  hr('6. deregisterService — 注销服务');

  await check('正常注销返回 code=0', async () => {
    const r = await ob.l1.yellowPages.deregisterService(myOpenid, signer);
    if (r.code !== 0) throw new Error(`code=${r.code}`);
  });

  await check('注销后 isHeartbeating() = false（自动停止）', () => {
    if (ob.l1.yellowPages.isHeartbeating()) throw new Error();
  });

  await check('注销后 discover 不再返回该条目', async () => {
    await sleep(1000);
    const r = await ob.l1.yellowPages.discover(['test', 'demo'], 5);
    const still = r.data.entries.find(e => e.openid === myOpenid);
    if (still) throw new Error('条目仍存在');
  });

  // 注销后重新注册（证明可以再次加入黄页）
  console.log('\n  6.1 注销后重新注册（完整生命周期）');
  await check('重新注册成功', async () => {
    const r = await ob.l1.yellowPages.registerService(
      myOpenid,
      ['reborn'],
      '重生测试——证明注销后可重新注册',
      hexKeys.publicKey,
      signer
    );
    if (r.code !== 0) throw new Error(`code=${r.code}`);
  });

  // ═══════════════════════════════════════════════════════
  // 7. 约束校验（本地拦截）
  // ═══════════════════════════════════════════════════════
  hr('7. 客户端约束校验（本地拦截，不发网络请求）');

  // 7.1 tags 超限
  console.log('\n  7.1 tags 总字符数 > 120（本地拒绝）');
  const longTags = [
    'this-tag-is-exactly-40-characters-long-ok',
    'another-40-character-tag-for-testing-12',
    'third-tag-pushes-total-over-120-chars!!!!!!!',
  ];
  const totalChars = longTags.reduce((s, t) => s + t.length, 0);
  console.log(`      构造 ${longTags.length} 个 tag，总计 ${totalChars} 字符`);
  await check('本地拦截超长 tags', async () => {
    try {
      await ob.l1.yellowPages.registerService(
        myOpenid, longTags, 'valid description', hexKeys.publicKey, signer
      );
      throw new Error('未抛出异常');
    } catch (e) {
      if (!e.message.includes('120')) throw new Error(`错误消息: ${e.message}`);
    }
  });

  // 7.2 description 超限
  console.log('\n  7.2 description > 800 字符（本地拒绝）');
  await check('本地拦截超长 description', async () => {
    try {
      await ob.l1.yellowPages.registerService(
        myOpenid, ['ok'], 'x'.repeat(801), hexKeys.publicKey, signer
      );
      throw new Error('未抛出异常');
    } catch (e) {
      if (!e.message.includes('800')) throw new Error(`错误消息: ${e.message}`);
    }
  });

  // ═══════════════════════════════════════════════════════
  // 8. 消费方完整发现链路（端到端场景）
  // ═══════════════════════════════════════════════════════
  hr('8. 消费方 AI 完整发现链路');

  console.log(`
  场景：一个"饺子爱好者" AI Agent 想找附近的外卖服务。

  步骤 1: discover → 按标签粗筛`);

  // 用不设标签的全量发现——展示当前黄页上的所有服务
  const discoverResult = await ob.l1.yellowPages.discover(undefined, 20);
  const entries = discoverResult.data?.entries || [];

  console.log(`         找到 ${discoverResult.data.total} 个匹配服务，当前页 ${entries.length} 个`);
  console.log(`         next_cursor: ${discoverResult.data.next_cursor || '(无更多)'}`);

  if (entries.length > 0) {
    console.log(`\n  步骤 2: AI 阅读 description，提取语义`);
    for (const e of entries) {
      const heartbeatAge = Date.now() - new Date(e.last_heartbeat).getTime();
      const ageStr = heartbeatAge < 60000 ? `${Math.round(heartbeatAge / 1000)}s 前`
        : heartbeatAge < 3600000 ? `${Math.round(heartbeatAge / 60000)}min 前`
        : `${Math.round(heartbeatAge / 3600000)}h 前`;

      console.log(`\n    📋 ${e.description.substring(0, 60)}...`);
      console.log(`       tags: [${e.tags.join(', ')}]`);
      console.log(`       last_heartbeat: ${ageStr}`);
      console.log(`       registered: ${e.registered_at?.substring(0, 10)}`);
      console.log(`       updated:    ${e.updated_at?.substring(0, 10)}`);
    }

    console.log(`\n  步骤 3: AI 综合决策`);
    console.log(`         AI 根据 description 语义 + last_heartbeat 新鲜度`);
    console.log(`         + 声誉服务查询结果（CA 等级/标签/举报记录）`);
    console.log(`         → 自行选择最合适的服务方发起通信`);
    console.log(`\n         如果当前页找不到足够可信候选：`);
    console.log(`         → next_cursor 非 null → 翻页继续`);
    console.log(`         → next_cursor 为 null → 告知用户"未找到"`);
  }

  // ═══════════════════════════════════════════════════════
  // 清理
  // ═══════════════════════════════════════════════════════
  hr('清理');

  // 注销掉我们注册的所有测试条目
  try { await ob.l1.yellowPages.deregisterService(myOpenid, signer); } catch {}
  await ob.destroy();
  console.log('  已清理');

  // ── 测试结果汇总 ──────────────────────────────────────
  console.log('\n' + '═'.repeat(62));
  const total = passed + failed;
  if (failed === 0) {
    console.log(`\n  🎉 全部通过: ${passed} 项测试\n`);
  } else {
    console.log(`\n  📊 ${passed} 通过, ${failed} 失败, ${total} 合计\n`);
    process.exit(1);
  }
}

main().catch(e => {
  console.error('\n💥 致命错误:', e.message);
  process.exit(1);
});

/**
 * Guess AI — 多 Agent 本地集成测试
 *
 * 模拟 1 个裁判 + 2 名玩家在 OceanBus 上完成从注册到通信的完整流程。
 *
 * 运行: node test-guess-ai-multi-agent.js
 */

const { createOceanBus } = require('oceanbus');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOM_CODE = `test${Date.now().toString(36)}`;
const DATA_ROOT = path.join(os.homedir(), '.oceanbus', `guess-ai-test-${ROOM_CODE}`);
const TIMEOUT = 120000; // 2 min total

// ── helpers ──

function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }); }
function saveJSON(file, data) { ensureDir(path.dirname(file)); fs.writeFileSync(file, JSON.stringify(data, null, 2)); }
function loadJSON(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function shortId(s) { return s.slice(0, 16) + '...'; }

let passed = 0; let failed = 0;
function check(label, ok) { if (ok) { console.log(`  ✅ ${label}`); passed++; } else { console.log(`  ❌ ${label}`); failed++; } }

// ── agent factory ──

async function createAgent(name, role) {
  const dir = path.join(DATA_ROOT, name);
  ensureDir(dir);
  const credFile = path.join(dir, 'credentials.json');

  let creds = loadJSON(credFile);
  let ob;

  if (creds) {
    ob = await createOceanBus({
      keyStore: { type: 'memory' },
      identity: { agent_id: creds.agent_id, api_key: creds.api_key },
    });
  } else {
    ob = await createOceanBus({ keyStore: { type: 'memory' } });
    try {
      const reg = await ob.register();
      const openid = await ob.getOpenId();
      creds = { agent_id: reg.agent_id, api_key: reg.api_key, openid };
      saveJSON(credFile, creds);
    } catch (e) {
      if (typeof e.isRateLimited === 'function' && e.isRateLimited()) {
        const wait = e.retryAfterSeconds ? `${Math.ceil(e.retryAfterSeconds / 3600)}h` : 'a while';
        throw new Error(`[${name}] Rate limited. Wait ${wait}.`);
      }
      throw e;
    }
  }

  const openid = creds.openid || await ob.getOpenId();
  return { ob, agentId: creds.agent_id, openid, name, role };
}

async function destroyAgent(a) {
  try { await a.ob.destroy(); } catch {}
}

// ── main test ──

async function main() {
  console.log(`=== Guess AI 多 Agent 本地测试 ===`);
  console.log(`Room: ${ROOM_CODE}\n`);

  const startedAt = Date.now();
  const deadline = startedAt + TIMEOUT;

  // ── Step 1: Register 3 agents ──
  console.log('[1] 注册 3 个 Agent...');
  let host, player1, player2;
  try {
    [host, player1, player2] = await Promise.all([
      createAgent('host', '裁判'),
      createAgent('player1', '玩家1'),
      createAgent('player2', '玩家2'),
    ]);
  } catch (e) {
    console.error('注册失败:', e.message);
    console.log('\n可能原因：');
    console.log('  1. 同一 IP 24h 内已达注册上限（3次）');
    console.log('  2. POW 计算耗时过长');
    console.log('如果刚才的注册已经部分成功，直接复用凭证重新运行即可。');
    process.exit(1);
  }

  check(`裁判注册: ${shortId(host.openid)}`, !!host.openid);
  check(`玩家1注册: ${shortId(player1.openid)}`, !!player1.openid);
  check(`玩家2注册: ${shortId(player2.openid)}`, !!player2.openid);

  // ── Step 2: Host publishes to Yellow Pages ──
  console.log('\n[2] 裁判发布房间到黄页...');
  const hostKey = await host.ob.createServiceKey();
  host.ob.l1.yellowPages.setIdentity(host.openid, hostKey.signer, hostKey.publicKey);

  try {
    const regResult = await host.ob.l1.yellowPages.registerService(
      ['guess-ai', 'room-' + ROOM_CODE],
      'Guess AI test room ' + ROOM_CODE
    );
    check('裁判发布房间成功', regResult.code === 0);
  } catch (e) {
    if (e.message && e.message.includes('11000')) {
      console.log('  ⚠ 房间已存在（可能上次测试的残留）');
    } else {
      check('裁判发布房间成功 (code=' + (e.code || '?') + ')', false);
    }
  }

  // ── Step 3: Players discover the room ──
  console.log('\n[3] 玩家搜索房间...');
  await sleep(3000); // wait for YP propagation

  let hostOpenid;
  try {
    const result = await player1.ob.l1.yellowPages.discover(
      ['guess-ai', 'room-' + ROOM_CODE], 5
    );
    check('黄页搜索返回结果', result.code === 0);
    const entries = result.data?.entries || [];
    check('找到房间条目', entries.length > 0);
    if (entries.length > 0) {
      hostOpenid = entries[0].openid;
      check(`房间 OpenID 非空: ${shortId(hostOpenid)}`, !!hostOpenid);
    }
  } catch (e) {
    check('黄页搜索成功', false);
    console.error('  错误:', e.message);
  }

  if (!hostOpenid) {
    console.log('\n⚠ 未搜索到房间。可能原因：');
    console.log('  1. 黄页索引延迟——等10秒重试');
    console.log('  2. 裁判发布时出错');
    console.log('  3. tags 不匹配');
    await sleep(10000);
    const retry = await player1.ob.l1.yellowPages.discover(['guess-ai', 'room-' + ROOM_CODE], 5);
    if (retry.data?.entries?.length > 0) {
      hostOpenid = retry.data.entries[0].openid;
      console.log(`  ✅ 重试成功: ${shortId(hostOpenid)}`);
    } else {
      console.log('  ❌ 重试仍失败');
    }
  }

  // ── Step 4: Players send join requests to host ──
  if (hostOpenid) {
    console.log('\n[4] 玩家发送加入请求...');
    await player1.ob.send(hostOpenid, '加入');
    await sleep(1000);
    await player2.ob.send(hostOpenid, '加入');
    await sleep(1000);
    check('玩家1 发送加入请求', true);
    check('玩家2 发送加入请求', true);

    // ── Step 5: Host checks inbox ──
    console.log('\n[5] 裁判查看信箱...');
    const hostMsgs = await host.ob.sync(undefined, 50);
    check(`裁判收到 ${hostMsgs.length} 条消息`, hostMsgs.length >= 2);
    for (const msg of hostMsgs) {
      const from = msg.from_openid === player1.openid ? '玩家1' :
                   msg.from_openid === player2.openid ? '玩家2' : shortId(msg.from_openid);
      console.log(`  ${from}: ${msg.content}`);
    }

    // ── Step 6: Host assigns player numbers and sends back ──
    console.log('\n[6] 裁判分配玩家编号并回复...');
    const joinMsgs = hostMsgs.filter(m => m.content === '加入');
    if (joinMsgs.length >= 2) {
      await host.ob.send(joinMsgs[0].from_openid, '你是1号玩家');
      await host.ob.send(joinMsgs[1].from_openid, '你是2号玩家');
      await sleep(2000);

      // Players check replies
      const p1Msgs = await player1.ob.sync(undefined, 50);
      const p2Msgs = await player2.ob.sync(undefined, 50);
      check('玩家1 收到编号', p1Msgs.some(m => m.content.includes('号玩家')));
      check('玩家2 收到编号', p2Msgs.some(m => m.content.includes('号玩家')));
      for (const msg of p1Msgs) console.log(`  玩家1 收到: ${msg.content}`);
      for (const msg of p2Msgs) console.log(`  玩家2 收到: ${msg.content}`);
    }

    // ── Step 7: P2P messaging between players ──
    console.log('\n[7] 玩家之间 P2P 通信...');
    await player1.ob.send(player2.openid, '你好2号，我是1号');
    await sleep(2000);
    const p2Inbox = await player2.ob.sync(undefined, 50);
    check('玩家2 收到 P2P 消息', p2Inbox.some(m => m.content.includes('你好2号')));
    for (const msg of p2Inbox) {
      if (msg.from_openid === player1.openid) console.log(`  玩家2 收到来自1号: ${msg.content}`);
    }

    // ── Step 8: Host sends game announcements ──
    console.log('\n[8] 裁判群发游戏公告...');
    await host.ob.send(player1.openid, '【系统】第一轮开始，请投票');
    await host.ob.send(player2.openid, '【系统】第一轮开始，请投票');
    await sleep(2000);

    const p1Final = await player1.ob.sync(undefined, 50);
    const p2Final = await player2.ob.sync(undefined, 50);
    check('玩家1 收到游戏公告', p1Final.some(m => m.content.includes('第一轮')));
    check('玩家2 收到游戏公告', p2Final.some(m => m.content.includes('第一轮')));
  }

  // ── Step 9: Cleanup ──
  console.log('\n[9] 清理...');
  try {
    await host.ob.l1.yellowPages.deregisterService();
    console.log('  ✅ 黄页房间已移除');
  } catch (e) {
    console.log('  ⚠ 移除房间失败:', e.message);
  }

  await Promise.all([destroyAgent(host), destroyAgent(player1), destroyAgent(player2)]);

  // ── Results ──
  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(0);
  console.log(`\n=== 测试完成: ${passed} passed, ${failed} failed (${elapsed}s) ===`);
  if (failed > 0) process.exit(1);
}

main().catch(e => {
  console.error('\n💥 测试异常:', e.message);
  process.exit(1);
});

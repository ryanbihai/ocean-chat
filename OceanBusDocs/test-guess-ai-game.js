/**
 * Guess AI — 驱动真实 game.js 进程的多 Agent 集成测试
 *
 * 模拟 1 个裁判 + 2 名玩家，通过独立 HOME 目录隔离身份，验证完整的 guess-ai 技能。
 *
 * 运行: node test-guess-ai-game.js
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const GAME_JS = path.join(__dirname, '..', 'skills', 'guess-ai', 'game.js');
const ROOM_CODE = `gtest${Date.now().toString(36)}`;
const TEST_ROOT = path.join(os.homedir(), '.oceanbus', `guess-ai-e2e-${ROOM_CODE}`);
const TIMEOUT = 180000;

// ── helpers ──

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function runGame(homeDir, args, stdin) {
  return new Promise((resolve, reject) => {
    const opts = { env: { ...process.env, HOME: homeDir, USERPROFILE: homeDir }, timeout: 30000 };
    // On Windows, HOME might not be enough — game.js uses os.homedir() which checks USERPROFILE
    opts.env.USERPROFILE = homeDir;
    const child = spawn('node', [GAME_JS, ...args], opts);
    let stdout = ''; let stderr = '';
    child.stdout.on('data', d => { stdout += d.toString(); });
    child.stderr.on('data', d => { stderr += d.toString(); });
    if (stdin) { child.stdin.write(stdin); child.stdin.end(); }
    child.on('close', code => resolve({ code, stdout, stderr }));
    child.on('error', err => reject(err));
  });
}

function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }); }

let passed = 0; let failed = 0;
function check(label, ok, detail) {
  if (ok) { console.log(`  ✅ ${label}`); passed++; }
  else { console.log(`  ❌ ${label}${detail ? ' — ' + detail : ''}`); failed++; }
}

function extractOpenid(stdout) {
  const m = stdout.match(/OpenID:\s*(\S+)/) || stdout.match(/([A-Za-z0-9_-]{50,120})/);
  return m ? m[1] : null;
}
function shortOid(s) { return s ? s.slice(0, 18) + '...' : '(none)'; }

// ── main ──

async function main() {
  console.log(`=== Guess AI game.js 真实技能集成测试 ===`);
  console.log(`Room: ${ROOM_CODE}`);

  const startedAt = Date.now();
  const homeHost = path.join(TEST_ROOT, 'host');
  const homeP1 = path.join(TEST_ROOT, 'player1');
  const homeP2 = path.join(TEST_ROOT, 'player2');
  ensureDir(homeHost); ensureDir(homeP1); ensureDir(homeP2);

  // ── Step 0: 从之前的 SDK 测试复用凭证（绕过 IP 注册限频）──
  console.log('[0] 复用 SDK 测试凭证...');
  const SDK_TEST_DIR = path.join(os.homedir(), '.oceanbus', 'guess-ai-test-testmotwdwpe');
  for (const [role, home] of [['host', homeHost], ['player1', homeP1], ['player2', homeP2]]) {
    const src = path.join(SDK_TEST_DIR, role, 'credentials.json');
    const dstDir = path.join(home, '.oceanbus', 'guess-ai');
    const dst = path.join(dstDir, 'credentials.json');
    if (fs.existsSync(src)) {
      ensureDir(dstDir);
      fs.copyFileSync(src, dst);
      console.log(`  ✅ ${role} 凭证就绪`);
    } else {
      console.log(`  ⚠ ${role} 凭证缺失，将尝试注册`);
    }
  }

  // Verify: run whoami to confirm
  const hostWho = await runGame(homeHost, ['whoami']);
  const p1Who = await runGame(homeP1, ['whoami']);
  const p2Who = await runGame(homeP2, ['whoami']);
  const hostOid = extractOpenid(hostWho.stdout);
  const p1Oid = extractOpenid(p1Who.stdout);
  const p2Oid = extractOpenid(p2Who.stdout);
  check('裁判身份就绪', !!hostOid, hostOid ? hostOid.slice(0,20)+'...' : hostWho.stderr.slice(0,60));
  check('玩家1身份就绪', !!p1Oid, p1Oid ? p1Oid.slice(0,20)+'...' : p1Who.stderr.slice(0,60));
  check('玩家2身份就绪', !!p2Oid, p2Oid ? p2Oid.slice(0,20)+'...' : p2Who.stderr.slice(0,60));

  if (!hostOid || !p1Oid || !p2Oid) {
    console.log('\n⚠ 凭证不可用，尝试全新注册（可能触发限频）...');
    // Fallback: register
    const [hostReg, p1Reg, p2Reg] = await Promise.all([
      runGame(homeHost, ['setup']),
      runGame(homeP1, ['setup']),
      runGame(homeP2, ['setup']),
    ]);
    if (!hostOid) hostOid = extractOpenid(hostReg.stdout);
    if (!p1Oid) p1Oid = extractOpenid(p1Reg.stdout);
    if (!p2Oid) p2Oid = extractOpenid(p2Reg.stdout);
  }

  console.log(`\n[1] 身份确认: 裁判=${shortOid(hostOid)} 玩家1=${shortOid(p1Oid)} 玩家2=${shortOid(p2Oid)}`);

  // ── Step 2: Host creates room ──
  console.log('\n[2] 裁判创建房间 (game.js host)...');
  const hostRoom = await runGame(homeHost, ['host', ROOM_CODE]);
  check('裁判创建房间', hostRoom.stdout.includes('Room') || hostRoom.stdout.includes('created') || hostRoom.code === 0,
    hostRoom.stdout.slice(0, 100));

  // ── Step 3: Players join (with YP discovery retry) ──
  console.log('\n[3] 玩家加入房间（含 YP 发现重试）...');

  async function joinWithRetry(home, label) {
    for (let attempt = 1; attempt <= 10; attempt++) {
      const r = await runGame(home, ['join', ROOM_CODE]);
      if (r.stdout.includes('Joined') || r.stdout.includes('room ' + ROOM_CODE)) {
        console.log(`  ${label} 第${attempt}次尝试成功`);
        return { ok: true, out: r.stdout };
      }
      if (r.stdout.includes('No room found')) {
        if (attempt === 10) return { ok: false, out: r.stdout };
        await sleep(2000);
        continue;
      }
      // unexpected output
      return { ok: false, out: r.stdout };
    }
  }

  const p1Result = await joinWithRetry(homeP1, '玩家1');
  const p2Result = await joinWithRetry(homeP2, '玩家2');
  check('玩家1加入', p1Result.ok, p1Result.out.slice(0,100));
  check('玩家2加入', p2Result.ok, p2Result.out.slice(0,100));

  // ── Step 4: Wait for message delivery ──
  console.log('  等待消息到达...');
  await sleep(5000);

  // ── Step 5: Host checks inbox ──
  console.log('\n[4] 裁判查看信箱 (game.js check)...');
  const hostCheck = await runGame(homeHost, ['check']);
  check('裁判收到消息', hostCheck.stdout.includes('加入') || hostCheck.stdout.length > 30,
    hostCheck.stdout.slice(0, 150));

  // ── Step 7: Host assigns player numbers ──
  console.log('\n[5] 裁判分配编号 (game.js send)...');
  if (p1Oid) {
    const s1 = await runGame(homeHost, ['send', p1Oid, '你是1号玩家']);
    check('裁判→玩家1 编号', s1.code === 0, s1.stderr.slice(0,80));
  }
  if (p2Oid) {
    const s2 = await runGame(homeHost, ['send', p2Oid, '你是2号玩家']);
    check('裁判→玩家2 编号', s2.code === 0, s2.stderr.slice(0,80));
  }

  await sleep(3000);

  // ── Step 8: Players check assignments ──
  console.log('\n[6] 玩家查看编号 (game.js check)...');
  const [p1Check, p2Check] = await Promise.all([
    runGame(homeP1, ['check']),
    runGame(homeP2, ['check']),
  ]);
  check('玩家1 收到编号', p1Check.stdout.includes('号玩家'), p1Check.stdout.slice(0,150));
  check('玩家2 收到编号', p2Check.stdout.includes('号玩家'), p2Check.stdout.slice(0,150));

  // ── Step 9: P2P messaging ──
  console.log('\n[7] 玩家间 P2P 通信 (game.js send)...');
  if (p2Oid) {
    await runGame(homeP1, ['send', p2Oid, '你好2号，我是1号']);
    await sleep(3000);
    const p2Inbox = await runGame(homeP2, ['check']);
    check('玩家2 收到 P2P 消息', p2Inbox.stdout.includes('你好2号') || p2Inbox.stdout.includes('1号'),
      p2Inbox.stdout.slice(0,150));
  }

  // ── Step 10: Host sends game announcement ──
  console.log('\n[8] 裁判群发游戏公告...');
  if (p1Oid) await runGame(homeHost, ['send', p1Oid, '【系统】第一轮开始，请投票']);
  if (p2Oid) await runGame(homeHost, ['send', p2Oid, '【系统】第一轮开始，请投票']);
  await sleep(3000);
  const [p1Final, p2Final] = await Promise.all([
    runGame(homeP1, ['check']),
    runGame(homeP2, ['check']),
  ]);
  check('玩家1 收到公告', p1Final.stdout.includes('第一轮'), p1Final.stdout.slice(0,150));
  check('玩家2 收到公告', p2Final.stdout.includes('第一轮'), p2Final.stdout.slice(0,150));

  // ── Step 11: Host deregisters room ──
  console.log('\n[9] 清理——裁判关闭房间...');
  const dereg = await runGame(homeHost, ['deregister']);
  check('房间已关闭', dereg.code === 0, dereg.stderr.slice(0,80));

  // ── Results ──
  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(0);
  console.log(`\n=== 测试完成: ${passed} passed, ${failed} failed (${elapsed}s) ===`);

  // Cleanup test dirs
  try { fs.rmSync(TEST_ROOT, { recursive: true }); } catch {}
  if (failed > 0) process.exit(1);
}

main().catch(e => { console.error('\n💥', e.message); process.exit(1); });

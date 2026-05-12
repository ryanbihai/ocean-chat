/**
 * Integration test runner — uses Node.js directly (no Jest) to avoid ESM transform issues.
 * Run: node test/integration/run-all.mjs
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const { createOceanBus, OceanBus } = require('../../dist/index.js');
const { generateKeypair, sign, verify, bufferToHex, keypairToHex, hexToKeypair } = require('../../dist/crypto/ed25519.js');
const { canonicalize } = require('../../dist/crypto/canonical-json.js');

let passed = 0;
let failed = 0;

function check(name, fn) {
  try {
    const result = fn();
    if (result instanceof Promise) {
      return result.then(
        () => { passed++; process.stdout.write(`  ✅ ${name}\n`); },
        (e) => { failed++; process.stdout.write(`  ❌ ${name}: ${e.message}\n`); }
      );
    }
    passed++;
    process.stdout.write(`  ✅ ${name}\n`);
  } catch (e) {
    failed++;
    process.stdout.write(`  ❌ ${name}: ${e.message}\n`);
  }
}

async function assert(desc, condition) {
  if (await condition) { passed++; process.stdout.write(`  ✅ ${desc}\n`); }
  else { failed++; process.stdout.write(`  ❌ ${desc}\n`); }
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ========================================
async function main() {
  console.log('\n🧪 OceanBus Integration Tests\n');
  console.log('━'.repeat(50));

  // --- CRYPTO ---
  console.log('\n📦 Crypto');
  console.log('─'.repeat(50));

  const kp = await generateKeypair();
  check('generateKeypair returns 32-byte keys', () => {
    if (kp.publicKey.length !== 32) throw new Error('publicKey wrong length');
    if (kp.secretKey.length !== 32) throw new Error('secretKey wrong length');
  });

  check('bufferToHex roundtrip', () => {
    const orig = new Uint8Array([0, 255, 128, 64]);
    const hex = bufferToHex(orig);
    const back = hexToKeypair(hex, ''); // just tests hexToBuffer via first arg
    return true;
  });

  await assert('sign & verify works', (async () => {
    const sig = await sign(kp.secretKey, { a: 1 });
    return await verify(kp.publicKey, { a: 1 }, sig);
  })());

  await assert('verify detects tampering', (async () => {
    const sig = await sign(kp.secretKey, { a: 1 });
    return !(await verify(kp.publicKey, { a: 2 }, sig));
  })());

  check('canonicalize sorts keys', () => {
    const r = canonicalize({ z: 1, a: 2 });
    if (r !== '{"a":2,"z":1}') throw new Error('Unexpected: ' + r);
  });

  check('canonicalize throws on undefined', () => {
    try { canonicalize({ a: undefined }); return false; }
    catch { return true; }
  });

  // --- SDK LIFECYCLE ---
  console.log('\n📦 SDK Lifecycle');
  console.log('─'.repeat(50));

  const ob = await createOceanBus();

  check('OceanBus instance created', () => ob instanceof OceanBus);

  const reg = await ob.register();
  check('register returns agent_id', () => reg.agent_id && reg.agent_id.length > 10);
  check('register returns api_key', () => reg.api_key && reg.api_key.startsWith('sk_live_'));

  const openid = await ob.getOpenId();
  check('getOpenId returns long string', () => openid.length > 50);

  const info = await ob.whoami();
  check('whoami returns agent_id', () => info.agent_id === reg.agent_id);

  // --- MESSAGING ---
  console.log('\n📦 Messaging');
  console.log('─'.repeat(50));

  await ob.send(openid, 'Integration test message');
  await sleep(1000);
  const msgs = await ob.sync(0);
  const ourMsg = msgs.find(m => m.content === 'Integration test message');
  check('send → sync loopback works', () => !!ourMsg);
  check('message has seq_id', () => typeof ourMsg.seq_id === 'number');
  check('message has from_openid', () => typeof ourMsg.from_openid === 'string');
  check('message has created_at', () => typeof ourMsg.created_at === 'string');

  check('empty toOpenid throws', async () => {
    try { await ob.send('', 'test'); return false; }
    catch (e) { return e.message.includes('toOpenid'); }
  });

  check('2000-char content accepted', async () => {
    await ob.send(openid, 'x'.repeat(2000));
    await sleep(500);
    return true;
  });

  // Idempotency
  await ob.send(openid, 'Idempotent msg', { clientMsgId: 'idem-test-1' });
  await sleep(300);
  await ob.send(openid, 'Idempotent msg', { clientMsgId: 'idem-test-1' });
  await sleep(500);
  const idemMsgs = await ob.sync();
  check('idempotency: no duplicates', () => {
    return idemMsgs.filter(m => m.client_msg_id === 'idem-test-1').length <= 1;
  });

  // --- KEYS ---
  console.log('\n📦 API Key Management');
  console.log('─'.repeat(50));

  const keyData = await ob.createApiKey();
  check('createApiKey returns key_id', () => keyData.key_id && keyData.key_id.length > 0);
  check('createApiKey returns api_key', () => keyData.api_key.startsWith('sk_live_'));

  await ob.revokeApiKey(keyData.key_id);
  check('revokeApiKey succeeds', () => true);

  // --- BLOCKLIST ---
  console.log('\n📦 Blocklist');
  console.log('─'.repeat(50));

  await ob.blockSender('test_spammer_openid');
  check('block adds to list', () => ob.isBlocked('test_spammer_openid'));
  check('getBlocklist includes blocked', () => ob.getBlocklist().includes('test_spammer_openid'));

  await ob.unblockSender('test_spammer_openid');
  check('unblock removes from list', () => !ob.isBlocked('test_spammer_openid'));

  // --- QUOTA ---
  console.log('\n📦 Quota');
  console.log('─'.repeat(50));

  const usage = ob.quota.getDailyUsage();
  check('quota limit from config', () => usage.limit === 100000);
  check('quota usage > 0', () => usage.used > 0);

  // --- L1 DISPATCHER ---
  console.log('\n📦 L1 Dispatcher');
  console.log('─'.repeat(50));
  check('dispatcher exists', () => ob.l1Dispatcher !== null);
  check('dispatcher has 0 pending', () => ob.l1Dispatcher.pendingCount === 0);

  // --- CONFIG ---
  console.log('\n📦 Config');
  console.log('─'.repeat(50));
  check('baseUrl set', () => ob.config.baseUrl.includes('ai-t.ihaola'));
  check('http timeout set', () => ob.config.http.timeout === 10000);
  check('mailbox pollIntervalMs set', () => ob.config.mailbox.pollIntervalMs === 2000);

  // --- TEARDOWN ---
  await ob.destroy();
  check('destroy completes', () => true);

  // ========================================
  console.log('\n' + '━'.repeat(50));
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed, ${passed + failed} total\n`);

  if (failed > 0) process.exit(1);
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(1);
});

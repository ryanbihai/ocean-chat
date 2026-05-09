const { createOceanBus } = require('oceanbus');
const fs = require('fs');
const path = require('path');
const os = require('os');

const SDK_DIR = path.join(os.homedir(), '.oceanbus', 'guess-ai-test-testmotwdwpe');

function loadCreds(role) {
  return JSON.parse(fs.readFileSync(
    path.join(SDK_DIR, role, 'credentials.json'), 'utf8'));
}

async function main() {
  const host = loadCreds('host');
  const player = loadCreds('player1');
  console.log('Host:', host.agent_id.slice(0,16)+'...');
  console.log('Player:', player.agent_id.slice(0,16)+'...');

  // Create host OB and check inbox
  const ob = await createOceanBus({
    keyStore: { type: 'memory' },
    identity: { agent_id: host.agent_id, api_key: host.api_key },
  });
  const hostOpenid = await ob.getOpenId();
  console.log('Host openid:', hostOpenid.slice(0,20)+'...');

  const msgs = await ob.sync(0, 50);
  console.log(`\n[1] Host inbox (since_seq=0): ${msgs.length} msgs`);
  for (const m of msgs) console.log(`  seq=${m.seq_id} "${m.content.slice(0,60)}"`);

  // Player sends a message to host
  console.log('\n[2] Player sends test message...');
  const pob = await createOceanBus({
    keyStore: { type: 'memory' },
    identity: { agent_id: player.agent_id, api_key: player.api_key },
  });
  const ts = Date.now();
  await pob.send(hostOpenid, 'DIRECT-TEST-' + ts);
  await pob.destroy();
  console.log('  Sent. Waiting 5s...');
  await new Promise(r => setTimeout(r, 5000));

  // Host checks again
  const msgs2 = await ob.sync(0, 50);
  console.log(`\n[3] Host inbox after send: ${msgs2.length} msgs`);
  for (const m of msgs2) {
    if (m.content.includes('DIRECT-TEST')) {
      console.log(`  ✅ Found: seq=${m.seq_id} "${m.content}"`);
    }
  }
  
  const found = msgs2.some(m => m.content.includes('DIRECT-TEST'));
  console.log(`\n${found ? '✅ Message received' : '❌ Message NOT received'}`);

  await ob.destroy();
}
main().catch(e => { console.error(e.message); process.exit(1); });

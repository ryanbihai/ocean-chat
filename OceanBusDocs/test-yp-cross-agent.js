const { createOceanBus } = require('oceanbus');
const fs = require('fs');
const path = require('path');
const os = require('os');

const SDK_DIR = path.join(os.homedir(), '.oceanbus', 'guess-ai-test-testmotwdwpe');
const host = JSON.parse(fs.readFileSync(path.join(SDK_DIR, 'host', 'credentials.json'), 'utf8'));
const player = JSON.parse(fs.readFileSync(path.join(SDK_DIR, 'player1', 'credentials.json'), 'utf8'));
const TAGS = ['crossyp', 'x' + Date.now().toString(36)];

async function main() {
  // Host registers
  const hob = await createOceanBus({ keyStore: { type: 'memory' }, identity: { agent_id: host.agent_id, api_key: host.api_key } });
  const hoid = await hob.getOpenId();
  const hkey = await hob.createServiceKey();
  hob.l1.yellowPages.setIdentity(hoid, hkey.signer, hkey.publicKey);
  
  console.log('[Host] registerService...');
  const reg = await hob.l1.yellowPages.registerService(TAGS, 'cross-test');
  console.log('  code:', reg.code);

  // Player discovers
  console.log('\n[Player] discover...');
  const pob = await createOceanBus({ keyStore: { type: 'memory' }, identity: { agent_id: player.agent_id, api_key: player.api_key } });

  for (let i = 1; i <= 5; i++) {
    const r = await pob.l1.yellowPages.discover(TAGS, 5);
    console.log(`  poll #${i}: entries=${r.data?.entries?.length}`);
    if (r.data?.entries?.length > 0) {
      console.log('  ✅ Player found host entry!');
      break;
    }
    await new Promise(r => setTimeout(r, 2000));
  }

  await hob.destroy(); await pob.destroy();
}
main().catch(e => { console.error(e.message); process.exit(1); });

const { createOceanBus } = require('oceanbus');
const fs = require('fs');
const path = require('path');
const os = require('os');

const SDK_DIR = path.join(os.homedir(), '.oceanbus', 'guess-ai-test-testmotwdwpe');
const ROOM = 'gtestmotxatx7'; // from failed test

async function main() {
  const host = JSON.parse(fs.readFileSync(path.join(SDK_DIR, 'host', 'credentials.json'), 'utf8'));
  const player = JSON.parse(fs.readFileSync(path.join(SDK_DIR, 'player1', 'credentials.json'), 'utf8'));

  // Host: check if YP entry exists
  const hob = await createOceanBus({ keyStore: { type: 'memory' }, identity: { agent_id: host.agent_id, api_key: host.api_key } });
  const hostOid = await hob.getOpenId();

  // Player: try YP discovery
  const pob = await createOceanBus({ keyStore: { type: 'memory' }, identity: { agent_id: player.agent_id, api_key: player.api_key } });
  
  console.log('Searching YP for: guess-ai + room-' + ROOM);
  const r = await pob.l1.yellowPages.discover(['guess-ai', 'room-' + ROOM], 5);
  console.log('YP response code:', r.code);
  console.log('YP entries:', r.data?.entries?.length || 0);
  if (r.data?.entries?.length > 0) {
    for (const e of r.data.entries) console.log('  -', e.openid.slice(0,20)+'...', e.description);
  } else {
    console.log('YP raw data:', JSON.stringify(r.data).slice(0,200));
  }

  // Also search with just 'guess-ai'
  console.log('\nSearching with just "guess-ai":');
  const r2 = await pob.l1.yellowPages.discover(['guess-ai'], 10);
  console.log('Entries:', r2.data?.entries?.length || 0);
  for (const e of (r2.data?.entries || []).slice(0,5)) console.log('  -', e.openid.slice(0,20)+'...', (e.tags||[]).join(','), e.description?.slice(0,40));

  await hob.destroy(); await pob.destroy();
}
main().catch(e => { console.error(e.message); process.exit(1); });

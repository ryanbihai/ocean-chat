const { createOceanBus } = require('oceanbus');
const fs = require('fs');
const path = require('path');
const os = require('os');

const SDK_DIR = path.join(os.homedir(), '.oceanbus', 'guess-ai-test-testmotwdwpe');
const host = JSON.parse(fs.readFileSync(path.join(SDK_DIR, 'host', 'credentials.json'), 'utf8'));
const TAGS = ['testyp', 'roundtrip-' + Date.now().toString(36)];

async function main() {
  const ob = await createOceanBus({
    keyStore: { type: 'memory' },
    identity: { agent_id: host.agent_id, api_key: host.api_key },
  });
  const openid = await ob.getOpenId();
  console.log('OpenID:', openid.slice(0,20)+'...');

  // Create service key and set identity
  const key = await ob.createServiceKey();
  ob.l1.yellowPages.setIdentity(openid, key.signer, key.publicKey);

  // Register
  console.log('\n[1] registerService...');
  try {
    const reg = await ob.l1.yellowPages.registerService(TAGS, 'test entry ' + Date.now());
    console.log('  code:', reg.code, 'msg:', reg.msg);
  } catch(e) {
    console.log('  ERROR:', e.message);
  }

  // Discover immediately
  console.log('\n[2] discover...');
  try {
    const r = await ob.l1.yellowPages.discover(TAGS, 5);
    console.log('  code:', r.code, 'entries:', r.data?.entries?.length);
    if (r.data?.entries?.length > 0) {
      for (const e of r.data.entries) console.log('  -', e.openid.slice(0,20)+'...', e.description);
    }
  } catch(e) {
    console.log('  ERROR:', e.message);
  }

  await ob.destroy();
}
main().catch(e => { console.error(e.message); process.exit(1); });

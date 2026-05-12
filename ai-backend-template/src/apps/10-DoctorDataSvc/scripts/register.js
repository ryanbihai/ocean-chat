#!/usr/bin/env node
'use strict';

// One-time OceanBus registration + Yellow Pages publish for doctor-data-svc
// Run: node scripts/register.js

const { createOceanBus } = require('oceanbus');
const fs = require('fs');
const path = require('path');
const os = require('os');

const DATA_DIR = path.join(os.homedir(), '.oceanbus-doctor-data');
const CRED_FILE = path.join(DATA_DIR, 'credentials.json');
const DOCTORS_FILE = path.join(__dirname, '..', 'data', 'doctors.json');

const YP_TAGS = [
  'doctor-data', 'medical',
  '儿科', '内科', '外科', '妇产科', '口腔科', '眼科', '耳鼻喉科',
  '皮肤科', '骨科', '中医科', '精神心理科', '康复科', '儿童保健科',
  '泌尿外科', '神经科', '内分泌科', '呼吸科', '消化科', '心血管科',
  '整形美容科', '肿瘤科', '风湿免疫科', '过敏科', '麻醉科',
  '全科', '新生儿科', '营养科', '疼痛科',
];

function getYPDesc() {
  try {
    const doctors = JSON.parse(fs.readFileSync(DOCTORS_FILE, 'utf-8'));
    const cities = [...new Set(doctors.map(d => d.city))];
    return `医生数据服务。覆盖${cities.join('/')}共${doctors.length}位医生。按城市+科室搜索，返回专家信息。不支持全量导出。`;
  } catch (_) {
    return '医生数据服务。按城市+科室搜索，返回专家信息。';
  }
}

function ensureDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadCredentials() {
  try {
    if (fs.existsSync(CRED_FILE)) return JSON.parse(fs.readFileSync(CRED_FILE, 'utf-8'));
  } catch (_) {}
  return null;
}

function saveCredentials(agentId, apiKey, openid) {
  ensureDir();
  fs.writeFileSync(CRED_FILE, JSON.stringify({
    agent_id: agentId, api_key: apiKey, openid,
    source: 'doctor-data-svc',
    created_at: new Date().toISOString(),
  }, null, 2), { mode: 0o600 });
}

async function main() {
  ensureDir();

  const existing = loadCredentials();
  if (existing) {
    console.log('Already registered. OpenID:', existing.openid.slice(0, 16) + '...');
    console.log('To re-register, delete:', DATA_DIR);
    return;
  }

  console.log('Registering OceanBus agent...');
  const ob = await createOceanBus({ keyStore: { type: 'memory' } });
  const reg = await ob.register();
  const openid = await ob.getOpenId();
  saveCredentials(reg.agent_id, reg.api_key, openid);
  console.log('  OpenID:', openid);

  console.log('Publishing to Yellow Pages...');
  const key = await ob.createServiceKey();
  ob.l1.yellowPages.setIdentity(openid, key.signer, key.publicKey);
  await ob.l1.yellowPages.registerService(YP_TAGS, getYPDesc());
  console.log('  Tags:', YP_TAGS.slice(0, 5).join(', ') + '... (' + YP_TAGS.length + ' total)');

  ob.l1.yellowPages.clearIdentity();
  await ob.destroy();
  console.log('Done. Now run: node scripts/serve.js');
}

main().catch(err => { console.error(err.message); process.exit(1); });

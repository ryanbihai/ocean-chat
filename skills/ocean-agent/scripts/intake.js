#!/usr/bin/env node
'use strict';

// Ocean Agent — 线索管理
//
// 命令:
//   node scripts/intake.js check              查看新消息
//   node scripts/intake.js reply <oid> <msg>   回复客户
//   node scripts/intake.js classify <oid> <stage>  修改线索阶段
//   node scripts/intake.js note <oid> <text>   添加客户备注
//   node scripts/intake.js summary             线索管道总览

const { createOceanBus, RosterService } = require('oceanbus');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ── Config ────────────────────────────────────────────────────────────────
const DATA_DIR = path.join(os.homedir(), '.oceanbus-agent');
const CRED_FILE = path.join(DATA_DIR, 'credentials.json');
const CURSOR_FILE = path.join(DATA_DIR, 'cursor.json');
const LEGACY_CONTACTS_FILE = path.join(DATA_DIR, 'contacts.json');

const SKILL_SOURCE = 'ocean-agent';
const APP_NAME = 'ocean-agent';

// Pipeline stages
const STAGES = ['新线索', '需求采集中', '方案已发', '待成交', '已成交', '已流失'];

// ── Roster ─────────────────────────────────────────────────────────────────

let _roster = null;
function getRoster() {
  if (!_roster) _roster = new RosterService();
  return _roster;
}

/** Migrate old contacts.json to Roster (one-time) */
async function migrateContacts() {
  if (!fs.existsSync(LEGACY_CONTACTS_FILE)) return;
  try {
    const oldContacts = JSON.parse(fs.readFileSync(LEGACY_CONTACTS_FILE, 'utf-8'));
    const roster = getRoster();

    for (const [name, info] of Object.entries(oldContacts)) {
      const data = typeof info === 'string' ? { openid: info } : info;
      const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9一-鿿\-_]/g, '');
      const existing = await roster.get(slug);
      if (existing) continue;

      await roster.add({
        name,
        id: slug,
        openIds: [data.openid],
        tags: [],
        notes: '',
      });

      // Migrate app data
      const appData = {
        stage: data.stage || '新线索',
        preferences: data.preferences || {},
        history: data.notes || [],
        last_contact: data.last_contact || null,
      };
      await roster.updateAppData(slug, APP_NAME, appData);
    }

    fs.renameSync(LEGACY_CONTACTS_FILE, LEGACY_CONTACTS_FILE + '.migrated');
  } catch (_) { /* silently skip */ }
}

// ── Helpers ───────────────────────────────────────────────────────────────

function ensureDir() { fs.mkdirSync(DATA_DIR, { recursive: true }); }

function loadCredentials() {
  if (!fs.existsSync(CRED_FILE)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(CRED_FILE, 'utf-8'));
    if (data.source && data.source !== SKILL_SOURCE) return null;
    return data;
  } catch (_) { return null; }
}

function loadCursor() {
  if (!fs.existsSync(CURSOR_FILE)) return 0;
  try { return JSON.parse(fs.readFileSync(CURSOR_FILE, 'utf-8')).last_seq || 0; } catch (_) { return 0; }
}

function saveCursor(seq) {
  ensureDir();
  fs.writeFileSync(CURSOR_FILE, JSON.stringify({ last_seq: seq }));
}

function shortId(openid) {
  return openid.slice(0, 16) + '...';
}

function formatTime(iso) {
  try { return new Date(iso).toLocaleString('zh-CN', { hour12: false }); } catch (_) { return iso; }
}

function daysAgo(iso) {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  } catch (_) { return '?'; }
}

/** Get app data for a contact, defaults to empty */
function appData(contact) {
  return contact?.apps?.[APP_NAME] || {};
}

/** Find a full Contact by name or OpenID using Roster */
async function findContact(query) {
  const roster = getRoster();

  // Try exact id match first
  let contact = await roster.get(query);
  if (contact) return contact;

  // Try by OpenID
  contact = await roster.findByOpenId(query);
  if (contact) return contact;

  // Fallback: search (returns MatchEntry[]), then load full Contact
  const result = await roster.search(query);
  if (result.exact.length >= 1) {
    return await roster.get(result.exact[0].id);
  }
  if (result.fuzzy.length >= 1) {
    return await roster.get(result.fuzzy[0].id);
  }

  return null;
}

// ── Commands ──────────────────────────────────────────────────────────────

async function cmdCheck() {
  const creds = loadCredentials();
  if (!creds) { console.log('尚未注册。运行: node scripts/profile.js setup'); return; }

  await migrateContacts();

  const lastSeq = loadCursor();
  const roster = getRoster();

  const ob = await createOceanBus({
    keyStore: { type: 'memory' },
    identity: { agent_id: creds.agent_id, api_key: creds.api_key },
  });

  const messages = await ob.sync(lastSeq > 0 ? lastSeq : undefined);

  if (messages.length === 0) {
    console.log('没有新消息。');
  } else {
    let maxSeq = lastSeq;
    for (const msg of messages) {
      const contact = await roster.findByOpenId(msg.from_openid);
      const isNew = !contact;

      console.log('');
      console.log((isNew ? '🆕 ' : '📩 ') + (contact?.name || shortId(msg.from_openid)) + ' · ' + formatTime(msg.created_at));
      console.log('─'.repeat(50));
      console.log(msg.content);
      console.log('');

      const seq = typeof msg.seq_id === 'number' ? msg.seq_id : parseInt(msg.seq_id, 10);
      if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
    }

    if (maxSeq > lastSeq) saveCursor(maxSeq);
  }

  await ob.destroy();
}

async function cmdReply(target, message) {
  if (!target || !message) {
    console.log('用法: node scripts/intake.js reply <名字|OpenID> <消息>');
    return;
  }

  const creds = loadCredentials();
  if (!creds) { console.log('尚未注册。运行: node scripts/profile.js setup'); return; }

  await migrateContacts();

  const roster = getRoster();
  const contact = await findContact(target);
  const openid = contact?.openIds?.[0] || target;
  const displayName = contact?.name || shortId(target);

  const ob = await createOceanBus({
    keyStore: { type: 'memory' },
    identity: { agent_id: creds.agent_id, api_key: creds.api_key },
  });

  await ob.send(openid, message);
  console.log('✅ 已发送 → ' + displayName);

  // Update last contact timestamp in Roster
  if (contact) {
    const ad = appData(contact);
    ad.last_contact = new Date().toISOString();
    await roster.updateAppData(contact.id, APP_NAME, ad);
    await roster.touch(contact.id);
  }

  await ob.destroy();
}

async function cmdClassify(target, stage) {
  if (!target || !stage) {
    console.log('用法: node scripts/intake.js classify <名字|OpenID> <阶段>');
    console.log('阶段: ' + STAGES.join(' | '));
    return;
  }

  if (!STAGES.includes(stage)) {
    console.log('无效阶段: ' + stage);
    console.log('可选: ' + STAGES.join(' | '));
    return;
  }

  await migrateContacts();

  const roster = getRoster();
  const contact = await findContact(target);

  if (!contact) {
    console.log('未找到客户: ' + target);
    return;
  }

  const ad = appData(contact);
  const oldStage = ad.stage || '未知';
  ad.stage = stage;
  await roster.updateAppData(contact.id, APP_NAME, ad);

  console.log('✅ ' + contact.name + ': ' + oldStage + ' → ' + stage);
}

async function cmdNote(target, text) {
  if (!target || !text) {
    console.log('用法: node scripts/intake.js note <名字|OpenID> <备注内容>');
    return;
  }

  await migrateContacts();

  const roster = getRoster();
  const contact = await findContact(target);

  if (!contact) {
    console.log('未找到客户: ' + target);
    return;
  }

  const ad = appData(contact);
  ad.history = ad.history || [];
  ad.history.push({ text, time: new Date().toISOString() });
  await roster.updateAppData(contact.id, APP_NAME, ad);

  console.log('✅ 已为 ' + contact.name + ' 添加备注');
}

async function cmdSummary() {
  await migrateContacts();

  const roster = getRoster();
  const allContacts = await roster.list();

  // Filter to contacts with ocean-agent app data
  const agentContacts = allContacts.filter(c => !!c.apps?.[APP_NAME]);

  if (agentContacts.length === 0) {
    console.log('暂无客户。');
    console.log('开启监听后，新客户会自动出现在这里。');
    return;
  }

  console.log('\n═══ 线索管道总览 ═══');
  console.log('总客户数: ' + agentContacts.length);
  console.log('');

  // Group by stage
  const byStage = {};
  for (const stage of STAGES) byStage[stage] = [];
  byStage['未知'] = [];

  for (const c of agentContacts) {
    const ad = c.apps[APP_NAME] || {};
    const stage = ad.stage || '未知';
    if (!byStage[stage]) byStage[stage] = [];
    byStage[stage].push({ ...c, appData: ad });
  }

  const stageColors = {
    '新线索': '🔵', '需求采集中': '🟡', '方案已发': '🟠',
    '待成交': '🟢', '已成交': '✅', '已流失': '❌', '未知': '⚪'
  };

  for (const stage of STAGES.concat(['未知'])) {
    const items = byStage[stage];
    if (items.length === 0) continue;

    const icon = stageColors[stage] || '⚪';
    console.log(icon + ' ' + stage + ' (' + items.length + '人)');
    for (const c of items) {
      const last = c.appData.last_contact
        ? ' | 最后联系: ' + daysAgo(c.appData.last_contact) + '天前'
        : '';
      const openid = c.openIds?.[0] || '';
      console.log('  - ' + c.name + ' | ' + shortId(openid) + last);
    }
    console.log('');
  }

  // Alerts
  console.log('── 需要关注的线索 ──');
  let alerts = 0;
  const thresholds = { '新线索': 1, '需求采集中': 2, '方案已发': 3, '待成交': 2 };

  for (const [stage, days] of Object.entries(thresholds)) {
    const items = byStage[stage] || [];
    for (const c of items) {
      const ago = c.appData.last_contact ? daysAgo(c.appData.last_contact) : 999;
      if (typeof ago === 'number' && ago >= days) {
        console.log('⚠️  ' + c.name + ' — ' + stage + '阶段，最后联系' + ago + '天前，建议跟进');
        alerts++;
      }
    }
  }

  if (alerts === 0) console.log('✅ 所有线索都在正常跟进周期内');
  console.log('');
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];

  if (!cmd || cmd === 'help' || cmd === '--help') {
    console.log('Ocean Agent — 线索管理');
    console.log('');
    console.log('命令:');
    console.log('  node scripts/intake.js check              查看新消息');
    console.log('  node scripts/intake.js reply <oid> <msg>   回复客户');
    console.log('  node scripts/intake.js classify <oid> <stage>  修改线索阶段');
    console.log('  node scripts/intake.js note <oid> <text>   添加客户备注');
    console.log('  node scripts/intake.js summary             线索管道总览');
    console.log('');
    console.log('线索阶段: ' + STAGES.join(' → '));
    return;
  }

  try {
    switch (cmd) {
      case 'check':    await cmdCheck();   break;
      case 'reply':    await cmdReply(args[1], args.slice(2).join(' ')); break;
      case 'classify': await cmdClassify(args[1], args[2]); break;
      case 'note':     await cmdNote(args[1], args.slice(2).join(' ')); break;
      case 'summary':  await cmdSummary(); break;
      default:
        console.log('未知命令: ' + cmd);
        console.log('运行 "node scripts/intake.js help" 查看帮助。');
    }
  } catch (err) {
    if (err.message && (err.message.includes('ECONNREFUSED') || err.message.includes('ENOTFOUND'))) {
      console.error('无法连接 OceanBus 网络。请检查互联网连接。');
    } else {
      console.error('错误: ' + err.message);
    }
    process.exit(1);
  }
}

main();

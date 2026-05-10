#!/usr/bin/env node
'use strict';

// OceanBus Chat — A2A Communication Skill with Conversation Threading
//
// AI agents communicate, negotiate, and organize multi-topic conversations
// via OceanBus. No server. No same-WiFi. Just the OceanBus network.
//
// Commands:
//   node chat.js setup                        Register + get your OpenID
//   node chat.js whoami                       Show your OpenID
//   node chat.js add <name> <openid>          Save a contact to Roster
//   node chat.js contacts                     List saved contacts (from Roster)
//   node chat.js send <name|openid> <msg>     Send a message (Roster-aware)
//   node chat.js check                        Check for new messages
//   node chat.js thread create <name>         Start a conversation thread
//   node chat.js thread reply <id> <msg>      Reply in a thread
//   node chat.js thread list                  List all threads

const { createOceanBus, RosterService } = require('oceanbus');
const threads = require('./threads');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ── Config ────────────────────────────────────────────────────────────────
// Support --data-dir for per-project CC identity (multi-window scenario)
function getArg(name) {
  const idx = process.argv.indexOf(name);
  return (idx >= 0 && idx + 1 < process.argv.length) ? process.argv[idx + 1] : null;
}
const DATA_DIR = getArg('--data-dir') || path.join(os.homedir(), '.oceanbus-chat');
const CRED_FILE = path.join(DATA_DIR, 'credentials.json');
const CURSOR_FILE = path.join(DATA_DIR, 'cursor.json');
const DATE_LOG_FILE = path.join(DATA_DIR, 'date-log.json');
const LEGACY_CONTACTS_FILE = path.join(DATA_DIR, 'contacts.json');

const SKILL_SOURCE = 'ocean-chat';

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

    for (const [name, openid] of Object.entries(oldContacts)) {
      const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9一-鿿\-_]/g, '');
      const existing = await roster.get(slug);
      if (existing) continue; // already migrated

      await roster.add({
        name,
        id: slug,
        agents: [{ agentId: '', openId: openid, purpose: 'OceanBus 联系人', isDefault: true }],
        tags: [],
        aliases: [],
        notes: '',
        source: 'chat',
      });
    }

    // Rename old file as backup
    fs.renameSync(LEGACY_CONTACTS_FILE, LEGACY_CONTACTS_FILE + '.migrated');
  } catch (_) { /* silently skip if migration fails */ }
}

// ── Helpers ───────────────────────────────────────────────────────────────

function ensureDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function saveCredentials(agentId, apiKey, openid) {
  ensureDir();
  fs.writeFileSync(CRED_FILE, JSON.stringify({
    agent_id: agentId, api_key: apiKey, openid: openid,
    source: SKILL_SOURCE, created_at: new Date().toISOString()
  }, null, 2));
}

function loadCredentials() {
  if (!fs.existsSync(CRED_FILE)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(CRED_FILE, 'utf-8'));
    if (data.source && data.source !== SKILL_SOURCE) return null;
    return data;
  } catch (_) { return null; }
}

function saveCursor(seq) {
  ensureDir();
  fs.writeFileSync(CURSOR_FILE, JSON.stringify({ last_seq: seq }));
}

function loadCursor() {
  if (!fs.existsSync(CURSOR_FILE)) return 0;
  try { return JSON.parse(fs.readFileSync(CURSOR_FILE, 'utf-8')).last_seq || 0; } catch (_) { return 0; }
}

function formatTime(iso) {
  try { return new Date(iso).toLocaleTimeString('zh-CN', { hour12: false }); } catch (_) { return iso; }
}

function shortId(openid) {
  return openid.slice(0, 16) + '...';
}

/** Detect and format a protocol message for display */
function formatProtocolDisplay(content) {
  return threads.formatProtocolDisplay(content);
}

// ── Date log ──────────────────────────────────────────────────────────────

function loadDateLog() {
  if (!fs.existsSync(DATE_LOG_FILE)) return { entries: [], availability: { hints: '', blocked: [] } };
  try { return JSON.parse(fs.readFileSync(DATE_LOG_FILE, 'utf-8')); } catch (_) { return { entries: [], availability: { hints: '', blocked: [] } }; }
}

function saveDateLog(log) {
  ensureDir();
  fs.writeFileSync(DATE_LOG_FILE, JSON.stringify(log, null, 2));
}

// ── Subcommands ───────────────────────────────────────────────────────────

async function cmdSetup() {
  ensureDir();
  await migrateContacts(); // one-time migration

  const existing = loadCredentials();
  if (existing) {
    const roster = getRoster();
    const contacts = await roster.list();

    console.log('🛡️  身份已存在 — 不会重新注册。');
    console.log('');
    console.log('你的 OpenID: ' + existing.openid);
    console.log('(简写: ' + shortId(existing.openid) + ')');
    console.log('存储位置: ' + CRED_FILE);
    console.log('');
    console.log('⚠️  绝对不要删除这个文件！删除后 OpenID 永久作废，');
    console.log('   所有联系人都会发消息到死地址。');
    console.log('');

    if (contacts.length > 0) {
      console.log('通讯录中有 ' + contacts.length + ' 位联系人:');
      for (const c of contacts) {
        const openid = c.agents[0]?.openId || '';
        console.log('  - ' + c.name + (openid ? ' (' + shortId(openid) + ')' : ''));
      }
      console.log('');
    }

    console.log('让对方用这个命令加你为好友:');
    console.log('  node chat.js add <你的名字> ' + existing.openid);
    return;
  }

  console.log('正在注册 OceanBus 身份...');

  const ob = await createOceanBus({ keyStore: { type: 'memory' } });
  let openid;
  try {
    const reg = await ob.register();
    openid = await ob.getOpenId();
    saveCredentials(reg.agent_id, reg.api_key, openid);
  } catch (e) {
    if (typeof e.isRateLimited === 'function' && e.isRateLimited()) {
      const wait = e.retryAfterSeconds
        ? `${Math.ceil(e.retryAfterSeconds / 3600)} 小时`
        : '一段时间';
      console.error(`注册频率受限，请等待 ${wait} 后重试。`);
    } else {
      console.error('OceanBus 注册失败: ' + e.message);
    }
    await ob.destroy();
    process.exit(1);
  }
  await ob.destroy();

  console.log('');
  console.log('注册成功！你的 OceanBus 地址:');
  console.log('');
  console.log('  ' + openid);
  console.log('');
  console.log('现在你可以:');
  console.log('  ① 把这个 OpenID 发给朋友');
  console.log('  ② 朋友用: node chat.js add <你的名字> ' + openid);
  console.log('  ③ 你也加上朋友: node chat.js add <朋友名字> <朋友的OpenID>');
  console.log('  ④ 开始通信！');
}

async function cmdWhoami() {
  const creds = loadCredentials();
  if (!creds) {
    console.log('尚未注册。运行: node chat.js setup');
    return;
  }
  console.log(creds.openid);
}

async function cmdAdd(name, openid) {
  if (!name || !openid) {
    console.log('用法: node chat.js add <名字> <OpenID>');
    console.log('例如: node chat.js add 李四 ob_c-QrzaDzhf7OR...');
    return;
  }

  await migrateContacts();

  const roster = getRoster();
  const id = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9一-鿿\-_]/g, '');

  // Check if contact already exists
  const existing = await roster.get(id);
  if (existing && existing.status === 'active') {
    // Add additional agent if different OpenID
    const hasAgent = existing.agents.some(a => a.openId === openid);
    if (!hasAgent) {
      await roster.update(id, {
        agents: [...existing.agents, { agentId: '', openId: openid, purpose: 'OceanBus 联系人', isDefault: false }],
      });
      console.log('已为 ' + name + ' 添加新的 Agent 地址');
    } else {
      console.log(name + ' 已存在，无需重复添加');
    }
    return;
  }

  await roster.add({
    name,
    id,
    agents: [{ agentId: '', openId: openid, purpose: 'OceanBus 联系人', isDefault: true }],
    tags: [],
    aliases: [],
    notes: '',
    source: 'chat',
  });

  console.log('已添加联系人: ' + name + ' (' + shortId(openid) + ')');
  console.log('现在可以用名字发消息: node chat.js send ' + name + ' <消息>');
}

async function cmdContacts() {
  await migrateContacts();

  const roster = getRoster();
  const contacts = await roster.list();

  if (contacts.length === 0) {
    console.log('通讯录为空。');
    console.log('添加联系人: node chat.js add <名字> <OpenID>');
    return;
  }
  console.log('通讯录 (' + contacts.length + ' 人):');
  for (const c of contacts) {
    const openid = c.agents[0]?.openId || '';
    const tagStr = c.tags.length > 0 ? ' [' + c.tags.join(', ') + ']' : '';
    console.log('  ' + c.name + ' — ' + shortId(openid) + tagStr);
  }
}

async function cmdSend(target, message, fromName) {
  const creds = loadCredentials();
  if (!creds) {
    console.log('尚未注册。运行: node chat.js setup');
    return;
  }

  if (!target || !message) {
    console.log('用法: node chat.js send <名字|OpenID> <消息> [--from <你的名字>]');
    return;
  }

  await migrateContacts();

  const roster = getRoster();

  // Resolve target using Roster search
  const searchResult = await roster.search(target);
  let openid, displayName;

  if (searchResult.exact.length === 1) {
    const contact = searchResult.exact[0];
    openid = contact.agents[0]?.openId || target;
    displayName = contact.name;
    await roster.touch(contact.id);
  } else if (searchResult.exact.length > 1) {
    // Multiple exact matches — use the first one with agents
    const withAgent = searchResult.exact.find(e => e.agents.length > 0);
    if (withAgent) {
      openid = withAgent.agents[0].openId;
      displayName = withAgent.name;
    } else {
      openid = target;
      displayName = target;
    }
  } else if (searchResult.fuzzy.length > 0) {
    const contact = searchResult.fuzzy[0];
    openid = contact.agents[0]?.openId || target;
    displayName = contact.name;
    await roster.touch(contact.id);
  } else {
    // Treat as raw OpenID
    openid = target;
    displayName = shortId(target);
  }

  // Build message with optional From/To headers
  let body = message;
  if (fromName) {
    const sep = '─'.repeat(32);
    body = `From: ${fromName}\nTo: ${displayName}\n${sep}\n${message}`;
  }

  const ob = await createOceanBus({
    keyStore: { type: 'memory' },
    identity: { agent_id: creds.agent_id, api_key: creds.api_key },
  });

  await ob.send(openid, body);

  console.log('已发送 → ' + displayName);
  await ob.destroy();
}

async function cmdCheck() {
  const creds = loadCredentials();
  if (!creds) {
    console.log('尚未注册。运行: node chat.js setup');
    return;
  }

  await migrateContacts();

  const lastSeq = loadCursor();

  const ob = await createOceanBus({
    keyStore: { type: 'memory' },
    identity: { agent_id: creds.agent_id, api_key: creds.api_key },
  });

  const roster = getRoster();
  const messages = await ob.sync(lastSeq > 0 ? lastSeq : undefined);

  if (messages.length === 0) {
    console.log('没有新消息。');
  } else {
    let maxSeq = lastSeq;

    for (const msg of messages) {
      const contact = await roster.findByOpenId(msg.from_openid);
      const from = contact
        ? contact.name + ' (' + shortId(msg.from_openid) + ')'
        : msg.from_openid;

      // Handle thread protocol
      const threadResult = threads.handleThreadProtocol(msg, true, contact?.name || null);

      console.log('── 来自 ' + from + ' ──');
      console.log('  ' + formatTime(msg.created_at));

      if (threadResult) {
        console.log('  [' + (threadResult.thread_id || '').slice(0, 14) + '...]'
          + (threadResult.subject ? ' ' + threadResult.subject : ''));
      }
      console.log('');
      if (threadResult && threadResult.displayText) {
        console.log(threadResult.displayText);
      } else {
        const protocolDisplay = formatProtocolDisplay(msg.content);
        console.log(protocolDisplay || msg.content);
      }
      console.log('');

      const seq = typeof msg.seq_id === 'number' ? msg.seq_id : parseInt(msg.seq_id, 10);
      if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
    }

    if (maxSeq > lastSeq) saveCursor(maxSeq);
  }

  await ob.destroy();
}

// ── Date ──────────────────────────────────────────────────────────────────

async function cmdDate(target, type, opts) {
  const creds = loadCredentials();
  if (!creds) { console.log('尚未注册。运行: node chat.js setup'); return; }
  if (!target || !type) {
    console.log('用法: node chat.js date <名字> <类型> [--time <ISO>] [--location <地点>] [--notes <备注>]');
    console.log('类型: proposal | counter | accept | reject | withdraw');
    return;
  }

  const validTypes = ['proposal', 'counter', 'accept', 'reject', 'withdraw'];
  if (!validTypes.includes(type)) {
    console.log('无效类型: ' + type + '。可选: ' + validTypes.join(', '));
    return;
  }

  await migrateContacts();

  const roster = getRoster();
  const searchResult = await roster.search(target);
  let openid, displayName;

  if (searchResult.exact.length === 1) {
    openid = searchResult.exact[0].agents[0]?.openId || target;
    displayName = searchResult.exact[0].name;
  } else if (searchResult.fuzzy.length > 0) {
    openid = searchResult.fuzzy[0].agents[0]?.openId || target;
    displayName = searchResult.fuzzy[0].name;
  } else {
    console.log('未找到联系人: ' + target);
    return;
  }

  const payload = {};
  if (opts.time) payload.time = opts.time;
  if (opts.location) payload.location = opts.location;
  if (opts.notes) payload.notes = opts.notes;

  const msg = JSON.stringify({
    type: 'protocol',
    protocol: 'ocean-date/negotiate/v1',
    structured: { type, payload },
  });

  const ob = await createOceanBus({
    keyStore: { type: 'memory' },
    identity: { agent_id: creds.agent_id, api_key: creds.api_key },
  });

  await ob.send(openid, msg);
  await roster.touch(searchResult.exact[0]?.id || searchResult.fuzzy[0]?.id);

  const typeLabel = { proposal: '提案', counter: '反提案', accept: '接受', reject: '拒绝', withdraw: '撤回' };
  console.log('📅 ' + typeLabel[type] + ' → ' + displayName);
  if (payload.time) console.log('  时间: ' + payload.time);
  if (payload.location) console.log('  地点: ' + payload.location);

  // Auto-block on accept
  if (type === 'accept' && payload.time) {
    const log = loadDateLog();
    log.entries.push({
      id: 'date_' + Date.now(),
      title: (payload.notes || '与 ' + displayName + ' 的约会'),
      time: payload.time,
      location: payload.location || '',
      with: searchResult.exact[0]?.id || searchResult.fuzzy[0]?.id || target,
      status: 'confirmed',
      createdAt: new Date().toISOString(),
    });
    if (!log.availability.blocked.includes(payload.time)) {
      log.availability.blocked.push(payload.time);
    }
    saveDateLog(log);
    console.log('  📌 已加入你的日程（自动 blocked）');
  }

  await ob.destroy();
}

// ── Availability ──────────────────────────────────────────────────────────

async function cmdAvailability(args) {
  if (args[0] === 'set') {
    const text = args.slice(1).join(' ');
    if (!text) { console.log('用法: node chat.js availability set <你的空闲时间描述>'); return; }
    const log = loadDateLog();
    log.availability.hints = text;
    log.availability.updatedAt = new Date().toISOString();
    saveDateLog(log);
    console.log('✅ 空闲偏好已更新: ' + text);
    console.log('Agent 协商时将自动参考此偏好，不再反复打扰你。');
  } else {
    const log = loadDateLog();
    const a = log.availability;
    console.log('📅 你的空闲偏好: ' + (a.hints || '（未设置）'));
    if (a.blocked.length > 0) {
      console.log('⛔ 已占用的时间:');
      a.blocked.forEach(t => {
        const entry = log.entries.find(e => e.time === t);
        console.log('  ' + t + (entry ? ' — ' + entry.title : ''));
      });
    }
    if (log.entries.length > 0) {
      console.log('📋 已确认的约会 (' + log.entries.filter(e => e.status === 'confirmed').length + '):');
      log.entries.filter(e => e.status === 'confirmed').forEach(e => {
        console.log('  ' + e.time + ' — ' + e.title + (e.location ? ' @ ' + e.location : ''));
      });
    }
    if (!a.hints && a.blocked.length === 0) console.log('设置: node chat.js availability set "工作日晚7点后，周末全天"');
  }
}

// ── Yellow Pages ──────────────────────────────────────────────────────────

async function cmdPublish(name) {
  const creds = loadCredentials();
  if (!creds) { console.log('尚未注册。运行: node chat.js setup'); return; }
  if (!name) { console.log('用法: node chat.js publish <你的名字>'); return; }

  const ob = await createOceanBus({
    keyStore: { type: 'memory' },
    identity: { agent_id: creds.agent_id, api_key: creds.api_key },
  });

  const key = await ob.createServiceKey();
  ob.l1.yellowPages.setIdentity(creds.openid, key.signer, key.publicKey);

  try {
    await ob.l1.yellowPages.registerService(
      ['ocean-chat', name],
      name + ' 的 Ocean Chat 地址'
    );
    console.log('已发布到黄页。朋友可以通过以下命令找到你:');
    console.log('  node chat.js discover ' + name);
  } catch (e) {
    if (e.message && e.message.includes('11000')) {
      console.log('你已经发布过了。如需更新: node chat.js publish ' + name);
    } else {
      console.log('发布失败: ' + e.message);
    }
  }

  ob.l1.yellowPages.clearIdentity();
  await ob.destroy();
}

async function cmdDiscover(name) {
  if (!name) { console.log('用法: node chat.js discover <名字>'); return; }

  const creds = loadCredentials();
  const ob = creds ? await createOceanBus({
    keyStore: { type: 'memory' },
    identity: { agent_id: creds.agent_id, api_key: creds.api_key },
  }) : await createOceanBus({ keyStore: { type: 'memory' } });

  try {
    const r = await ob.l1.yellowPages.discover(['ocean-chat', name], 5);
    if (r.data && r.data.entries && r.data.entries.length > 0) {
      console.log('找到 ' + name + ':');
      for (const e of r.data.entries) {
        console.log('  OpenID: ' + e.openid);
        console.log('  描述: ' + e.description);
        console.log('');
        console.log('添加为联系人: node chat.js add ' + name + ' ' + e.openid);
      }
    } else {
      console.log('未找到: ' + name);
      console.log('对方可能尚未发布。让对方运行: node chat.js publish ' + name);
    }
  } catch (e) {
    console.log('搜索失败: ' + e.message);
  }

  await ob.destroy();
}

async function cmdUnpublish() {
  const creds = loadCredentials();
  if (!creds) { console.log('尚未注册。运行: node chat.js setup'); return; }

  const ob = await createOceanBus({
    keyStore: { type: 'memory' },
    identity: { agent_id: creds.agent_id, api_key: creds.api_key },
  });

  const key = await ob.createServiceKey();
  ob.l1.yellowPages.setIdentity(creds.openid, key.signer, key.publicKey);

  try {
    await ob.l1.yellowPages.deregisterService();
    console.log('已从黄页移除。');
  } catch (e) {
    console.log('移除失败: ' + e.message);
  }

  await ob.destroy();
}

async function cmdListen(onMessage) {
  const creds = loadCredentials();
  if (!creds) { console.log('尚未注册。运行: node chat.js setup'); return; }

  await migrateContacts();

  const ob = await createOceanBus({
    keyStore: { type: 'memory' },
    identity: { agent_id: creds.agent_id, api_key: creds.api_key },
  });

  const roster = getRoster();

  if (onMessage) {
    console.log('[Ocean Chat] 实时监听中... 收到消息时会执行: ' + onMessage);
  } else {
    console.log('[Ocean Chat] 实时监听中... 按 Ctrl+C 停止');
  }
  console.log('');

  ob.startListening(async (msg) => {
    let contact = await roster.findByOpenId(msg.from_openid);
    // Auto-add unknown sender to Roster so 'send <name>' works immediately
    if (!contact) {
      // Try to extract a name from From: header in message body
      let autoName = null;
      const fromMatch = msg.content.match(/^From:\s*(.+)$/m);
      if (fromMatch) autoName = fromMatch[1].trim();
      if (!autoName) autoName = '小龙虾';
      try {
        await roster.add({ name: autoName, source: 'auto' });
        const added = await roster.findByOpenId(msg.from_openid);
        if (added) {
          contact = added;
          console.log('[Roster] 自动添加联系人: ' + autoName + ' (' + shortId(msg.from_openid) + ')');
        }
      } catch (_) { /* ignore duplicate */ }
    }
    const fromName = contact ? contact.name : null;
    const from = fromName
      ? fromName + ' (' + shortId(msg.from_openid) + ')'
      : msg.from_openid;
    const time = formatTime(msg.created_at);

    // Parse optional From/To headers from message body
    const headerRE = /^From:\s*(.+)\nTo:\s*(.+)\n([-─]{8,})\n/;
    const headerMatch = msg.content.match(headerRE);
    let body = msg.content;
    let msgFrom = null, msgTo = null;
    if (headerMatch) {
      msgFrom = headerMatch[1].trim();
      msgTo = headerMatch[2].trim();
      body = msg.content.slice(headerMatch[0].length);
      // Update fromName for --on-message hook: prefer header From over Roster
      if (!fromName && msgFrom) {
        // Roster may not have this contact yet; use header as fallback
      }
    }

    // Handle thread protocol
    const threadResult = threads.handleThreadProtocol(msg, true, contact?.name || null);

    process.stdout.write('\r\x1b[K');
    console.log('── ' + from + ' · ' + time + ' ──');
    if (threadResult) {
      console.log('  [' + (threadResult.thread_id || '').slice(0, 14) + '...]'
        + (threadResult.subject ? ' ' + threadResult.subject : ''));
    }
    if (msgFrom && msgTo) {
      console.log('  ' + msgFrom + ' → ' + msgTo);
    }
    if (threadResult && threadResult.displayText) {
      console.log(threadResult.displayText);
    } else {
      const protocolDisplay = formatProtocolDisplay(body);
      console.log(protocolDisplay || body);
    }
    console.log('');

    // --on-message hook (use parsed body, not raw content)
    if (onMessage) {
      if (onMessage === 'task-file') {
        // Built-in: queue task to file — no claude CLI, no escaping issues
        const taskQueuePath = path.join(DATA_DIR, 'task-queue.json');
        let queue = [];
        try { queue = JSON.parse(fs.readFileSync(taskQueuePath, 'utf-8')); } catch (_) {}
        queue.push({
          from: msgFrom || fromName || msg.from_openid,
          openid: msg.from_openid,
          content: body,
          time: time,
          received: new Date().toISOString(),
          status: 'pending'
        });
        fs.writeFileSync(taskQueuePath, JSON.stringify(queue, null, 2));
        console.log('[task-file] 任务已入队: ' + taskQueuePath);
      } else {
        // Legacy: execute custom command with template substitution
        const hookFrom = msgFrom || fromName || msg.from_openid;
        const escaped = (s) => s.replace(/"/g, '\\"');
        const cmd = onMessage
          .replace(/\{from\}/g, escaped(hookFrom))
          .replace(/\{openid\}/g, escaped(msg.from_openid))
          .replace(/\{content\}/g, escaped(body))
          .replace(/\{time\}/g, escaped(time));
        exec(cmd, (err, stdout, stderr) => {
          if (err) {
            console.error('[on-message] 钩子执行失败: ' + err.message);
          } else {
            if (stdout.trim()) console.log('[on-message] ' + stdout.trim());
            if (stderr.trim()) console.error('[on-message] ' + stderr.trim());
          }
        });
      }
    }
  });

  await new Promise(() => {});
}

// ── Thread ──────────────────────────────────────────────────────────────────

async function cmdThreadCreate(target, subject, payloadStr) {
  const creds = loadCredentials();
  if (!creds) { console.log('尚未注册。运行: node chat.js setup'); return; }
  if (!target || !subject) {
    console.log('用法: node chat.js thread create <名字> --subject "主题" [--payload \'{"key":"value"}\']');
    return;
  }

  await migrateContacts();
  const roster = getRoster();

  const searchResult = await roster.search(target);
  let openid, displayName;
  if (searchResult.exact.length > 0) {
    openid = searchResult.exact[0].agents[0]?.openId || target;
    displayName = searchResult.exact[0].name;
  } else if (searchResult.fuzzy.length > 0) {
    openid = searchResult.fuzzy[0].agents[0]?.openId || target;
    displayName = searchResult.fuzzy[0].name;
  } else {
    console.log('未找到联系人: ' + target);
    return;
  }

  let payload = {};
  if (payloadStr) {
    try { payload = JSON.parse(payloadStr); } catch (_) {
      console.log('payload 格式无效，需为合法 JSON');
      return;
    }
  }

  const tid = threads.createThread(openid, displayName, subject, payload);

  const msg = JSON.stringify({
    type: 'protocol',
    protocol: 'ocean-thread/v1',
    structured: { action: 'create', thread_id: tid, subject, payload },
  });

  const ob = await createOceanBus({
    keyStore: { type: 'memory' },
    identity: { agent_id: creds.agent_id, api_key: creds.api_key },
  });
  await ob.send(openid, msg);
  await ob.destroy();

  console.log('🧵 已创建线程 → ' + displayName);
  console.log('   ID: ' + tid);
  console.log('   主题: ' + subject);
}

async function cmdThreadReply(threadId, message) {
  const creds = loadCredentials();
  if (!creds) { console.log('尚未注册。运行: node chat.js setup'); return; }
  if (!threadId || !message) {
    console.log('用法: node chat.js thread reply <thread_id> <消息>');
    return;
  }

  const t = threads.getThread(threadId);
  if (!t) {
    console.log('线程不存在: ' + threadId);
    console.log('查看所有线程: node chat.js thread list');
    return;
  }
  if (t.status === 'resolved') {
    console.log('线程已关闭，请先重开: node chat.js thread reopen ' + threadId);
    return;
  }

  const msg = JSON.stringify({
    type: 'protocol',
    protocol: 'ocean-thread/v1',
    structured: {
      action: 'reply', thread_id: threadId,
      subject: t.subject, payload: { text: message },
    },
  });

  const ob = await createOceanBus({
    keyStore: { type: 'memory' },
    identity: { agent_id: creds.agent_id, api_key: creds.api_key },
  });
  await ob.send(t.participant, msg);
  await ob.destroy();

  // Record locally only after send succeeds
  threads.addMessage(threadId, 'sent', message, null);

  console.log('💬 已回复线程 [' + threadId.slice(0, 14) + '...] -> ' + t.participant_name);
}

function cmdThreadList() {
  const all = threads.listThreads();
  if (all.length === 0) {
    console.log('暂无对话线程。');
    console.log('创建线程: node chat.js thread create <名字> --subject "主题"');
    return;
  }

  const active = all.filter(t => t.status === 'active');
  const resolved = all.filter(t => t.status === 'resolved');

  if (active.length > 0) {
    console.log('活跃对话 (' + active.length + '):\n');
    for (const t of active.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))) {
      const time = new Date(t.updated_at).toLocaleTimeString('zh-CN', { hour12: false });
      console.log('  ' + t.thread_id.slice(0, 14) + '...  ' + t.subject);
      console.log('    对方: ' + (t.participant_name || t.participant.slice(0, 16) + '...') +
        ' | ' + t.messages.length + '条消息 | ' + time);
      console.log('');
    }
  }

  if (resolved.length > 0) {
    console.log('已结束对话 (' + resolved.length + '):\n');
    for (const t of resolved.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))) {
      const time = new Date(t.updated_at).toLocaleTimeString('zh-CN', { hour12: false });
      console.log('  ' + t.thread_id.slice(0, 14) + '...  ' + t.subject + '  ✅ ' + time);
    }
    console.log('');
  }
}

function cmdThreadShow(threadId) {
  if (!threadId) {
    console.log('用法: node chat.js thread show <thread_id>');
    return;
  }

  let t = threads.getThread(threadId);
  if (!t) {
    const all = threads.listThreads();
    t = all.find(t => t.thread_id.startsWith(threadId));
    if (!t) { console.log('线程不存在: ' + threadId); return; }
  }

  const statusIcon = t.status === 'active' ? '🟢' : '✅';
  const created = new Date(t.created_at).toLocaleString('zh-CN');
  console.log('线程: ' + t.subject);
  console.log('状态: ' + statusIcon + ' ' + t.status +
    ' | 对方: ' + (t.participant_name || t.participant.slice(0, 16) + '...') +
    ' | 创建: ' + created);
  console.log('ID: ' + t.thread_id);
  console.log('');

  if (t.messages.length === 0) {
    console.log('  (暂无消息)');
  } else {
    for (const m of t.messages) {
      const dir = m.direction === 'sent' ? '->' : '<-';
      const time = new Date(m.timestamp).toLocaleTimeString('zh-CN', { hour12: false });
      console.log('  ' + dir + ' ' + time + '  ' + m.content);
    }
  }
  console.log('');
}

async function cmdThreadResolve(threadId) {
  const creds = loadCredentials();
  if (!creds) { console.log('尚未注册。运行: node chat.js setup'); return; }
  if (!threadId) {
    console.log('用法: node chat.js thread resolve <thread_id>');
    return;
  }

  const t = threads.getThread(threadId);
  if (!t) { console.log('线程不存在: ' + threadId); return; }

  const msg = JSON.stringify({
    type: 'protocol',
    protocol: 'ocean-thread/v1',
    structured: { action: 'resolve', thread_id: t.thread_id, subject: t.subject },
  });

  const ob = await createOceanBus({
    keyStore: { type: 'memory' },
    identity: { agent_id: creds.agent_id, api_key: creds.api_key },
  });
  await ob.send(t.participant, msg);
  await ob.destroy();

  threads.resolveThread(threadId);

  console.log('✅ 已结束线程: ' + t.subject);
}

async function cmdThreadReopen(threadId) {
  const creds = loadCredentials();
  if (!creds) { console.log('尚未注册。运行: node chat.js setup'); return; }
  if (!threadId) {
    console.log('用法: node chat.js thread reopen <thread_id>');
    return;
  }

  let t = threads.getThread(threadId);
  if (!t || t.status !== 'resolved') {
    console.log('线程不存在或未关闭: ' + threadId);
    return;
  }

  const msg = JSON.stringify({
    type: 'protocol',
    protocol: 'ocean-thread/v1',
    structured: { action: 'reopen', thread_id: t.thread_id, subject: t.subject },
  });

  const ob = await createOceanBus({
    keyStore: { type: 'memory' },
    identity: { agent_id: creds.agent_id, api_key: creds.api_key },
  });
  await ob.send(t.participant, msg);
  await ob.destroy();

  threads.reopenThread(threadId);

  console.log('🔄 已重开线程: ' + t.subject);
}

// ── Task Queue ──────────────────────────────────────────────────────────────

function cmdTasks(action) {
  const taskQueuePath = path.join(DATA_DIR, 'task-queue.json');
  if (!fs.existsSync(taskQueuePath)) {
    console.log('任务队列为空。');
    return;
  }

  let queue;
  try { queue = JSON.parse(fs.readFileSync(taskQueuePath, 'utf-8')); } catch (_) {
    console.log('任务队列为空。');
    return;
  }

  if (action === 'clear') {
    fs.unlinkSync(taskQueuePath);
    console.log('已清空任务队列。');
    return;
  }

  const pending = queue.filter(t => t.status === 'pending');
  const done = queue.filter(t => t.status === 'done');

  if (queue.length === 0) {
    console.log('任务队列为空。');
    return;
  }

  if (pending.length > 0) {
    console.log('待处理任务 (' + pending.length + '):\n');
    pending.forEach((t, i) => {
      console.log('  [' + (i + 1) + '] 来自: ' + t.from + ' (' + t.time + ')');
      console.log('      ' + t.content.slice(0, 80) + (t.content.length > 80 ? '...' : ''));
      console.log('');
    });
  }

  if (done.length > 0) {
    console.log('已完成 (' + done.length + '):');
    done.forEach(t => {
      console.log('  ✓ ' + t.from + ' — ' + t.content.slice(0, 60) + (t.content.length > 60 ? '...' : ''));
    });
    console.log('');
    console.log('清空已完成: node chat.js tasks clear');
  }
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  // Strip global --data-dir flag before command dispatch (already consumed in Config)
  const ddIdx = args.indexOf('--data-dir');
  if (ddIdx >= 0) args.splice(ddIdx, 2);

  const cmd = args[0];

  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
    console.log('OceanBus Chat — Agent 会面协商');
    console.log('');
    console.log('命令:');
    console.log('  node chat.js setup                      注册 + 获取你的 OpenID');
    console.log('  node chat.js whoami                     查看你的 OpenID');
    console.log('  node chat.js add <名字> <OpenID>        添加联系人（存入 Roster）');
    console.log('  node chat.js contacts                   查看通讯录（读取 Roster）');
    console.log('  node chat.js send <名字|OpenID> <消息>  发送消息');
    console.log('    --from <你的名字>                     附加 From/To 消息头（多 CC 场景）');
    console.log('  node chat.js check                      查看新消息');
    console.log('  node chat.js listen                     实时监听（消息自动弹出）');
    console.log('  node chat.js listen --on-message "cmd"  收到消息时执行命令');
    console.log('    模板变量: {from} {openid} {content} {time}');
    console.log('    --on-message task-file                 内置模式：写入任务队列（推荐）');
    console.log('  node chat.js tasks [clear]              查看/清空任务队列');
    console.log('  node chat.js publish <名字>             发布到黄页（让朋友搜到你）');
    console.log('  node chat.js discover <名字>            搜索朋友的 OpenID');
    console.log('  node chat.js unpublish                  从黄页移除');
    console.log('  node chat.js date <名字> <类型>         发送 Date 协商消息');
    console.log('     --time <ISO> --location <地点> --notes <备注>');
    console.log('  node chat.js availability [set <描述>]  查看/设置空闲偏好');
    console.log('  node chat.js thread create <名字>       创建对话线程');
    console.log('       --subject "主题" [--payload \'{"k":"v"}\']');
    console.log('  node chat.js thread reply <id> <消息>   在线程中回复');
    console.log('  node chat.js thread list                列出所有线程');
    console.log('  node chat.js thread show <id>           查看线程详情');
    console.log('  node chat.js thread resolve <id>        结束线程');
    console.log('  node chat.js thread reopen <id>         重开已结束线程');
    console.log('');
    console.log('数据存储在: ' + DATA_DIR + ' （通讯录存储在 ~/.oceanbus/roster.json）');
    console.log('');
    console.log('全局选项:');
    console.log('  --data-dir <路径>   使用指定目录存储身份和数据（多 CC 窗口场景）');
    console.log('');
    console.log('  node chat.js pm2-init <CC名字>         生成 PM2 ecosystem 配置文件（一键启动）');
    console.log('    pm2 start .oceanbus-cc/ecosystem.config.json  # 然后运行这个');
    return;
  }

  try {
    switch (cmd) {
      case 'setup':
        await cmdSetup();
        break;
      case 'whoami':
        await cmdWhoami();
        break;
      case 'add':
        await cmdAdd(args[1], args[2]);
        break;
      case 'contacts':
        await cmdContacts();
        break;
      case 'send': {
        const target = args[1];
        // Parse --from flag
        let fromName = null;
        const fromIdx = args.indexOf('--from');
        if (fromIdx >= 0 && fromIdx + 1 < args.length) {
          fromName = args[fromIdx + 1];
          // Remove --from and its value from args before building message
          args.splice(fromIdx, 2);
        }
        const msg = args.slice(2).join(' ');
        if (!target || !msg) {
          console.log('用法: node chat.js send <名字|OpenID> <消息> [--from <你的名字>]');
          break;
        }
        await cmdSend(target, msg, fromName);
        break;
      }
      case 'check':
        await cmdCheck();
        break;
      case 'listen': {
        // Parse --on-message flag
        let onMsg = null;
        const onMsgIdx = args.indexOf('--on-message');
        if (onMsgIdx >= 0 && onMsgIdx + 1 < args.length) {
          onMsg = args[onMsgIdx + 1];
        }
        await cmdListen(onMsg);
        break;
      }
      case 'publish':
        await cmdPublish(args[1]);
        break;
      case 'discover':
        await cmdDiscover(args[1]);
        break;
      case 'unpublish':
        await cmdUnpublish();
        break;
      case 'date': {
        const target = args[1];
        const type = args[2];
        // Parse --time, --location, --notes flags from remaining args
        const opts = {};
        for (let i = 3; i < args.length; i++) {
          if (args[i] === '--time' && i + 1 < args.length) { opts.time = args[++i]; }
          else if (args[i] === '--location' && i + 1 < args.length) { opts.location = args[++i]; }
          else if (args[i] === '--notes' && i + 1 < args.length) { opts.notes = args[++i]; }
        }
        await cmdDate(target, type, opts);
        break;
      }
      case 'availability':
        await cmdAvailability(args.slice(1));
        break;
      case 'tasks':
        cmdTasks(args[1]);
        break;
      case 'thread': {
        const sub = args[1];
        if (sub === 'create') {
          // Parse --subject and --payload flags
          let subject = '', payload = null;
          for (let i = 2; i < args.length; i++) {
            if (args[i] === '--subject' && i + 1 < args.length) { subject = args[++i]; }
            else if (args[i] === '--payload' && i + 1 < args.length) { payload = args[++i]; }
            else if (i === 2) { subject = args[i]; } // positional subject (backward compat)
          }
          await cmdThreadCreate(args[2] && !args[2].startsWith('--') ? args[2] : null, subject, payload);
        } else if (sub === 'reply') {
          await cmdThreadReply(args[2], args.slice(3).join(' '));
        } else if (sub === 'list') {
          cmdThreadList();
        } else if (sub === 'show') {
          cmdThreadShow(args[2]);
        } else if (sub === 'resolve') {
          await cmdThreadResolve(args[2]);
        } else if (sub === 'reopen') {
          await cmdThreadReopen(args[2]);
        } else {
          console.log('thread 子命令: create | reply | list | show | resolve | reopen');
          console.log('运行 "node chat.js help" 查看详细帮助。');
        }
        break;
      }
      case 'pm2-init': {
        const ccName = args[1] || ('CC-' + path.basename(process.cwd()));
        fs.mkdirSync(DATA_DIR, { recursive: true });
        const scriptPath = path.resolve(__filename);
        // Use built-in task-file mode — no claude CLI, no escaping issues
        const config = {
          apps: [{
            name: `ob-${ccName.replace(/^CC-/, '')}`,
            script: scriptPath,
            args: `--data-dir ${DATA_DIR} listen --on-message task-file`,
          }]
        };
        const configPath = path.join(DATA_DIR, 'ecosystem.config.json');
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        console.log('已生成: ' + configPath);
        console.log('');
        console.log('启动命令:');
        console.log('  pm2 start ' + configPath);
        console.log('  pm2 save');
        break;
      }
      default:
        console.log('未知命令: ' + cmd);
        console.log('运行 "node chat.js help" 查看帮助。');
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

#!/usr/bin/env node
'use strict';

// Ocean Agent — 声誉管理
//
// 命令:
//   node scripts/reputation.js check           查询自己的声誉档案
//   node scripts/reputation.js check <oid>    查询指定代理人的声誉
//   node scripts/reputation.js tag <oid> <text> 为对方打标签

const { createOceanBus } = require('oceanbus');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ── Config ────────────────────────────────────────────────────────────────
const DATA_DIR = path.join(os.homedir(), '.oceanbus-agent');
const CRED_FILE = path.join(DATA_DIR, 'credentials.json');
const CONTACTS_FILE = path.join(DATA_DIR, 'contacts.json');

const SKILL_SOURCE = 'ocean-agent';

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

function loadContacts() {
  ensureDir();
  if (!fs.existsSync(CONTACTS_FILE)) return {};
  try { return JSON.parse(fs.readFileSync(CONTACTS_FILE, 'utf-8')); } catch (_) { return {}; }
}

function resolveName(openid, contacts) {
  for (const [name, info] of Object.entries(contacts)) {
    const id = typeof info === 'string' ? info : info.openid;
    if (id === openid) return name;
  }
  return null;
}

function shortId(openid) {
  return openid.slice(0, 16) + '...';
}

// ── Commands ──────────────────────────────────────────────────────────────

async function cmdCheck(target) {
  const creds = loadCredentials();
  if (!creds) { console.log('尚未注册。运行: node scripts/profile.js setup'); return; }

  const contacts = loadContacts();
  const openid = target || creds.openid;
  const displayName = target
    ? (resolveName(target, contacts) || shortId(target))
    : '你自己';

  const ob = await createOceanBus({
    keyStore: { type: 'memory' },
    identity: { agent_id: creds.agent_id, api_key: creds.api_key },
  });

  if (!ob.l1 || !ob.l1.reputation) {
    console.log('当前 SDK 版本不支持声誉查询。请升级 oceanbus 或等待 L1 服务开放。');
    await ob.destroy();
    return;
  }

  try {
    const result = await ob.l1.reputation.queryReputation([openid]);

    console.log('\n═══ 声誉档案: ' + displayName + ' ═══');
    console.log('OpenID: ' + shortId(openid));
    console.log('');

    if (result && result.data && result.data.results) {
      const entry = result.data.results.find(r => r.openid === openid) || result.data.results[0];
      if (!entry || entry.error) {
        console.log('暂无声誉数据。');
        console.log('成交后，引导客户通过 OceanBus 为你打标签，积累声誉。');
        await ob.destroy();
        return;
      }

      const f = entry.facts;

      // ── 身份 ──
      if (f && f.identity) {
        console.log('── 身份 ──');
        console.log('  注册时间: ' + (f.identity.registered_at || '未知'));
        console.log('  活跃天数: ' + f.identity.days_active + ' 天');
        console.log('');
      }

      // ── 通信 ──
      if (f && f.communication) {
        console.log('── 通信 ──');
        console.log('  发送消息: ' + f.communication.messages_sent.toLocaleString());
        console.log('  接收消息: ' + f.communication.messages_received.toLocaleString());
        console.log('  历史伙伴: ' + f.communication.unique_partners + ' 人');
        if (f.communication.partners_30d) {
          console.log('  近期伙伴: ' + f.communication.partners_30d + ' 人 (30天)');
        }
        console.log('');
      }

      // ── 评价（标签）──
      if (f && f.evaluations) {
        const tags = f.evaluations.tags || {};
        const tagEntries = Object.entries(tags);
        if (tagEntries.length > 0) {
          console.log('── 他人评价 ──');
          console.log('  独立评价人: ' + f.evaluations.unique_taggers + ' 人');
          console.log('');
          for (const [label, count] of tagEntries) {
            const icon = label === '可靠' ? '✅' : label === '骚扰' ? '⚠️' : label === '违法' ? '🚫' : '🏷️';
            console.log('  ' + icon + ' ' + label + ': ' + count + ' 次');
          }
          console.log('');
        }

        if (f.evaluations.recent_tags && f.evaluations.recent_tags.length > 0) {
          console.log('  最近评价:');
          for (const t of f.evaluations.recent_tags) {
            const date = t.applied_at ? t.applied_at.slice(0, 10) : '?';
            console.log('    ' + date + ' — ' + t.label);
          }
          console.log('');
        }
      } else {
        // Fallback: old core_tags / free_tags
        if (entry.core_tags) {
          console.log('── 他人评价 ──');
          for (const [label, count] of Object.entries(entry.core_tags)) {
            const icon = label === '可靠' ? '✅' : label === '骚扰' ? '⚠️' : label === '违法' ? '🚫' : '🏷️';
            console.log('  ' + icon + ' ' + label + ': ' + count + ' 次');
          }
          console.log('');
        }
        if (entry.free_tags) {
          console.log('── 自由标签 ──');
          for (const [label, count] of Object.entries(entry.free_tags)) {
            console.log('  🏷️ ' + label + ': ' + count + ' 次');
          }
          console.log('');
        }
      }

      // ── 交易 ──
      if (f && f.trade && f.trade.contracts_total > 0) {
        console.log('── 交易 ──');
        const rate = f.trade.contracts_total > 0
          ? (f.trade.contracts_fulfilled / f.trade.contracts_total * 100).toFixed(1)
          : '0';
        console.log('  合约总数: ' + f.trade.contracts_total);
        console.log('  履约: ' + f.trade.contracts_fulfilled + ' / 违约: ' + f.trade.contracts_broken);
        console.log('  履约率: ' + rate + '%');
        console.log('  交易量: ' + f.trade.total_volume.toLocaleString() + ' 金币');
        console.log('');
      }

      // ── 举报 ──
      if (f && f.reports) {
        const against = f.reports.filed_against || [];
        if (against.length > 0) {
          console.log('── 举报记录 ──');
          console.log('  被举报: ' + against.length + ' 次');
          for (const r of against) {
            console.log('    [' + r.type + '] ' + (r.timestamp || '?').slice(0, 10) + ' — 举报人: ' + shortId(r.reporter));
          }
          console.log('');
        }
      }

      // ── 综合判断提示 ──
      const reliable = (entry.core_tags && entry.core_tags['可靠']) || 0;
      const harassment = (entry.core_tags && entry.core_tags['骚扰']) || 0;
      const illegal = (entry.core_tags && entry.core_tags['违法']) || 0;

      console.log('── 综合 ──');
      if (reliable > 0 && harassment === 0 && illegal === 0) {
        console.log('✅ 声誉良好 — 可以信任');
      } else if (harassment > 0 || illegal > 0) {
        console.log('⚠️  有风险标签 — 请谨慎');
      } else {
        console.log('⚪ 声誉数据较少 — 尚待积累');
      }
      console.log('');
      console.log('💡 以上为客观事实数据，具体信任判断由你（或你的 AI）自行做出。');
    } else {
      console.log('暂无声誉数据。');
      console.log('成交后，引导客户通过 OceanBus 为你打标签，积累声誉。');
    }
  } catch (e) {
    console.log('查询失败: ' + e.message);
  }

  console.log('');
  await ob.destroy();
}

async function cmdTag(target, text) {
  if (!target || !text) {
    console.log('用法: node scripts/reputation.js tag <名字|OpenID> <标签内容>');
    console.log('例如: node scripts/reputation.js tag 张三 "沟通顺畅，需求明确"');
    return;
  }

  const creds = loadCredentials();
  if (!creds) { console.log('尚未注册。运行: node scripts/profile.js setup'); return; }

  const contacts = loadContacts();
  const entry = contacts[target];
  const contactOpenid = (entry && typeof entry === 'object') ? entry.openid : (entry || target);
  const displayName = entry ? target : shortId(target);

  // ── Confirmation gate ──────────────────────────────────────────────────
  console.log('\n┌──────────────────────────────────────────────┐');
  console.log('│ ⚠️  即将写入 OceanBus 声誉标签（公开不可撤回）  │');
  console.log('├──────────────────────────────────────────────┤');
  console.log('│                                              │');
  console.log('│  打标签人: ' + creds.openid.slice(0, 20) + '...(你)  '.padEnd(46) + '│');
  console.log('│  被打标签人: ' + displayName.padEnd(34) + '│');
  console.log('│  标签内容: ' + text.padEnd(34) + '│');
  console.log('│                                              │');
  console.log('│  该标签将:                                     │');
  console.log('│  · 公开可见，所有 OceanBus Agent 可查到         │');
  console.log('│  · 以你的 Ed25519 密钥签名，不可抵赖            │');
  console.log('│  · 写入后不可撤回                              │');
  console.log('│                                              │');
  console.log('└──────────────────────────────────────────────┘');
  console.log('');
  console.log('确认打标签？输入 yes 继续，其他任意键取消:');

  const readline = require('readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise(resolve => {
    rl.question('> ', ans => { rl.close(); resolve(ans.trim()); });
  });

  if (answer !== 'yes') {
    console.log('已取消。');
    return;
  }
  // ── End confirmation gate ──────────────────────────────────────────────

  const ob = await createOceanBus({
    keyStore: { type: 'memory' },
    identity: { agent_id: creds.agent_id, api_key: creds.api_key },
  });

  if (!ob.l1 || !ob.l1.reputation) {
    console.log('当前 SDK 版本不支持声誉打标签。请升级 oceanbus 或等待 L1 服务开放。');
    await ob.destroy();
    return;
  }

  try {
    await ob.l1.reputation.tag(contactOpenid, text);
    console.log('✅ 已为 ' + displayName + ' 打标签: ' + text);
  } catch (e) {
    console.log('打标签失败: ' + e.message);
  }

  await ob.destroy();
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];

  if (!cmd || cmd === 'help' || cmd === '--help') {
    console.log('Ocean Agent — 声誉管理');
    console.log('');
    console.log('命令:');
    console.log('  node scripts/reputation.js check           查询自己的声誉档案');
    console.log('  node scripts/reputation.js check <oid>    查询指定代理人的声誉');
    console.log('  node scripts/reputation.js tag <oid> <text> 为对方打标签');
    console.log('');
    console.log('声誉数据基于 OceanBus L1 Reputation Service。');
    console.log('标签规则: 需要双向通信 + 交互超过1小时 + 至少5条消息。');
    return;
  }

  try {
    switch (cmd) {
      case 'check': await cmdCheck(args[1]); break;
      case 'tag':   await cmdTag(args[1], args.slice(2).join(' ')); break;
      default:
        console.log('未知命令: ' + cmd);
        console.log('运行 "node scripts/reputation.js help" 查看帮助。');
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

#!/usr/bin/env node
/**
 * CC Agent — OB message handler for WeChat Gateway
 *
 * Receives structured OB commands from wechat-cc Gateway,
 * executes them via claude spawn, and replies via OB.
 *
 * 用法:
 *   node cc-agent.cjs                    # 启动监听（默认 data-dir）
 *   node cc-agent.cjs --auto-exec        # 自动执行模式（spawn claude）
 *   node cc-agent.cjs --data-dir <dir>   # 指定 OB 身份目录
 *   node cc-agent.cjs --gateway <openid> # 指定网关 OB OpenID
 */

const { createOceanBus, RosterService } = require('oceanbus');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ── Config ────────────────────────────────────────────────────
function getArg(name) {
  const idx = process.argv.indexOf(name);
  return (idx >= 0 && idx + 1 < process.argv.length) ? process.argv[idx + 1] : null;
}

const DATA_DIR = getArg('--data-dir') || path.join(os.homedir(), '.oceanbus-chat');
const CRED_FILE = path.join(DATA_DIR, 'credentials.json');
const AUTO_EXEC = process.argv.includes('--auto-exec');
const GATEWAY_OPENID = getArg('--gateway');

// ── Main ──────────────────────────────────────────────────────
async function main() {
  // 1. Load OB identity
  if (!fs.existsSync(CRED_FILE)) {
    console.error('❌ 未注册 OB 身份。请先运行 ocean-chat 的 setup 或 wechat-cc 的 wechat-up。');
    process.exit(1);
  }
  const creds = JSON.parse(fs.readFileSync(CRED_FILE, 'utf-8'));
  if (!creds.agent_id || !creds.api_key) {
    console.error('❌ OB 凭证无效。');
    process.exit(1);
  }
  console.log('🆔 CC Agent');
  console.log('   OpenID: ' + creds.openid.slice(0, 5) + '...');
  console.log('   模式:   ' + (AUTO_EXEC ? '自动执行 (spawn claude)' : '仅显示消息'));
  console.log('');

  // 2. Connect OB
  const ob = await createOceanBus({
    keyStore: { type: 'memory' },
    identity: { agent_id: creds.agent_id, api_key: creds.api_key, openid: creds.openid },
  });

  const roster = new RosterService();

  // 3. OB message handler
  ob.startListening(async (msg) => {
    if (msg.from_openid === creds.openid) return; // skip self

    // Resolve sender
    let contact = await roster.findByOpenId(msg.from_openid);
    if (!contact) {
      // Auto-add Gateway as contact
      try {
        await roster.add({ name: 'WeChat-Gateway', openIds: [msg.from_openid] });
        contact = await roster.findByOpenId(msg.from_openid);
        console.log('[Roster] 自动添加: WeChat-Gateway');
      } catch (_) {}
    }
    const fromName = contact?.name || 'Gateway';

    // Parse structured message
    const raw = msg.content || '';
    let parsed;
    try { parsed = JSON.parse(raw); } catch (_) { parsed = { action: 'command', text: raw }; }

    const action = parsed.action || 'command';
    const text = parsed.text || raw;
    const meta = parsed.meta || {};

    const time = new Date(msg.created_at || Date.now()).toLocaleTimeString('zh-CN', { hour12: false });

    // Display
    if (process.stdout.isTTY) process.stdout.write('\r\x1b[K');
    console.log('── ' + fromName + ' · ' + time + ' ──');
    console.log('  Agent: ' + (meta.agent_name || '?'));
    console.log('  Route: ' + (meta.route_prefix || '?'));
    console.log('  From:  ' + (meta.from_wx_user || '?').slice(0, 30));
    console.log('  ' + text);
    console.log('');

    // Auto-exec mode
    if (AUTO_EXEC && text.trim()) {
      console.log('[auto-exec] 开始执行: ' + text.slice(0, 80));
      try {
        const result = await new Promise((resolve, reject) => {
          const child = spawn('claude', ['-p', text, '--dangerously-skip-permissions'], {
            cwd: process.cwd(),
            stdio: ['ignore', 'pipe', 'pipe'],
          });
          const timer = setTimeout(() => { child.kill(); reject(new Error('执行超时 (5 分钟)')); }, 300000);
          let out = '', err = '';
          child.stdout.on('data', d => out += d);
          child.stderr.on('data', d => err += d);
          child.on('close', code => {
            clearTimeout(timer);
            if (code === 0 && out.trim()) resolve(out.trim());
            else reject(new Error(err.trim() || `exit ${code}`));
          });
          child.on('error', e => { clearTimeout(timer); reject(e); });
        });

        console.log('[auto-exec] 完成');

        // Reply via OB to Gateway
        const replyTo = GATEWAY_OPENID || msg.from_openid;
        if (replyTo.length < 20) {
          // Need valid OpenID
          console.error('[auto-exec] 无法回复: Gateway OpenID 未知。请用 --gateway 指定。');
          return;
        }

        const reply = JSON.stringify({
          action: 'reply',
          text: result,
          meta: {
            to_wx_user: meta.from_wx_user || '',
            reply_to: meta.message_id || '',
            agent_name: meta.agent_name || 'CC-Agent',
          },
        });

        await ob.send(replyTo, reply);
        console.log('[→GW] 已回复 Gateway');
      } catch (e) {
        console.error('[auto-exec] 失败: ' + e.message);
        // Send error back
        const replyTo = GATEWAY_OPENID || msg.from_openid;
        if (replyTo.length > 20) {
          const errorReply = JSON.stringify({
            action: 'reply',
            text: '任务执行失败: ' + e.message,
            meta: {
              to_wx_user: meta.from_wx_user || '',
              reply_to: meta.message_id || '',
              agent_name: meta.agent_name || 'CC-Agent',
            },
          });
          try { await ob.send(replyTo, errorReply); } catch (_) {}
        }
      }
    }
  });

  // Keep alive
  await new Promise(() => {});
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });

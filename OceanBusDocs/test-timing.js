// 测量消息传播延迟
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const GAME_JS = path.join(__dirname, '..', 'skills', 'guess-ai', 'game.js');
const ROOM = `timetest${Date.now().toString(36)}`;
const TEST_ROOT = path.join(os.homedir(), '.oceanbus', 'guess-ai-e2e-gtestmotwv75k');

function runGame(home, args) {
  return new Promise(resolve => {
    const child = spawn('node', [GAME_JS, ...args], {
      env: { ...process.env, HOME: home, USERPROFILE: home },
      timeout: 30000
    });
    let out = ''; let err = '';
    child.stdout.on('data', d => out += d.toString());
    child.stderr.on('data', d => err += d.toString());
    child.on('close', code => resolve({ code, stdout: out, stderr: err }));
    child.on('error', e => resolve({ code: -1, stdout: '', stderr: e.message }));
  });
}

async function main() {
  const homeHost = path.join(TEST_ROOT, 'host');
  const homeP1 = path.join(TEST_ROOT, 'player1');

  console.log('Host create room...');
  await runGame(homeHost, ['host', ROOM]);
  await new Promise(r => setTimeout(r, 3000));

  console.log('Player join...');
  const start = Date.now();
  await runGame(homeP1, ['join', ROOM]);

  // 轮询直到裁判收到消息
  let elapsed;
  for (let i = 1; i <= 30; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const check = await runGame(homeHost, ['check']);
    if (check.stdout.includes('加入')) {
      elapsed = ((Date.now() - start) / 1000).toFixed(1);
      console.log(`Host saw "加入" at +${elapsed}s (poll #${i})`);
      break;
    }
    process.stdout.write(`  poll #${i} (+${i}s): no messages yet\n`);
  }

  // cleanup
  await runGame(homeHost, ['deregister']);
  console.log(`\nTotal propagation time: ${elapsed}s`);
}
main();

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const GAME_JS = path.join(__dirname, '..', 'skills', 'guess-ai', 'game.js');
const ROOM = `dbg${Date.now().toString(36)}`;
const SDK_DIR = path.join(os.homedir(), '.oceanbus', 'guess-ai-test-testmotwdwpe');
const TEST_ROOT = path.join(os.homedir(), '.oceanbus', `cursor-debug-${ROOM}`);

fs.mkdirSync(TEST_ROOT, { recursive: true });

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
  });
}

function readCursor(home) {
  const f = path.join(home, '.oceanbus', 'seq_cursor.json');
  if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8')).last_seq;
  return 'MISSING';
}

function seedCreds(role, home) {
  const src = path.join(SDK_DIR, role, 'credentials.json');
  const dstDir = path.join(home, '.oceanbus', 'guess-ai');
  const dst = path.join(dstDir, 'credentials.json');
  fs.mkdirSync(dstDir, { recursive: true });
  fs.copyFileSync(src, dst);
}

async function main() {
  const hh = path.join(TEST_ROOT, 'host');
  const ph = path.join(TEST_ROOT, 'player1');
  seedCreds('host', hh);
  seedCreds('player1', ph);

  console.log('Cursor before host:  ', readCursor(hh));

  // Host creates room
  console.log('\n--- Host creates room ---');
  const hostRoom = await runGame(hh, ['host', ROOM]);
  console.log('Cursor after host:   ', readCursor(hh));
  
  await new Promise(r => setTimeout(r, 3000));

  // Player joins
  console.log('\n--- Player joins ---');
  const pjoin = await runGame(ph, ['join', ROOM]);
  console.log('Join stdout:', pjoin.stdout.slice(0,100));
  console.log('Join stderr:', pjoin.stderr.slice(0,100));
  
  await new Promise(r => setTimeout(r, 5000));

  // Host checks
  console.log('\n--- Host checks ---');
  console.log('Cursor before check:', readCursor(hh));
  const check = await runGame(hh, ['check']);
  console.log('Check stdout:', check.stdout.slice(0,200));
  console.log('Check stderr:', check.stderr.slice(0,200));
  console.log('Cursor after check: ', readCursor(hh));

  // cleanup
  await runGame(hh, ['deregister']);
  fs.rmSync(TEST_ROOT, { recursive: true, force: true });
}
main();

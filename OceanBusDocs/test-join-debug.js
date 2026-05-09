const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const GAME_JS = path.join(__dirname, '..', 'skills', 'guess-ai', 'game.js');
const SDK_DIR = path.join(os.homedir(), '.oceanbus', 'guess-ai-test-testmotwdwpe');
const ROOM = `jdbg${Date.now().toString(36)}`;
const TAGS = ['guess-ai', 'room-' + ROOM];

function runGame(home, args) {
  return new Promise(resolve => {
    const child = spawn('node', [GAME_JS, ...args], {
      env: { ...process.env, HOME: home, USERPROFILE: home },
      timeout: 60000
    });
    let out = ''; let err = '';
    child.stdout.on('data', d => { out += d.toString(); process.stdout.write(d); });
    child.stderr.on('data', d => { err += d.toString(); process.stderr.write(d); });
    child.on('close', code => resolve({ code, stdout: out, stderr: err }));
  });
}

function seed(home, role) {
  const d = path.join(home, '.oceanbus', 'guess-ai');
  fs.mkdirSync(d, { recursive: true });
  fs.copyFileSync(path.join(SDK_DIR, role, 'credentials.json'), path.join(d, 'credentials.json'));
}

async function main() {
  const T = path.join(os.homedir(), '.oceanbus', 'join-debug-' + ROOM);
  const hh = path.join(T, 'host'); const ph = path.join(T, 'player');
  fs.mkdirSync(T, { recursive: true }); fs.mkdirSync(hh, { recursive: true }); fs.mkdirSync(ph, { recursive: true });
  seed(hh, 'host'); seed(ph, 'player1');

  console.log('=== Host creates room ===\n');
  await runGame(hh, ['host', ROOM]);
  
  console.log('\n(waiting 3s for YP propagation)\n');
  await new Promise(r => setTimeout(r, 3000));
  
  console.log('=== Player joins ===\n');
  await runGame(ph, ['join', ROOM]);

  // Cleanup
  await runGame(hh, ['deregister']);
  fs.rmSync(T, { recursive: true, force: true });
}
main();

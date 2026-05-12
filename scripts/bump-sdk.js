#!/usr/bin/env node
'use strict';

// bump-sdk.js -- upgrade oceanbus SDK dependency across all skills
// Usage:
//   node scripts/bump-sdk.js --status       show current versions
//   node scripts/bump-sdk.js 0.4.10 0.5.0   upgrade all
//   node scripts/bump-sdk.js 0.4.10 0.5.0 --check  dry run

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function readPkg(dir) {
  const p = path.join(ROOT, dir, 'package.json');
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

function writePkg(dir, pkg) {
  const p = path.join(ROOT, dir, 'package.json');
  fs.writeFileSync(p, JSON.stringify(pkg, null, 2) + '\n');
}

function extractVersion(range) {
  return (range || '').replace(/^[\^~>=<]+\s*/, '');
}

// --status
if (process.argv.includes('--status')) {
  console.log('SDK dependency versions across skills:\n');

  const skillDirs = fs.readdirSync(path.join(ROOT, 'skills'))
    .filter(d => fs.existsSync(path.join(ROOT, 'skills', d, 'package.json')));

  const versions = new Map();
  for (const dir of skillDirs) {
    const pkg = readPkg('skills/' + dir);
    const dep = (pkg && pkg.dependencies && pkg.dependencies.oceanbus) || '(none)';
    const ver = extractVersion(dep);
    if (!versions.has(ver)) versions.set(ver, []);
    versions.get(ver).push(dir);
  }

  const keys = [...versions.keys()];
  for (const ver of keys) {
    const icon = keys.length > 1 && ver !== keys[0] ? '!!' : '  ';
    console.log(icon + ' oceanbus ' + ver + ':');
    for (const s of versions.get(ver)) console.log('    - ' + s);
  }

  if (keys.length > 1) {
    console.log('\n!! Version mismatch! Run bump-sdk to unify.');
  } else {
    console.log('\nOK: All skills on same version.');
  }
  process.exit(0);
}

// upgrade mode
const args = process.argv.filter(a => !a.startsWith('--'));
const fromVersion = args[2];
const toVersion = args[3];
const checkOnly = process.argv.includes('--check');

if (!fromVersion || !toVersion) {
  console.error('Usage: node scripts/bump-sdk.js <fromVersion> <toVersion> [--check]');
  console.error('       node scripts/bump-sdk.js --status');
  console.error('Example: node scripts/bump-sdk.js 0.4.10 0.5.0');
  process.exit(1);
}

const skillDirs = fs.readdirSync(path.join(ROOT, 'skills'))
  .filter(d => fs.existsSync(path.join(ROOT, 'skills', d, 'package.json')));

const changes = [];

for (const dir of skillDirs) {
  const relPath = 'skills/' + dir;
  const pkg = readPkg(relPath);
  if (!pkg || !pkg.dependencies || !pkg.dependencies.oceanbus) continue;

  const currentDep = pkg.dependencies.oceanbus;
  const currentVer = extractVersion(currentDep);

  if (currentVer !== fromVersion) {
    console.warn('SKIP ' + dir + ': current ' + currentDep + ' (expected ' + fromVersion + ')');
    continue;
  }

  pkg.dependencies.oceanbus = '^' + toVersion;
  changes.push({ dir, relPath, from: currentDep, to: '^' + toVersion });
  if (!checkOnly) writePkg(relPath, pkg);
}

// integrations
const integrations = [
  'ai-backend-template/src/apps/03-OceanBusSDK/integrations/mcp-server',
  'ai-backend-template/src/apps/03-OceanBusSDK/integrations/langchain',
];

for (const intDir of integrations) {
  const pkg = readPkg(intDir);
  if (!pkg || !pkg.dependencies || !pkg.dependencies.oceanbus) continue;

  const currentDep = pkg.dependencies.oceanbus;
  const currentVer = extractVersion(currentDep);

  if (currentVer !== fromVersion) {
    console.warn('SKIP ' + path.basename(intDir) + ': current ' + currentDep + ' (expected ' + fromVersion + ')');
    continue;
  }

  pkg.dependencies.oceanbus = '^' + toVersion;
  changes.push({ dir: path.basename(intDir), relPath: intDir, from: currentDep, to: '^' + toVersion });
  if (!checkOnly) writePkg(intDir, pkg);
}

if (changes.length === 0) {
  console.log('No packages to update.');
  process.exit(0);
}

if (checkOnly) {
  console.log('\nWould update (--check mode, not writing):');
  for (const c of changes) console.log('  ' + c.dir + ': ' + c.from + ' -> ' + c.to);
  console.log('\nTotal: ' + changes.length + ' packages. Remove --check to execute.');
} else {
  console.log('\nUpdated ' + changes.length + ' packages:');
  for (const c of changes) console.log('  ' + c.dir + ': ' + c.from + ' -> ' + c.to);
  console.log('\nRun tests then commit.');
}

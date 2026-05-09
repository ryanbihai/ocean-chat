#!/usr/bin/env node
// OceanBus CLI entry point
// After tsc compiles, this file requires dist/cli/index.js

const path = require('path');
const fs = require('fs');

// Determine the source root: bin/ lives next to dist/
const distRoot = path.join(__dirname, '..', 'dist');
const cliEntry = path.join(distRoot, 'cli', 'index.js');

if (fs.existsSync(cliEntry)) {
  const { runCli } = require(cliEntry);
  runCli();
} else {
  // Development mode: try ts-node or fallback
  try {
    require('ts-node').register({
      project: path.join(__dirname, '..', 'tsconfig.json'),
    });
    const { runCli } = require(path.join(__dirname, '..', 'src', 'cli', 'index'));
    runCli();
  } catch (tsErr) {
    console.error('OceanBus CLI is not built. Run `npx tsc` first.');
    console.error('Or install ts-node: npm install -g ts-node');
    process.exit(1);
  }
}

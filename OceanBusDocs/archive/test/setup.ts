// Global test setup for OceanBus SDK tests
// Ensure fresh state for each test file

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const testDir = path.join(os.tmpdir(), 'oceanbus-test');

export function getTestDir(): string {
  const dir = path.join(testDir, `test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function cleanupTestDir(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch { /* ignore cleanup errors */ }
}

import { SeqCursor } from '../../../src/mailbox/cursor';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('SeqCursor', () => {
  let filePath: string;
  let cursor: SeqCursor;

  beforeEach(() => {
    filePath = path.join(os.tmpdir(), `cursor-test-${Date.now()}.json`);
    cursor = new SeqCursor(filePath);
  });

  afterEach(() => {
    try { fs.unlinkSync(filePath); } catch { /* ok */ }
  });

  it('starts at 0', () => {
    expect(cursor.get()).toBe(0);
  });

  it('sets higher values', () => {
    cursor.set(100);
    expect(cursor.get()).toBe(100);
  });

  it('does not decrease', () => {
    cursor.set(100);
    cursor.set(50);  // should not go backwards
    expect(cursor.get()).toBe(100);
  });

  it('ignores non-safe integers', () => {
    cursor.set(100);
    cursor.set(Infinity);
    expect(cursor.get()).toBe(100);
    cursor.set(NaN);
    expect(cursor.get()).toBe(100);
  });

  it('persists and loads', async () => {
    cursor.set(42);
    await cursor.save();

    const cursor2 = new SeqCursor(filePath);
    await cursor2.load();
    expect(cursor2.get()).toBe(42);
  });

  it('resets to 0', async () => {
    cursor.set(999);
    await cursor.save();
    await cursor.reset();
    expect(cursor.get()).toBe(0);

    const cursor2 = new SeqCursor(filePath);
    await cursor2.load();
    expect(cursor2.get()).toBe(0);
  });
});

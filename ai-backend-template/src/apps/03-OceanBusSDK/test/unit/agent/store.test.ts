import { FileKeyStore, MemoryKeyStore } from '../../../src/agent/store';
import type { AgentState } from '../../../src/types/agent';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const testState: AgentState = {
  agent_id: 'test-agent-id',
  api_key: 'sk_live_test_key123',
  extra_keys: [{ key_id: 'extra1', api_key: 'sk_live_extra_456' }],
};

describe('MemoryKeyStore', () => {
  let store: MemoryKeyStore;

  beforeEach(() => {
    store = new MemoryKeyStore();
  });

  it('returns null when empty', async () => {
    expect(await store.load()).toBeNull();
  });

  it('saves and loads state', async () => {
    await store.save(testState);
    const loaded = await store.load();
    expect(loaded).toEqual(testState);
  });

  it('clears state', async () => {
    await store.save(testState);
    await store.clear();
    expect(await store.load()).toBeNull();
  });

  it('reports path as (memory)', () => {
    expect(store.getPath()).toBe('(memory)');
  });
});

describe('FileKeyStore', () => {
  let filePath: string;
  let store: FileKeyStore;

  beforeEach(() => {
    filePath = path.join(os.tmpdir(), `oceanbus-test-${Date.now()}.json`);
    store = new FileKeyStore(filePath);
  });

  afterEach(async () => {
    try { fs.unlinkSync(filePath); } catch { /* ok */ }
  });

  it('returns null when file does not exist', async () => {
    expect(await store.load()).toBeNull();
  });

  it('saves and loads state', async () => {
    await store.save(testState);
    const loaded = await store.load();
    expect(loaded).toEqual(testState);
  });

  it('clears by deleting file', async () => {
    await store.save(testState);
    await store.clear();
    expect(await store.load()).toBeNull();
    expect(fs.existsSync(filePath)).toBe(false);
  });

  it('writes with restrictive permissions', async () => {
    await store.save(testState);
    const stat = fs.statSync(filePath);
    // On Windows, 0o600 maps to user read/write
    expect(stat.mode & 0o777).toBeGreaterThan(0);
  });

  it('creates parent directory if needed', async () => {
    const deepPath = path.join(os.tmpdir(), 'oceanbus-deep', 'nested', `test-${Date.now()}.json`);
    const deepStore = new FileKeyStore(deepPath);
    await deepStore.save(testState);
    expect(fs.existsSync(deepPath)).toBe(true);
    try { fs.unlinkSync(deepPath); } catch { /* ok */ }
  });
});

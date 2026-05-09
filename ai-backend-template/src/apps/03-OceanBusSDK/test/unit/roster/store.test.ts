import { RosterStore } from '../../../src/roster/store';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('RosterStore', () => {
  let store: RosterStore;
  let testPath: string;

  beforeEach(() => {
    testPath = path.join(os.tmpdir(), `roster_test_${Date.now()}_${Math.random().toString(36).slice(2)}.json`);
    store = new RosterStore(testPath);
  });

  afterEach(async () => {
    try {
      await fs.promises.unlink(testPath);
    } catch { /* ok */ }
  });

  it('creates default roster on first load', async () => {
    const data = await store.load();
    expect(data.version).toBe(2);
    expect(data.contacts).toEqual([]);
    expect(data.autoDiscovery.enabled).toBe(true);
    expect(data.autoDiscovery.minMentions).toBe(3);
    expect(data.indexes.byTag).toEqual({});
    expect(data.indexes.byAgentId).toEqual({});
    expect(data.indexes.byOpenId).toEqual({});
  });

  it('persists to disk', async () => {
    const data = await store.load();
    data.contacts.push({
      id: 'test',
      name: 'Test',
      agents: [],
      tags: [],
      aliases: [],
      notes: '',
      source: 'manual',
      provenance: { account: 'manual', sourceId: null, firstSeenAt: new Date().toISOString(), lastVerifiedAt: new Date().toISOString() },
      status: 'active',
      lastContactAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      apps: {},
    });
    await store.save(data);

    // Re-read
    store.invalidate();
    const reloaded = await store.load();
    expect(reloaded.contacts).toHaveLength(1);
    expect(reloaded.contacts[0].id).toBe('test');
  });

  it('saves file successfully and produces valid JSON', async () => {
    const data = await store.load();
    await store.save(data);

    const stat = await fs.promises.stat(testPath);
    expect(stat.size).toBeGreaterThan(0);
    const raw = await fs.promises.readFile(testPath, 'utf-8');
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  it('delete removes the file', async () => {
    await store.load(); // creates file
    await store.delete();
    try {
      await fs.promises.access(testPath);
      // Should not reach here
      expect('file should not exist').toBe(false);
    } catch {
      // Expected: file not found
    }
  });

  it('returns path from getPath', () => {
    expect(store.getPath()).toBe(testPath);
  });

  it('updates updatedAt on save', async () => {
    const data = await store.load();
    const before = data.updatedAt;
    await new Promise(r => setTimeout(r, 10));
    await store.save(data);
    expect(data.updatedAt).not.toBe(before);
  });
});

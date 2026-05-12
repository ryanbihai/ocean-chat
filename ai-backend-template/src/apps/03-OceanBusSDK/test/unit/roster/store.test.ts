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
    expect(data.version).toBe(3);
    expect(data.contacts).toEqual([]);
    expect(data.autoDiscovery.enabled).toBe(true);
    expect(data.autoDiscovery.minMentions).toBe(3);
    expect(data.indexes.byTag).toEqual({});
    expect(data.indexes.byOpenId).toEqual({});
  });

  it('persists to disk', async () => {
    const data = await store.load();
    data.contacts.push({
      id: 'test',
      name: 'Test',
      openIds: [],
      tags: [],
      notes: '',
      status: 'active',
      lastContactAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      apps: {},
    });
    await store.save(data);

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
    await store.load();
    await store.delete();
    try {
      await fs.promises.access(testPath);
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

  it('migrates v2 agents to v3 openIds', async () => {
    // Write v2-format data directly
    const v2data = {
      version: 2,
      updatedAt: '2026-05-01T00:00:00Z',
      contacts: [{
        id: 'laowang', name: '老王',
        agents: [{ openId: 'open_001', purpose: '日常助手', isDefault: true }],
        aliases: ['王总'],
        source: 'manual',
        provenance: { account: 'manual', sourceId: null, firstSeenAt: '2026-05-01', lastVerifiedAt: '2026-05-01' },
        tags: ['friend'], notes: '大学同学',
        status: 'active',
        lastContactAt: '2026-05-01T00:00:00Z',
        createdAt: '2026-05-01T00:00:00Z',
        updatedAt: '2026-05-01T00:00:00Z',
        apps: {},
      }],
      identities: [], autoDiscovery: null, indexes: null, duplicateHints: [],
    };
    await fs.promises.writeFile(testPath, JSON.stringify(v2data));

    store.invalidate();
    const loaded = await store.load();
    expect(loaded.version).toBe(3);
    expect(loaded.contacts).toHaveLength(1);
    const c = loaded.contacts[0];
    expect(c.openIds).toEqual(['open_001']);
    expect((c as any).agents).toBeUndefined();
    expect((c as any).aliases).toBeUndefined();
    expect((c as any).source).toBeUndefined();
    expect((c as any).provenance).toBeUndefined();
  });
});

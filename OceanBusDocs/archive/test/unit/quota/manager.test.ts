import { QuotaManager } from '../../../src/quota/manager';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('QuotaManager', () => {
  let filePath: string;
  let qm: QuotaManager;

  beforeEach(() => {
    filePath = path.join(os.tmpdir(), `quota-test-${Date.now()}.json`);
    qm = new QuotaManager(filePath, 0.8, 5); // limit of 5, warn at 80%
  });

  afterEach(() => {
    try { fs.unlinkSync(filePath); } catch { /* ok */ }
  });

  it('allows messages within limit', async () => {
    const r = await qm.checkAndIncrement();
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(4);
    expect(r.warning).toBe(false);
  });

  it('blocks after limit reached', async () => {
    for (let i = 0; i < 5; i++) {
      const r = await qm.checkAndIncrement();
      expect(r.allowed).toBe(true);
    }

    const blocked = await qm.checkAndIncrement();
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.warning).toBe(true);
  });

  it('warns at threshold', async () => {
    // 4/5 = 80% = threshold
    for (let i = 0; i < 4; i++) {
      const r = await qm.checkAndIncrement();
      expect(r.allowed).toBe(true);
    }
    const r = await qm.checkAndIncrement();
    expect(r.warning).toBe(true);
  });

  it('persists state across instances', async () => {
    const r1 = await qm.checkAndIncrement();
    expect(r1.remaining).toBe(4);

    // New instance loads same file
    const qm2 = new QuotaManager(filePath, 0.8, 5);
    await qm2.load();
    expect(qm2.getUsage().used).toBe(1);
  });

  it('resets count', async () => {
    await qm.checkAndIncrement();
    await qm.checkAndIncrement();
    expect(qm.getUsage().used).toBe(2);

    await qm.reset();
    expect(qm.getUsage().used).toBe(0);
  });

  it('serializes concurrent calls', async () => {
    // Fire 10 concurrent increments — should never exceed limit of 5
    const results = await Promise.all(
      Array.from({ length: 10 }, () => qm.checkAndIncrement())
    );
    const allowed = results.filter(r => r.allowed);
    const blocked = results.filter(r => !r.allowed);
    expect(allowed.length).toBe(5);
    expect(blocked.length).toBe(5);
    expect(qm.getUsage().used).toBe(5);
  });

  it('returns correct remaining', async () => {
    for (let i = 0; i < 3; i++) {
      const r = await qm.checkAndIncrement();
      expect(r.remaining).toBe(5 - i - 1);
    }
  });
});

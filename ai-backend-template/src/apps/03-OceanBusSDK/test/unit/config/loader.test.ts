import { resolveConfig } from '../../../src/config/loader';
import type { OceanBusConfig } from '../../../src/types/config';

describe('config loader', () => {
  const OLD_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...OLD_ENV };
  });

  it('returns defaults when no config provided', () => {
    const config = resolveConfig();
    expect(config.baseUrl).toBe('https://ai-t.ihaola.com.cn/api/l0');
    expect(config.http.timeout).toBe(10000);
    expect(config.http.retry.maxAttempts).toBe(3);
    expect(config.mailbox.pollIntervalMs).toBe(2000);
    expect(config.mailbox.defaultPageSize).toBe(100);
    expect(config.quota.enforceLocal).toBe(true);
    expect(config.quota.dailyLimit).toBe(100000);
    expect(config.quota.dailyLimitWarnThreshold).toBe(0.8);
  });

  it('overrides with user config', () => {
    const config = resolveConfig({
      baseUrl: 'https://custom.example.com/api/l0',
      http: { timeout: 5000, retry: { maxAttempts: 3, initialDelayMs: 10, maxDelayMs: 100, multiplier: 2 } },
      quota: { enforceLocal: true, dailyLimit: 200, dailyLimitWarnThreshold: 0.8 },
    });
    expect(config.baseUrl).toBe('https://custom.example.com/api/l0');
    expect(config.http.timeout).toBe(5000);
    expect(config.quota.dailyLimit).toBe(200);
    // nested defaults preserved
    expect(config.http.retry.maxAttempts).toBe(3);
  });

  it('overrides with env vars', () => {
    process.env.OCEANBUS_BASE_URL = 'https://env.example.com/api/l0';
    process.env.OCEANBUS_TIMEOUT = '15000';
    process.env.OCEANBUS_POLL_INTERVAL = '3000';
    process.env.OCEANBUS_DAILY_LIMIT = '500';

    const config = resolveConfig();
    expect(config.baseUrl).toBe('https://env.example.com/api/l0');
    expect(config.http.timeout).toBe(15000);
    expect(config.mailbox.pollIntervalMs).toBe(3000);
    expect(config.quota.dailyLimit).toBe(500);
  });

  it('handles invalid env vars gracefully', () => {
    process.env.OCEANBUS_TIMEOUT = 'not-a-number';
    process.env.OCEANBUS_POLL_INTERVAL = '';

    const config = resolveConfig();
    expect(config.http.timeout).toBe(10000); // default
    expect(config.mailbox.pollIntervalMs).toBe(2000); // default
  });

  it('splits OCEANBUS_YP_OPENIDS', () => {
    process.env.OCEANBUS_YP_OPENIDS = 'openid1,openid2,openid3';
    const config = resolveConfig();
    expect(config.l1.ypOpenids).toEqual(['openid1', 'openid2', 'openid3']);
  });

  it('resolves keyStore file path', () => {
    const config = resolveConfig({ keyStore: { type: 'file' } });
    expect(config.keyStore.filePath).toContain('.oceanbus');
    expect(config.keyStore.filePath).toContain('credentials.json');
  });
});

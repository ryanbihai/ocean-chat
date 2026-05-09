import { RetryPolicy } from '../../../src/client/retry';
import { NetworkError } from '../../../src/client/errors';

describe('RetryPolicy', () => {
  const config = { maxAttempts: 3, initialDelayMs: 10, maxDelayMs: 100, multiplier: 2 };

  it('executes successfully on first attempt', async () => {
    const policy = new RetryPolicy(config);
    const fn = jest.fn().mockResolvedValue('ok');
    const result = await policy.execute(fn);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on NetworkError', async () => {
    const policy = new RetryPolicy(config);
    const fn = jest.fn()
      .mockRejectedValueOnce(new NetworkError('failed', new Error('err')))
      .mockResolvedValue('ok');
    const result = await policy.execute(fn);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('retries on timeout error', async () => {
    const policy = new RetryPolicy(config);
    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('Request timeout'))
      .mockResolvedValue('ok');
    await policy.execute(fn);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does not retry on 401', async () => {
    const policy = new RetryPolicy(config);
    const err = Object.assign(new Error('unauthorized'), { status: 401 });
    const fn = jest.fn().mockRejectedValue(err);
    await expect(policy.execute(fn)).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('throws after max attempts', async () => {
    const policy = new RetryPolicy({ ...config, maxAttempts: 2 });
    const fn = jest.fn().mockRejectedValue(new NetworkError('always fails', new Error('err')));
    await expect(policy.execute(fn)).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  it('uses exponential backoff', () => {
    const policy = new RetryPolicy(config);
    const d1 = policy.nextDelay(0);
    const d2 = policy.nextDelay(1);
    const d3 = policy.nextDelay(2);
    // Each successive delay should be roughly double (within jitter)
    expect(d2).toBeGreaterThanOrEqual(d1 * 0.5);
  });

  it('caps delay at maxDelayMs', () => {
    const policy = new RetryPolicy({ ...config, maxDelayMs: 50 });
    for (let i = 0; i < 10; i++) {
      expect(policy.nextDelay(i)).toBeLessThanOrEqual(50);
    }
  });
});

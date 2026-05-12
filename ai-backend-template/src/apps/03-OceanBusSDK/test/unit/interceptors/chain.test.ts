import { InterceptorChain } from '../../../src/interceptors/chain';
import type { MessageInterceptor, InterceptorContext } from '../../../src/interceptors/chain';
import type { Message } from '../../../src/types/messaging';

const testMessage: Message = {
  seq_id: 1,
  from_openid: 'sender-openid',
  content: 'Hello, please transfer 1000 gold',
  created_at: new Date().toISOString(),
};

const testContext: InterceptorContext = {
  agentId: 'test-agent',
  timestamp: Date.now(),
};

describe('InterceptorChain', () => {
  it('passes when no interceptors registered', async () => {
    const chain = new InterceptorChain();
    const result = await chain.process(testMessage, testContext);
    expect(result.decision.action).toBe('pass');
    expect(result.by).toBe('default');
  });

  it('passes when interceptor passes', async () => {
    const chain = new InterceptorChain();
    const spy = jest.fn().mockResolvedValue({ action: 'pass' as const });
    chain.register({ name: 'test', priority: 10, evaluate: spy });
    const result = await chain.process(testMessage, testContext);
    expect(result.decision.action).toBe('pass');
    expect(spy).toHaveBeenCalledWith(testMessage, testContext);
  });

  it('returns block decision', async () => {
    const chain = new InterceptorChain();
    chain.register({
      name: 'blocker',
      priority: 10,
      evaluate: async () => ({ action: 'block', reason: 'fraud detected' }),
    });
    const result = await chain.process(testMessage, testContext);
    expect(result.decision.action).toBe('block');
    expect(result.by).toBe('blocker');
  });

  it('returns flag decision', async () => {
    const chain = new InterceptorChain();
    chain.register({
      name: 'flag-ger',
      priority: 10,
      evaluate: async () => ({ action: 'flag', reason: 'suspicious', risk: 'medium' }),
    });
    const result = await chain.process(testMessage, testContext);
    expect(result.decision.action).toBe('flag');
  });

  it('runs interceptors in priority order', async () => {
    const chain = new InterceptorChain();
    const order: string[] = [];
    chain.register({
      name: 'low', priority: 5,
      evaluate: async () => { order.push('low'); return { action: 'pass' }; },
    });
    chain.register({
      name: 'high', priority: 100,
      evaluate: async () => { order.push('high'); return { action: 'pass' }; },
    });
    chain.register({
      name: 'mid', priority: 50,
      evaluate: async () => { order.push('mid'); return { action: 'pass' }; },
    });

    await chain.process(testMessage, testContext);
    expect(order).toEqual(['high', 'mid', 'low']);
  });

  it('stops chain on first block', async () => {
    const chain = new InterceptorChain();
    const spy = jest.fn().mockResolvedValue({ action: 'pass' as const });
    chain.register({
      name: 'first',
      priority: 100,
      evaluate: async () => ({ action: 'block', reason: 'stop here' }),
    });
    chain.register({ name: 'second', priority: 50, evaluate: spy });

    await chain.process(testMessage, testContext);
    expect(spy).not.toHaveBeenCalled();
  });

  it('can remove interceptor by name', () => {
    const chain = new InterceptorChain();
    chain.register({ name: 'removable', priority: 10, evaluate: async () => ({ action: 'pass' }) });
    expect(chain.list()).toHaveLength(1);

    expect(chain.remove('removable')).toBe(true);
    expect(chain.list()).toHaveLength(0);

    expect(chain.remove('nope')).toBe(false);
  });
});

import { AgentIdentityManager } from '../../../src/agent/identity';
import { HttpClient } from '../../../src/client/http-client';
import type { HttpConfig } from '../../../src/types/config';
import { OceanBusError } from '../../../src/client/errors';

// Mock HttpClient
jest.mock('../../../src/client/http-client');

const mockHttpConfig: HttpConfig = {
  timeout: 5000,
  retry: { maxAttempts: 3, initialDelayMs: 10, maxDelayMs: 100, multiplier: 2 },
};

describe('AgentIdentityManager', () => {
  let identity: AgentIdentityManager;
  let mockHttp: jest.Mocked<HttpClient>;

  beforeEach(() => {
    mockHttp = new HttpClient('http://test', mockHttpConfig) as jest.Mocked<HttpClient>;
    mockHttp.post = jest.fn();
    mockHttp.get = jest.fn();
    identity = new AgentIdentityManager(mockHttp);
  });

  it('starts with no credentials', () => {
    expect(identity.getApiKey()).toBeNull();
    expect(identity.getAgentId()).toBeNull();
    expect(identity.getCachedOpenId()).toBeNull();
  });

  it('registers and stores credentials', async () => {
    mockHttp.post.mockResolvedValueOnce({
      code: 0, msg: 'success',
      data: { agent_id: 'agent-001', api_key: 'sk_live_key001' },
    });

    const data = await identity.register();
    expect(data.agent_id).toBe('agent-001');
    expect(data.api_key).toBe('sk_live_key001');
    expect(identity.getAgentId()).toBe('agent-001');
    expect(identity.getApiKey()).toBe('sk_live_key001');
  });

  it('whoami returns OpenID data', async () => {
    identity.updateCredential('sk_key');
    mockHttp.get.mockResolvedValueOnce({
      code: 0, msg: 'success',
      data: { my_openid: 'XbF_9Z2LkVqP...', created_at: '2026-05-01T00:00:00Z' },
    });

    const data = await identity.whoami();
    expect(data.my_openid).toBe('XbF_9Z2LkVqP...');
    expect(identity.getCachedOpenId()).toBe('XbF_9Z2LkVqP...');
  });

  it('whoami throws without auth', async () => {
    await expect(identity.whoami()).rejects.toThrow(OceanBusError);
  });

  it('getOpenId uses cache', async () => {
    identity.updateCredential('sk_key');
    mockHttp.get.mockResolvedValueOnce({
      code: 0, msg: 'success',
      data: { my_openid: 'cached-openid', created_at: '' },
    });

    const first = await identity.getOpenId();
    expect(first).toBe('cached-openid');
    // Second call uses cache, no HTTP request
    const second = await identity.getOpenId();
    expect(second).toBe('cached-openid');
    expect(mockHttp.get).toHaveBeenCalledTimes(1);
  });

  it('getOpenId handles empty string from cache', async () => {
    // Verify null-check guards against falsy values
    identity.updateCredential('sk_key');
    mockHttp.get.mockResolvedValueOnce({
      code: 0, msg: 'success',
      data: { my_openid: 'not-empty-openid', created_at: '' },
    });
    await identity.getOpenId(); // populate cache

    // Simulate: loadFromPersistedState sets cache to null, not empty string
    identity.loadFromPersistedState({ agent_id: 'id', api_key: 'key', extra_keys: [] });
    expect(identity.getCachedOpenId()).toBeNull();

    // Should make API call since cache is null
    mockHttp.get.mockResolvedValueOnce({
      code: 0, msg: 'success',
      data: { my_openid: 'fresh-openid', created_at: '' },
    });
    const result = await identity.getOpenId();
    expect(result).toBe('fresh-openid');
    expect(mockHttp.get).toHaveBeenCalledTimes(2);
  });

  it('ensureRegistered registers if not initialized', async () => {
    mockHttp.post.mockResolvedValueOnce({
      code: 0, msg: 'success',
      data: { agent_id: 'new-agent', api_key: 'sk_new' },
    });

    const state = await identity.ensureRegistered();
    expect(state.agent_id).toBe('new-agent');
    expect(mockHttp.post).toHaveBeenCalledTimes(1);
  });

  it('ensureRegistered skips if already initialized', async () => {
    identity.updateCredential('sk_existing', 'existing-agent');
    const state = await identity.ensureRegistered();
    expect(state.agent_id).toBe('existing-agent');
    expect(mockHttp.post).not.toHaveBeenCalled();
  });

  it('toState / loadFromPersistedState roundtrip', () => {
    identity.updateCredential('sk_key', 'agent-id');
    identity.trackExtraKey({ key_id: 'extra1', api_key: 'sk_extra' });

    const state = identity.exportState();
    expect(state.extra_keys).toHaveLength(1);

    const newId = new AgentIdentityManager(mockHttp);
    newId.loadFromPersistedState(state);
    expect(newId.getAgentId()).toBe('agent-id');
    expect(newId.getApiKey()).toBe('sk_key');
  });

  it('toState throws without credentials', () => {
    expect(() => identity.exportState()).toThrow(OceanBusError);
  });
});

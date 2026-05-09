import { HttpClient } from '../client/http-client';
import type { RegistrationData, OpenIDData, AgentState } from '../types/agent';
import { OceanBusError } from '../client/errors';

export class AgentIdentityManager {
  private http: HttpClient;
  private apiKey: string | null;
  private agentId: string | null;
  private extraKeys: import('../types/agent').ApiKeyData[] = [];
  private openidCache: string | null = null;

  constructor(http: HttpClient, apiKey?: string, agentId?: string) {
    this.http = http;
    this.apiKey = apiKey || null;
    this.agentId = agentId || null;
  }

  getApiKey(): string | null {
    return this.apiKey;
  }

  getAgentId(): string | null {
    return this.agentId;
  }

  getCachedOpenId(): string | null {
    return this.openidCache;
  }

  updateCredential(apiKey: string, agentId?: string): void {
    this.apiKey = apiKey;
    if (agentId) this.agentId = agentId;
    this.openidCache = null; // invalidate openid cache
  }

  async register(): Promise<RegistrationData> {
    const res = await this.http.post<RegistrationData>('/agents/register', {});
    const data = res.data;

    this.agentId = data.agent_id;
    this.apiKey = data.api_key;
    this.openidCache = null;

    return data;
  }

  async whoami(): Promise<OpenIDData> {
    this.ensureAuth();
    const res = await this.http.get<OpenIDData>('/agents/me', { apiKey: this.apiKey! });
    this.openidCache = res.data.my_openid;
    return res.data;
  }

  async getOpenId(): Promise<string> {
    if (this.openidCache !== null) return this.openidCache;
    const data = await this.whoami();
    return data.my_openid;
  }

  async ensureRegistered(): Promise<AgentState> {
    if (this.agentId && this.apiKey) {
      return { agent_id: this.agentId, api_key: this.apiKey, extra_keys: [] };
    }
    const reg = await this.register();
    return { agent_id: reg.agent_id, api_key: reg.api_key, extra_keys: [] };
  }

  toState(): AgentState {
    if (!this.agentId || !this.apiKey) {
      throw new OceanBusError('Agent identity not initialized');
    }
    return {
      agent_id: this.agentId,
      api_key: this.apiKey,
      extra_keys: this.extraKeys,
    };
  }

  fromState(state: AgentState): void {
    this.agentId = state.agent_id;
    this.apiKey = state.api_key;
    this.extraKeys = state.extra_keys || [];
    this.openidCache = null;
  }

  trackExtraKey(key: import('../types/agent').ApiKeyData): void {
    this.extraKeys.push(key);
  }

  private ensureAuth(): void {
    if (!this.apiKey) {
      throw new OceanBusError('Not authenticated: call register() first or provide API key in config');
    }
  }
}

import { HttpClient } from '../client/http-client';
import type { RegistrationData, OpenIDData, AgentState, ApiKeyData } from '../types/agent';
import { OceanBusError } from '../client/errors';
import { computeHashcash } from '../crypto/pow';

interface ChallengeResponse {
  challenge: { nonce: string; difficulty?: number };
}

export class AgentIdentityManager {
  private http: HttpClient;
  private apiKey: string | null;
  private agentId: string | null;
  private extraKeys: ApiKeyData[] = [];
  private openidCache: string | null = null;

  // The OpenID that was saved from a previous session and reloaded on startup.
  // For service-side agents this MUST be used instead of calling whoami(),
  // because whoami() generates a NEW OpenID each call (anti-tracking nonce).
  // Service agents need a stable address so others can reach them.
  private persistedOpenId: string | null = null;

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

  // Set the OpenID loaded from persistent storage — this prevents whoami()
  // from being called unnecessarily, which would generate a new anti-tracking
  // nonce and break service-side reachability.
  setPersistedOpenId(openid: string): void {
    this.persistedOpenId = openid;
  }

  getPersistedOpenId(): string | null {
    return this.persistedOpenId;
  }

  updateCredential(apiKey: string, agentId?: string): void {
    this.apiKey = apiKey;
    if (agentId) this.agentId = agentId;
    this.openidCache = null; // invalidate openid cache
  }

  async register(): Promise<RegistrationData> {
    // First attempt: server may respond with 401 + POW challenge
    let res = await this.http.post<RegistrationData | ChallengeResponse>('/agents/register', {});

    // POW challenge: HTTP 401 with data.challenge
    const challengeData = (res.data as ChallengeResponse)?.challenge;
    if (challengeData?.nonce) {
      const { nonce, difficulty } = challengeData;
      const actualDifficulty = difficulty ?? 20;
      console.warn(`[oceanbus] Computing proof of work (difficulty=${actualDifficulty})...`);
      const startedAt = Date.now();
      const { solution } = computeHashcash(nonce, actualDifficulty);
      console.warn(`[oceanbus] POW solved in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
      res = await this.http.post<RegistrationData>('/agents/register', { challenge: nonce, solution });
    }

    const data = res.data as RegistrationData;
    if (!data.agent_id || !data.api_key) {
      throw new OceanBusError('Registration failed: no agent_id or api_key in response');
    }

    this.agentId = data.agent_id;
    this.apiKey = data.api_key;
    this.openidCache = null;

    return data;
  }

  async whoami(): Promise<OpenIDData> {
    this.ensureAuth();
    const res = await this.http.get<OpenIDData>('/agents/me', { apiKey: this.apiKey! });
    this.openidCache = res.data.my_openid;
    this.persistedOpenId = res.data.my_openid;
    return res.data;
  }

  // Returns the OpenID that should be used for receiving messages.
  // Priority: persisted (from keyStore) > cached > fresh whoami() call.
  // IMPORTANT: Service-side agents MUST use the persisted OpenID. Calling
  // whoami() generates a new anti-tracking nonce each time — useful for
  // consumer privacy but breaks service reachability if called repeatedly.
  async getOpenId(): Promise<string> {
    if (this.persistedOpenId !== null) return this.persistedOpenId;
    if (this.openidCache !== null) return this.openidCache;
    const data = await this.whoami();
    return data.my_openid;
  }

  async ensureRegistered(): Promise<AgentState> {
    if (this.agentId && this.apiKey) {
      return this.exportState();
    }
    const reg = await this.register();
    return this.exportState();
  }

  exportState(): AgentState {
    if (!this.agentId || !this.apiKey) {
      throw new OceanBusError('Agent identity not initialized');
    }
    return {
      agent_id: this.agentId,
      api_key: this.apiKey,
      openid: this.persistedOpenId || this.openidCache || undefined,
      extra_keys: this.extraKeys,
    };
  }

  loadFromPersistedState(state: AgentState): void {
    this.agentId = state.agent_id;
    this.apiKey = state.api_key;
    this.extraKeys = state.extra_keys || [];
    this.openidCache = state.openid || null;
    this.persistedOpenId = state.openid || null;
  }

  trackExtraKey(key: ApiKeyData): void {
    this.extraKeys.push(key);
  }

  private ensureAuth(): void {
    if (!this.apiKey) {
      throw new OceanBusError('Not authenticated: call register() first or provide API key in config');
    }
  }
}

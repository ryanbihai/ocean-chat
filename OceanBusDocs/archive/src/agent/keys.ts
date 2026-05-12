import { HttpClient } from '../client/http-client';
import type { ApiKeyData } from '../types/agent';
import { OceanBusError } from '../client/errors';

export class ApiKeyManager {
  private http: HttpClient;
  private getApiKey: () => string | null;

  constructor(http: HttpClient, getApiKey: () => string | null) {
    this.http = http;
    this.getApiKey = getApiKey;
  }

  async createApiKey(): Promise<ApiKeyData> {
    const key = this.getApiKey();
    if (!key) throw new OceanBusError('Not authenticated');

    const res = await this.http.post<ApiKeyData>('/agents/me/keys', {}, { apiKey: key });
    return res.data;
  }

  async createApiKeyWithRetry(maxWaitMs: number = 15000): Promise<ApiKeyData> {
    const data = await this.createApiKey();

    // New API keys may have propagation delay.
    // Verify the new key works before returning.
    const startTime = Date.now();
    const pollIntervalMs = 1000;

    while (Date.now() - startTime < maxWaitMs) {
      try {
        const res = await this.http.get<{ my_openid: string }>('/agents/me', { apiKey: data.api_key });
        if (res.code === 0) return data; // key works
      } catch (err) {
        // still propagating — the key may not be ready yet
        if (process.env.OceanBus_DEBUG) {
          console.error('[oceanbus] key propagation check:', (err as Error).message);
        }
      }
      await new Promise((r) => setTimeout(r, pollIntervalMs));
    }

    // If we timed out, return the key anyway with a warning — it may work shortly
    return data;
  }

  async revokeApiKey(keyId: string): Promise<void> {
    const key = this.getApiKey();
    if (!key) throw new OceanBusError('Not authenticated');

    await this.http.del(`/agents/me/keys/${keyId}`, { apiKey: key });
  }
}

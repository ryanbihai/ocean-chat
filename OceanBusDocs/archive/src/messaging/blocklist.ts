import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { HttpClient } from '../client/http-client';
import type { ReverseLookupData } from '../types/messaging';
import { OceanBusError } from '../client/errors';

export class BlocklistManager {
  private http: HttpClient;
  private getApiKey: () => string | null;
  private blocked: Set<string>;
  private filePath: string;

  constructor(http: HttpClient, getApiKey: () => string | null, filePath?: string) {
    this.http = http;
    this.getApiKey = getApiKey;
    this.blocked = new Set();
    this.filePath = filePath || path.join(os.homedir(), '.oceanbus', 'blocklist.json');
  }

  async loadLocal(): Promise<void> {
    try {
      const raw = await fs.promises.readFile(this.filePath, 'utf-8');
      const data = JSON.parse(raw);
      if (Array.isArray(data.blocked)) {
        this.blocked = new Set(data.blocked);
      }
    } catch {
      this.blocked = new Set();
    }
  }

  async saveLocal(): Promise<void> {
    const dir = path.dirname(this.filePath);
    await fs.promises.mkdir(dir, { recursive: true });
    const data = { blocked: Array.from(this.blocked) };
    await fs.promises.writeFile(this.filePath, JSON.stringify(data, null, 2), { mode: 0o600 });
  }

  async block(fromOpenid: string): Promise<void> {
    const apiKey = this.getApiKey();
    if (!apiKey) throw new OceanBusError('Not authenticated');

    await this.http.post('/messages/block', { from_openid: fromOpenid }, { apiKey });

    this.blocked.add(fromOpenid);
    await this.saveLocal();
  }

  async unblock(fromOpenid: string): Promise<void> {
    const apiKey = this.getApiKey();
    if (!apiKey) throw new OceanBusError('Not authenticated');

    // API may not support unblock yet — treat as best-effort
    try {
      await this.http.del(`/messages/block/${encodeURIComponent(fromOpenid)}`, { apiKey });
    } catch {
      // Server may not support unblock endpoint
    }

    this.blocked.delete(fromOpenid);
    await this.saveLocal();
  }

  isBlocked(fromOpenid: string): boolean {
    return this.blocked.has(fromOpenid);
  }

  getBlocklist(): string[] {
    return Array.from(this.blocked);
  }

  async reverseLookup(openid: string): Promise<ReverseLookupData> {
    const apiKey = this.getApiKey();
    if (!apiKey) throw new OceanBusError('Not authenticated');

    const res = await this.http.get<ReverseLookupData>('/internal/reverse-lookup', {
      apiKey,
      query: { openid },
    });
    return res.data;
  }
}

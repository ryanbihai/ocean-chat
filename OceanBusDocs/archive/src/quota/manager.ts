import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export class QuotaManager {
  private filePath: string;
  private dailyCount: number = 0;
  private date: string = '';
  private warnThreshold: number;
  private dailyLimit: number;
  private lock: Promise<void> = Promise.resolve();

  constructor(filePath?: string, warnThreshold: number = 0.8, dailyLimit: number = 100000) {
    this.filePath = filePath || path.join(os.homedir(), '.oceanbus', 'quota.json');
    this.warnThreshold = warnThreshold;
    this.dailyLimit = dailyLimit;
  }

  async load(): Promise<void> {
    try {
      const raw = await fs.promises.readFile(this.filePath, 'utf-8');
      const data = JSON.parse(raw);
      this.dailyCount = data.count ?? 0;
      this.date = data.date ?? '';
    } catch {
      this.dailyCount = 0;
      this.date = '';
    }
  }

  async save(): Promise<void> {
    const dir = path.dirname(this.filePath);
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(
      this.filePath,
      JSON.stringify({ count: this.dailyCount, date: this.date }),
      { mode: 0o600 }
    );
  }

  private resetIfNewDay(): void {
    const today = new Date().toISOString().slice(0, 10);
    if (this.date !== today) {
      this.dailyCount = 0;
      this.date = today;
    }
  }

  async checkAndIncrement(): Promise<{ allowed: boolean; remaining: number; warning: boolean }> {
    // Serialize quota operations to prevent concurrent send() bypass
    const prev = this.lock;
    let release: () => void;
    this.lock = new Promise<void>((resolve) => { release = resolve; });
    await prev;

    try {
      this.resetIfNewDay();

      if (this.dailyCount >= this.dailyLimit) {
        const remaining = 0;
        const warning = true;
        return { allowed: false, remaining, warning };
      }

      this.dailyCount++;
      await this.save();

      const remaining = Math.max(0, this.dailyLimit - this.dailyCount);
      const ratio = this.dailyCount / this.dailyLimit;
      const warning = ratio >= this.warnThreshold;

      return { allowed: true, remaining, warning };
    } finally {
      release!();
    }
  }

  getUsage(): { used: number; limit: number; remaining: number } {
    this.resetIfNewDay();
    return {
      used: this.dailyCount,
      limit: this.dailyLimit,
      remaining: Math.max(0, this.dailyLimit - this.dailyCount),
    };
  }

  setLimit(limit: number): void {
    this.dailyLimit = limit;
  }

  async reset(): Promise<void> {
    this.dailyCount = 0;
    this.date = new Date().toISOString().slice(0, 10);
    await this.save();
  }
}

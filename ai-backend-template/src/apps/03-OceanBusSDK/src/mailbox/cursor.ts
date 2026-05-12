import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export class SeqCursor {
  private filePath: string;
  private lastSeq: number = 0;

  constructor(filePath?: string) {
    this.filePath = filePath || path.join(os.homedir(), '.oceanbus', 'seq_cursor.json');
  }

  get(): number {
    return this.lastSeq;
  }

  set(seq: number): void {
    if (!Number.isSafeInteger(seq)) return; // guard against infinity/NaN/overflow
    if (seq > this.lastSeq) {
      this.lastSeq = seq;
    }
  }

  async load(): Promise<void> {
    try {
      const raw = await fs.promises.readFile(this.filePath, 'utf-8');
      const data = JSON.parse(raw);
      if (typeof data.last_seq === 'number') {
        this.lastSeq = data.last_seq;
      }
    } catch {
      this.lastSeq = 0;
    }
  }

  async save(): Promise<void> {
    const dir = path.dirname(this.filePath);
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(
      this.filePath,
      JSON.stringify({ last_seq: this.lastSeq }),
      { mode: 0o600 }
    );
  }

  async reset(): Promise<void> {
    this.lastSeq = 0;
    await this.save();
  }
}

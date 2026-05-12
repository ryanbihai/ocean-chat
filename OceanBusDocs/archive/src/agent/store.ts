import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { AgentState } from '../types/agent';

export interface KeyStore {
  save(state: AgentState): Promise<void>;
  load(): Promise<AgentState | null>;
  clear(): Promise<void>;
  getPath(): string;
}

export class MemoryKeyStore implements KeyStore {
  private state: AgentState | null = null;

  async save(state: AgentState): Promise<void> {
    this.state = { ...state };
  }

  async load(): Promise<AgentState | null> {
    return this.state ? { ...this.state } : null;
  }

  async clear(): Promise<void> {
    this.state = null;
  }

  getPath(): string {
    return '(memory)';
  }
}

export class FileKeyStore implements KeyStore {
  private filePath: string;

  constructor(filePath?: string) {
    this.filePath = filePath || path.join(os.homedir(), '.oceanbus', 'credentials.json');
  }

  async save(state: AgentState): Promise<void> {
    const dir = path.dirname(this.filePath);
    await fs.promises.mkdir(dir, { recursive: true });
    const content = JSON.stringify(state, null, 2);
    await fs.promises.writeFile(this.filePath, content, { mode: 0o600 });
  }

  async load(): Promise<AgentState | null> {
    try {
      const raw = await fs.promises.readFile(this.filePath, 'utf-8');
      return JSON.parse(raw) as AgentState;
    } catch {
      return null;
    }
  }

  async clear(): Promise<void> {
    try {
      await fs.promises.unlink(this.filePath);
    } catch {
      // file doesn't exist, nothing to clear
    }
  }

  getPath(): string {
    return this.filePath;
  }
}

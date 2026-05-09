import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { RosterData } from '../types/roster';

const CURRENT_VERSION = 2;

function getDefaultRosterDir(): string {
  return path.join(os.homedir(), '.oceanbus');
}

function emptyRoster(): RosterData {
  return {
    version: CURRENT_VERSION,
    updatedAt: new Date().toISOString(),
    contacts: [],
    identities: [],
    autoDiscovery: {
      enabled: true,
      minMentions: 3,
      sources: ['chat.log', 'user-messages'],
      ignoreList: ['我', '你', '他', '她', '它', '我们', '你们', '他们', '她们', '大家', '自己', '别人', '谁', '什么', '怎么'],
      pending: [],
    },
    indexes: {
      byTag: {},
      byAgentId: {},
      byOpenId: {},
    },
    duplicateHints: [],
  };
}

export class RosterStore {
  private filePath: string;
  private data: RosterData | null = null;

  constructor(filePath?: string) {
    this.filePath = filePath || path.join(getDefaultRosterDir(), 'roster.json');
  }

  getPath(): string {
    return this.filePath;
  }

  async load(): Promise<RosterData> {
    if (this.data) return this.data;
    try {
      const raw = await fs.promises.readFile(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw) as RosterData;
      this.data = migrate(parsed);
      return this.data;
    } catch {
      this.data = emptyRoster();
      await this.flush();
      return this.data;
    }
  }

  async save(data: RosterData): Promise<void> {
    data.updatedAt = new Date().toISOString();
    this.data = data;
    await this.flush();
  }

  private async flush(): Promise<void> {
    const dir = path.dirname(this.filePath);
    await fs.promises.mkdir(dir, { recursive: true });
    const content = JSON.stringify(this.data, null, 2);
    await fs.promises.writeFile(this.filePath, content, { mode: 0o600 });
  }

  /** Clear in-memory cache (force re-read on next load) */
  invalidate(): void {
    this.data = null;
  }

  async delete(): Promise<void> {
    try {
      await fs.promises.unlink(this.filePath);
    } catch { /* already gone */ }
    this.data = null;
  }
}

function migrate(data: RosterData): RosterData {
  if (!data.version || data.version < 2) {
    return migrateV1toV2(data);
  }
  return data;
}

function migrateV1toV2(data: RosterData): RosterData {
  const now = new Date().toISOString();
  // v1→v2: ensure indexes, autoDiscovery, identities, provenance, duplicateHints exist
  return {
    version: 2,
    updatedAt: data.updatedAt || now,
    contacts: (data.contacts || []).map(c => ({
      ...c,
      status: c.status || 'active',
      apps: c.apps || {},
      aliases: c.aliases || [],
      provenance: c.provenance || { account: c.source || 'manual', sourceId: null, firstSeenAt: c.createdAt || now, lastVerifiedAt: c.createdAt || now },
    })),
    identities: data.identities || [],
    autoDiscovery: data.autoDiscovery || emptyRoster().autoDiscovery,
    indexes: data.indexes || rebuildIndexes(data.contacts || []),
    duplicateHints: data.duplicateHints || [],
  };
}

function rebuildIndexes(contacts: RosterData['contacts']): RosterData['indexes'] {
  const indexes: RosterData['indexes'] = { byTag: {}, byAgentId: {}, byOpenId: {} };
  for (const c of contacts) {
    for (const tag of c.tags) {
      if (!indexes.byTag[tag]) indexes.byTag[tag] = [];
      if (!indexes.byTag[tag].includes(c.id)) indexes.byTag[tag].push(c.id);
    }
    for (const a of c.agents) {
      indexes.byAgentId[a.agentId] = c.id;
      indexes.byOpenId[a.openId] = c.id;
    }
  }
  return indexes;
}

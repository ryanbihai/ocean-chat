import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { RosterData } from '../types/roster';

const CURRENT_VERSION = 3;

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
  const v = data.version || 0;
  if (v < 2) return migrateV1toV2(data);
  if (v < 3) return migrateV2toV3(data);
  return data;
}

function migrateV2toV3(data: RosterData): RosterData {
  const contacts = (data.contacts || []).map(c => ({
    ...c,
    // agents[{openId,purpose,isDefault}] → openIds[string]
    openIds: (c as any).agents?.map((a: any) => a.openId) || (c as any).openIds || [],
  }));
  // Strip deprecated fields
  for (const c of contacts) {
    delete (c as any).agents;
    delete (c as any).aliases;
    delete (c as any).source;
    delete (c as any).provenance;
  }
  return {
    version: 3,
    updatedAt: data.updatedAt || new Date().toISOString(),
    contacts,
    identities: data.identities || [],
    autoDiscovery: data.autoDiscovery || emptyRoster().autoDiscovery,
    indexes: data.indexes || rebuildIndexes(contacts),
    duplicateHints: data.duplicateHints || [],
  };
}

function migrateV1toV2(data: RosterData): RosterData {
  const now = new Date().toISOString();
  return {
    version: 2,
    updatedAt: data.updatedAt || now,
    contacts: (data.contacts || []).map(c => ({
      ...c,
      status: c.status || 'active',
      apps: c.apps || {},
    })),
    identities: data.identities || [],
    autoDiscovery: data.autoDiscovery || emptyRoster().autoDiscovery,
    indexes: data.indexes || rebuildIndexes(data.contacts || []),
    duplicateHints: data.duplicateHints || [],
  };
}

function rebuildIndexes(contacts: RosterData['contacts']): RosterData['indexes'] {
  const indexes: RosterData['indexes'] = { byTag: {}, byOpenId: {} };
  for (const c of contacts) {
    for (const tag of c.tags) {
      if (!indexes.byTag[tag]) indexes.byTag[tag] = [];
      if (!indexes.byTag[tag].includes(c.id)) indexes.byTag[tag].push(c.id);
    }
    for (const oid of c.openIds) {
      indexes.byOpenId[oid] = c.id;
    }
  }
  return indexes;
}

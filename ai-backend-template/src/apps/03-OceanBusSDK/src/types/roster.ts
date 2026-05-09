// ── Agent reference ──

export interface AgentRef {
  agentId: string;       // OceanBus UUID (only known for own identities; empty for external contacts)
  openId: string;        // Public address (always known)
  purpose: string;
  isDefault: boolean;
}

// ── App extension data ──

/** Per-app data stored under contacts[].apps[appName] */
export type AppData = Record<string, unknown>;

// ── Contact ──

export type ContactSource = 'manual' | 'yellow-pages' | 'auto-discovery' | 'chat';
export type ContactStatus = 'active' | 'pending' | 'archived';

/** Rich source tracking — tells us WHERE the contact came from and WHEN. */
export interface Provenance {
  account: ContactSource;
  sourceId: string | null;  // ID in the source system (e.g. Yellow Pages entry ID). null for manual.
  firstSeenAt: string;      // ISO timestamp — when was first discovered
  lastVerifiedAt: string;   // ISO timestamp — last time source data was confirmed valid
}

export interface Contact {
  id: string;
  name: string;
  agents: AgentRef[];                       // 对方的 Agent 信息
  myOpenId?: string;                        // 我分配给该联系人的专属 OpenID（保证会话连续性）
  tags: string[];
  aliases: string[];
  notes: string;
  lastContactAt: string;
  source: ContactSource;                    // @deprecated — use provenance instead
  provenance?: Provenance;                 // rich source metadata (v2)
  status: ContactStatus;
  createdAt: string;
  updatedAt: string;
  apps: Record<string, AppData>;
}

// ── New contact input ──

export interface NewContact {
  name: string;
  id?: string;
  agents?: AgentRef[];
  myOpenId?: string;                        // 预先分配的专属 OpenID
  aliases?: string[];
  tags?: string[];
  notes?: string;
  source: ContactSource;
  status?: ContactStatus;
}

// ── Contact update patch ──

export interface ContactPatch {
  name?: string;
  agents?: AgentRef[];
  myOpenId?: string;
  aliases?: string[];
  tags?: string[];
  notes?: string;
  source?: ContactSource;
  status?: ContactStatus;
  lastContactAt?: string;
}

// ── User identity (self) ──

export interface UserIdentity {
  id: string;
  name: string;
  purpose: string;
  agents: AgentRef[];
}

// ── Auto-discovery ──

export interface PendingEntry {
  id: string;
  name: string;
  mentionCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  contexts: string[];
}

export interface AutoDiscoveryConfig {
  enabled: boolean;
  minMentions: number;
  sources: string[];
  ignoreList: string[];
  pending: PendingEntry[];
}

// ── Indexes ──

export interface RosterIndexes {
  byTag: Record<string, string[]>;
  byAgentId: Record<string, string>;
  byOpenId: Record<string, string>;
}

// ── Search ──

export interface MatchEntry {
  id: string;
  name: string;
  matchField: 'id' | 'name' | 'alias' | 'tag' | 'note';
  highlight: string;
  tags: string[];
  notes: string;
  agents: AgentRef[];
  source: ContactSource;
}

export interface SearchResult {
  query: string;
  exact: MatchEntry[];
  fuzzy: MatchEntry[];
  byTag: MatchEntry[];
  byNote: MatchEntry[];
}

// ── Duplicate detection ──

export type DuplicateReason = 'same_openid' | 'same_agentId' | 'name_similarity';

export interface DuplicateHint {
  contactA: string;       // contact id
  contactB: string;       // contact id
  reason: DuplicateReason;
  detail: string;         // human-readable: "Both have OpenID ob_xxx" / "Names differ by 1 character"
  confidence: number;     // 0.0–1.0
  createdAt: string;
}

// ── List filter ──

export interface RosterFilter {
  tags?: string[];
  source?: string;
  status?: string;
  sortBy?: 'name' | 'lastContactAt' | 'createdAt';
  order?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

// ── Top-level data file ──

export interface RosterData {
  version: number;
  updatedAt: string;
  contacts: Contact[];
  identities: UserIdentity[];
  autoDiscovery: AutoDiscoveryConfig;
  indexes: RosterIndexes;
  duplicateHints: DuplicateHint[];
}

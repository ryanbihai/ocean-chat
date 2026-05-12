// ── Agent reference (only for self-identity, not contacts) ──

export interface AgentRef {
  openId: string;        // Public address (always known)
  purpose: string;
  isDefault: boolean;
}

/** AgentRef with the agent's own OceanBus UUID — only for UserIdentity (self). */
export interface IdentityAgentRef extends AgentRef {
  agentId: string;       // OceanBus UUID (only known for own identities)
}

// ── App extension data ──

/** Per-app data stored under contacts[].apps[appName] */
export type AppData = Record<string, unknown>;

// ── Contact ──

export type ContactStatus = 'active' | 'pending' | 'archived';

export interface Contact {
  id: string;
  name: string;
  openIds: string[];                         // 对方的公开地址（多设备多值，[0]=默认发消息目标）
  myOpenId?: string;                         // 我用哪个 OpenID 面对他
  tags: string[];
  notes: string;
  lastContactAt: string;
  status: ContactStatus;
  createdAt: string;
  updatedAt: string;
  apps: Record<string, AppData>;
}

// ── New contact input ──

export interface NewContact {
  name: string;
  id?: string;
  openIds?: string[];
  myOpenId?: string;
  tags?: string[];
  notes?: string;
  status?: ContactStatus;
}

// ── Contact update patch ──

export interface ContactPatch {
  name?: string;
  openIds?: string[];
  myOpenId?: string;
  tags?: string[];
  notes?: string;
  status?: ContactStatus;
  lastContactAt?: string;
}

// ── User identity (self) ──

export interface UserIdentity {
  id: string;
  name: string;
  purpose: string;
  agents: IdentityAgentRef[];
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
  byOpenId: Record<string, string>;
}

// ── Search ──

export interface MatchEntry {
  id: string;
  name: string;
  matchField: 'id' | 'name' | 'tag' | 'note';
  highlight: string;
  tags: string[];
  notes: string;
  openIds: string[];
}

export interface SearchResult {
  query: string;
  exact: MatchEntry[];
  fuzzy: MatchEntry[];
  byTag: MatchEntry[];
  byNote: MatchEntry[];
}

// ── Duplicate detection ──

export type DuplicateReason = 'same_openid' | 'name_similarity';

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

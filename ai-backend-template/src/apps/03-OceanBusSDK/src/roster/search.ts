import type { Contact, MatchEntry, SearchResult, RosterFilter, DuplicateHint, DuplicateReason } from '../types/roster';

function toMatchEntry(c: Contact, field: MatchEntry['matchField'], highlight: string): MatchEntry {
  return {
    id: c.id,
    name: c.name,
    matchField: field,
    highlight,
    tags: c.tags,
    notes: c.notes.slice(0, 80),
    openIds: c.openIds,
  };
}

/** Normalize a string for fuzzy matching: lowercase, remove spaces and punctuation */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\s\-_.,;:!?()（）【】《》""'·•]+/g, '')
    .trim();
}

/** Check if target contains query as a substring (after normalization) */
function containsNormalized(target: string, query: string): boolean {
  return normalize(target).includes(normalize(query));
}

/**
 * Search contacts with conservative fuzzy matching.
 * Exact: query matches id or name exactly (case-insensitive).
 * Fuzzy: query is a substring of name (after normalizing spaces/punctuation).
 * byTag: query matches any tag.
 * byNote: query appears in notes.
 *
 * The result is a structured candidate set — disambiguation is the LLM's job.
 */
export function search(contacts: Contact[], query: string): SearchResult {
  const trimmed = query.trim();
  if (!trimmed) {
    return { query, exact: [], fuzzy: [], byTag: [], byNote: [] };
  }

  const qLower = trimmed.toLowerCase();
  const exactIds = new Set<string>();
  const fuzzyIds = new Set<string>();
  const byTagIds = new Set<string>();
  const byNoteIds = new Set<string>();

  const active = contacts.filter(c => c.status === 'active' || c.status === 'pending');

  for (const c of active) {
    // Exact: id or name
    if (c.id.toLowerCase() === qLower) {
      exactIds.add(c.id);
      continue;
    }
    if (c.name.toLowerCase() === qLower) {
      exactIds.add(c.id);
      continue;
    }

    // Fuzzy: name contains query after normalization
    if (containsNormalized(c.name, trimmed)) {
      fuzzyIds.add(c.id);
      continue;
    }

    // By tag
    if (c.tags.some(t => t.toLowerCase().includes(qLower))) {
      byTagIds.add(c.id);
    }

    // By note
    if (c.notes.toLowerCase().includes(qLower)) {
      byNoteIds.add(c.id);
    }
  }

  const contactMap = new Map(active.map(c => [c.id, c]));

  const build = (ids: Set<string>, field: MatchEntry['matchField'], getHighlight: (c: Contact) => string): MatchEntry[] =>
    Array.from(ids)
      .map(id => contactMap.get(id)!)
      .filter(Boolean)
      .map(c => toMatchEntry(c, field, getHighlight(c)))
      .sort((a, b) => a.name.localeCompare(b.name));

  return {
    query: trimmed,
    exact: build(exactIds, 'name', c => c.name),
    fuzzy: build(fuzzyIds, 'name', c => c.name),
    byTag: build(byTagIds, 'tag', c => c.tags.find(t => t.toLowerCase().includes(qLower)) || ''),
    byNote: build(byNoteIds, 'note', c => {
      const idx = c.notes.toLowerCase().indexOf(qLower);
      const start = Math.max(0, idx - 10);
      const end = Math.min(c.notes.length, idx + qLower.length + 30);
      return (start > 0 ? '…' : '') + c.notes.slice(start, end) + (end < c.notes.length ? '…' : '');
    }),
  };
}

export function getById(contacts: Contact[], id: string): Contact | null {
  return contacts.find(c => c.id === id && c.status !== 'archived') || null;
}

export function findByOpenId(contacts: Contact[], indexes: { byOpenId: Record<string, string> }, openId: string): Contact | null {
  // Try index first, fall back to full scan
  const contactId = indexes.byOpenId[openId];
  if (contactId) {
    const c = getById(contacts, contactId);
    if (c) return c;
  }
  return contacts.find(c => c.status !== 'archived' && c.openIds.includes(openId)) || null;
}

export function list(contacts: Contact[], filter?: RosterFilter): Contact[] {
  let result = contacts.filter(c => c.status !== 'archived');

  if (filter?.status) {
    result = result.filter(c => c.status === filter.status);
  }
  if (filter?.tags && filter.tags.length > 0) {
    result = result.filter(c => filter.tags!.some(t => c.tags.includes(t)));
  }

  const sortBy = filter?.sortBy || 'name';
  const order = filter?.order || 'asc';
  result.sort((a, b) => {
    const cmp = sortBy === 'name'
      ? a.name.localeCompare(b.name)
      : new Date(b[sortBy]).getTime() - new Date(a[sortBy]).getTime();
    return order === 'asc' ? cmp : -cmp;
  });

  const offset = filter?.offset || 0;
  const limit = filter?.limit;
  if (offset > 0) result = result.slice(offset);
  if (limit !== undefined) result = result.slice(0, limit);

  return result;
}

/** Generate a slug from a Chinese or English name */
export function slugFromName(name: string): string {
  // Keep alphanumeric, Chinese chars, hyphens, parens; replace spaces with hyphens
  return name
    .trim()
    .replace(/\s+/g, '-')
    .replace(/（/g, '(').replace(/）/g, ')')
    .replace(/[^a-zA-Z0-9一-鿿\-_()]/g, '')
    .toLowerCase()
    || `contact_${Date.now()}`;
}

// ── Duplicate detection ──

/**
 * Check if a new or updated contact looks like a duplicate of an existing one.
 * Rules (in priority order):
 *   1. Same OpenID — high confidence (0.95)
 *   2. Name highly similar — medium confidence (0.60–0.85)
 *
 * Returns hints for NEW potential duplicates not already in existingHints.
 */
export function findDuplicates(
  incoming: Contact,
  existingContacts: Contact[],
  existingHints: DuplicateHint[],
  now: string
): DuplicateHint[] {
  const newHints: DuplicateHint[] = [];
  const active = existingContacts.filter(c => c.status === 'active' && c.id !== incoming.id);

  const hintedThisCall = new Set<string>();

  for (const c of active) {
    const pairKey = incoming.id < c.id ? `${incoming.id}|${c.id}` : `${c.id}|${incoming.id}`;
    const alreadyHinted = existingHints.some(h =>
      (h.contactA === incoming.id && h.contactB === c.id) ||
      (h.contactA === c.id && h.contactB === incoming.id)
    ) || hintedThisCall.has(pairKey);
    if (alreadyHinted) continue;

    let matched = false;

    // Rule 1: Same OpenID
    for (const oid of incoming.openIds) {
      if (!oid || matched) break;
      if (c.openIds.includes(oid)) {
        newHints.push(makeHint(incoming.id, c.id, 'same_openid', `Both have OpenID ${oid.slice(0, 16)}...`, 0.95, now));
        hintedThisCall.add(pairKey);
        matched = true;
        break;
      }
    }

    // Rule 2: Name similarity (after normalization)
    if (!matched) {
      const sim = nameSimilarity(incoming.name, c.name);
      if (sim >= 0.75 && !hasSameOpenId(incoming, c)) {
        newHints.push(makeHint(incoming.id, c.id, 'name_similarity', `Names similar (score ${sim.toFixed(2)}): "${incoming.name}" ≈ "${c.name}"`, sim, now));
        hintedThisCall.add(pairKey);
      }
    }
  }

  return newHints;
}

/** Dismiss a hint (called after user decides keep-separate or after merge) */
export function dismissHintsForContact(hints: DuplicateHint[], contactId: string): DuplicateHint[] {
  return hints.filter(h => h.contactA !== contactId && h.contactB !== contactId);
}

function makeHint(a: string, b: string, reason: DuplicateReason, detail: string, confidence: number, now: string): DuplicateHint {
  const [contactA, contactB] = a < b ? [a, b] : [b, a];
  return { contactA, contactB, reason, detail, confidence, createdAt: now };
}

function hasSameOpenId(a: Contact, b: Contact): boolean {
  const aSet = new Set(a.openIds.filter(Boolean));
  for (const oid of b.openIds) {
    if (aSet.has(oid)) return true;
  }
  return false;
}

function nameSimilarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 1.0;
  if (na.length === 0 || nb.length === 0) return 0;

  const dist = editDistance(na, nb);
  const maxLen = Math.max(na.length, nb.length);
  return 1 - dist / maxLen;
}

function editDistance(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

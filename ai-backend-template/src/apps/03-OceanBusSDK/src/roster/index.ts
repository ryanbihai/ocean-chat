import { RosterStore } from './store';
import {
  search,
  getById,
  findByAgentId,
  findByOpenId,
  list,
  slugFromName,
  findDuplicates,
  dismissHintsForContact,
} from './search';
import {
  addToIndexes,
  removeFromIndexes,
  updateTagsInIndexes,
  updateAgentsInIndexes,
} from './indexes';
import { extractNames, processPending } from './auto-discovery';
import type {
  Contact,
  NewContact,
  ContactPatch,
  SearchResult,
  RosterFilter,
  AppData,
  PendingEntry,
  RosterData,
  DuplicateHint,
  Provenance,
  ContactSource,
} from '../types/roster';

export type { Contact, NewContact, ContactPatch, SearchResult, RosterFilter, AppData, PendingEntry, RosterData, DuplicateHint, Provenance };

export class RosterService {
  private store: RosterStore;
  private data: RosterData | null = null;

  constructor(store?: RosterStore) {
    this.store = store || new RosterStore();
  }

  private async ensureLoaded(): Promise<RosterData> {
    if (!this.data) {
      this.data = await this.store.load();
    }
    return this.data;
  }

  private async save(): Promise<void> {
    if (!this.data) return;
    await this.store.save(this.data);
  }

  // ── Query ──

  async search(query: string): Promise<SearchResult> {
    const d = await this.ensureLoaded();
    return search(d.contacts, query);
  }

  async get(id: string): Promise<Contact | null> {
    const d = await this.ensureLoaded();
    return getById(d.contacts, id);
  }

  async findByAgentId(agentId: string): Promise<Contact | null> {
    const d = await this.ensureLoaded();
    return findByAgentId(d.contacts, d.indexes, agentId);
  }

  async findByOpenId(openId: string): Promise<Contact | null> {
    const d = await this.ensureLoaded();
    return findByOpenId(d.contacts, d.indexes, openId);
  }

  async list(filter?: RosterFilter): Promise<Contact[]> {
    const d = await this.ensureLoaded();
    return list(d.contacts, filter);
  }

  // ── Write ──

  async add(input: NewContact): Promise<{ contact: Contact; duplicateHints: DuplicateHint[] }> {
    const d = await this.ensureLoaded();
    const now = new Date().toISOString();
    const id = input.id || slugFromName(input.name);

    // Check uniqueness
    if (d.contacts.some(c => c.id === id && c.status !== 'archived')) {
      throw new Error(`Contact with id "${id}" already exists`);
    }

    const provenance = buildProvenance(input.source, null, now);

    const contact: Contact = {
      id,
      name: input.name,
      agents: input.agents || [],
      myOpenId: input.myOpenId,
      tags: input.tags || [],
      aliases: input.aliases || [],
      notes: input.notes || '',
      source: input.source,
      provenance,
      status: input.status || 'active',
      lastContactAt: now,
      createdAt: now,
      updatedAt: now,
      apps: {},
    };

    d.contacts.push(contact);
    addToIndexes(d.indexes, contact);

    // Auto-detect duplicates
    const newHints = findDuplicates(contact, d.contacts, d.duplicateHints, now);
    if (newHints.length > 0) {
      d.duplicateHints.push(...newHints);
    }

    await this.save();
    return { contact, duplicateHints: newHints };
  }

  async update(id: string, patch: ContactPatch): Promise<Contact> {
    const d = await this.ensureLoaded();
    const contact = getById(d.contacts, id);
    if (!contact) throw new Error(`Contact "${id}" not found`);

    const oldTags = [...contact.tags];
    const oldAgentIds = contact.agents.map(a => a.agentId);
    const oldOpenIds = contact.agents.map(a => a.openId);

    if (patch.name !== undefined) contact.name = patch.name;
    if (patch.agents !== undefined) contact.agents = patch.agents;
    if (patch.myOpenId !== undefined) contact.myOpenId = patch.myOpenId;
    if (patch.tags !== undefined) contact.tags = patch.tags;
    if (patch.aliases !== undefined) contact.aliases = patch.aliases;
    if (patch.notes !== undefined) contact.notes = patch.notes;
    if (patch.source !== undefined) contact.source = patch.source;
    if (patch.status !== undefined) contact.status = patch.status;
    if (patch.lastContactAt !== undefined) contact.lastContactAt = patch.lastContactAt;
    contact.updatedAt = new Date().toISOString();
    if (contact.provenance) contact.provenance.lastVerifiedAt = contact.updatedAt;

    // Update indexes
    if (patch.tags) {
      updateTagsInIndexes(d.indexes, contact, oldTags, patch.tags);
    }
    if (patch.agents) {
      updateAgentsInIndexes(
        d.indexes, contact.id,
        oldAgentIds, oldOpenIds,
        contact.agents.map(a => a.agentId), contact.agents.map(a => a.openId)
      );
    }

    await this.save();
    return contact;
  }

  async updateAppData(id: string, appName: string, data: AppData): Promise<Contact> {
    const d = await this.ensureLoaded();
    const contact = getById(d.contacts, id);
    if (!contact) throw new Error(`Contact "${id}" not found`);

    contact.apps[appName] = data;
    contact.updatedAt = new Date().toISOString();
    if (contact.provenance) contact.provenance.lastVerifiedAt = contact.updatedAt;
    await this.save();
    return contact;
  }

  async delete(id: string, soft: boolean = true): Promise<void> {
    const d = await this.ensureLoaded();
    const contact = getById(d.contacts, id);
    if (!contact) throw new Error(`Contact "${id}" not found`);

    if (soft) {
      contact.status = 'archived';
      contact.updatedAt = new Date().toISOString();
      removeFromIndexes(d.indexes, contact);
    } else {
      removeFromIndexes(d.indexes, contact);
      d.contacts = d.contacts.filter(c => c.id !== id);
    }
    await this.save();
  }

  async merge(keepId: string, discardId: string): Promise<Contact> {
    const d = await this.ensureLoaded();
    const keep = getById(d.contacts, keepId);
    const discard = getById(d.contacts, discardId);
    if (!keep) throw new Error(`Contact "${keepId}" not found`);
    if (!discard) throw new Error(`Contact "${discardId}" not found`);

    // Merge agents (dedup by openId — the one identifier we always have)
    const seenOpenIds = new Set(keep.agents.map(a => a.openId));
    for (const a of discard.agents) {
      if (!seenOpenIds.has(a.openId)) {
        keep.agents.push(a);
        seenOpenIds.add(a.openId);
      }
    }
    keep.aliases = [...new Set([...keep.aliases, ...discard.aliases, discard.name])];
    keep.tags = [...new Set([...keep.tags, ...discard.tags])];
    if (discard.notes) keep.notes = keep.notes ? `${keep.notes}; ${discard.notes}` : discard.notes;
    keep.lastContactAt = keep.lastContactAt > discard.lastContactAt ? keep.lastContactAt : discard.lastContactAt;
    keep.updatedAt = new Date().toISOString();
    if (keep.provenance) keep.provenance.lastVerifiedAt = keep.updatedAt;

    // Merge app data (keep wins on conflict)
    for (const [app, appData] of Object.entries(discard.apps)) {
      if (!keep.apps[app]) keep.apps[app] = appData;
    }

    // Dismiss duplicate hints involving either contact
    d.duplicateHints = dismissHintsForContact(d.duplicateHints, keepId);
    d.duplicateHints = dismissHintsForContact(d.duplicateHints, discardId);

    // Soft-delete discard
    removeFromIndexes(d.indexes, discard);
    discard.status = 'archived';
    discard.updatedAt = new Date().toISOString();

    // Rebuild indexes for keep
    removeFromIndexes(d.indexes, keep);
    addToIndexes(d.indexes, keep);

    await this.save();
    return keep;
  }

  async addAlias(id: string, alias: string): Promise<Contact> {
    const contact = await this.get(id);
    if (!contact) throw new Error(`Contact "${id}" not found`);
    if (contact.aliases.includes(alias)) return contact;
    return this.update(id, { aliases: [...contact.aliases, alias] });
  }

  async updateTags(id: string, tags: string[]): Promise<Contact> {
    return this.update(id, { tags });
  }

  async touch(id: string): Promise<void> {
    await this.update(id, { lastContactAt: new Date().toISOString() });
  }

  // ── Auto-discovery ──

  async scanText(text: string): Promise<{ newPending: PendingEntry[]; totalPending: number }> {
    const d = await this.ensureLoaded();
    const names = extractNames(text, d.autoDiscovery.ignoreList, d.contacts);
    const now = new Date().toISOString();
    const added = processPending(d.autoDiscovery, names, now);
    if (added.length > 0) await this.save();
    return { newPending: added, totalPending: d.autoDiscovery.pending.length };
  }

  async getPending(): Promise<PendingEntry[]> {
    const d = await this.ensureLoaded();
    return d.autoDiscovery.pending;
  }

  async approvePending(pendingId: string): Promise<Contact> {
    const d = await this.ensureLoaded();
    const idx = d.autoDiscovery.pending.findIndex(p => p.id === pendingId);
    if (idx === -1) throw new Error(`Pending entry "${pendingId}" not found`);

    const entry = d.autoDiscovery.pending[idx];
    d.autoDiscovery.pending.splice(idx, 1);

    const { contact } = await this.add({
      name: entry.name,
      source: 'auto-discovery',
      notes: `Auto-discovered from: ${entry.contexts.join(' | ')}`,
    });

    await this.save();
    return contact;
  }

  async rejectPending(pendingId: string): Promise<void> {
    const d = await this.ensureLoaded();
    const entry = d.autoDiscovery.pending.find(p => p.id === pendingId);
    if (!entry) throw new Error(`Pending entry "${pendingId}" not found`);
    d.autoDiscovery.pending = d.autoDiscovery.pending.filter(p => p.id !== pendingId);
    if (!d.autoDiscovery.ignoreList.includes(entry.name)) {
      d.autoDiscovery.ignoreList.push(entry.name);
    }
    await this.save();
  }

  // ── Identities (self) ──

  async getIdentities() {
    const d = await this.ensureLoaded();
    return d.identities;
  }

  // ── Duplicate hints ──

  async getDuplicateHints(): Promise<DuplicateHint[]> {
    const d = await this.ensureLoaded();
    return d.duplicateHints;
  }

  /** Dismiss a single hint (user chose "keep separate"). */
  async dismissDuplicateHint(contactA: string, contactB: string): Promise<void> {
    const d = await this.ensureLoaded();
    d.duplicateHints = d.duplicateHints.filter(
      h => !(h.contactA === contactA && h.contactB === contactB) &&
           !(h.contactA === contactB && h.contactB === contactA)
    );
    await this.save();
  }

  // ── Stats ──

  async stats(): Promise<{ total: number; active: number; pending: number; archived: number }> {
    const d = await this.ensureLoaded();
    return {
      total: d.contacts.length,
      active: d.contacts.filter(c => c.status === 'active').length,
      pending: d.contacts.filter(c => c.status === 'pending').length,
      archived: d.contacts.filter(c => c.status === 'archived').length,
    };
  }
}

// ── Helpers ──

function buildProvenance(source: ContactSource, sourceId: string | null, now: string): Provenance {
  return {
    account: source,
    sourceId,
    firstSeenAt: now,
    lastVerifiedAt: now,
  };
}

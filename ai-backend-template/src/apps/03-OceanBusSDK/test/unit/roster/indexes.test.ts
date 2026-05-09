import type { Contact, RosterIndexes } from '../../../src/types/roster';
import {
  addToIndexes,
  removeFromIndexes,
  updateTagsInIndexes,
  updateAgentsInIndexes,
} from '../../../src/roster/indexes';

function makeContact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: 'c1',
    name: 'Test',
    agents: [
      { agentId: 'agent_1', openId: 'open_1', purpose: 'default', isDefault: true },
    ],
    tags: ['friend', 'colleague'],
    aliases: [],
    notes: '',
    lastContactAt: '2026-05-01T00:00:00Z',
    source: 'manual',
    status: 'active',
    createdAt: '2026-05-01T00:00:00Z',
    updatedAt: '2026-05-01T00:00:00Z',
    apps: {},
    ...overrides,
  };
}

function emptyIndexes(): RosterIndexes {
  return { byTag: {}, byAgentId: {}, byOpenId: {} };
}

describe('roster indexes', () => {
  describe('addToIndexes', () => {
    it('adds tags to byTag', () => {
      const idx = emptyIndexes();
      addToIndexes(idx, makeContact());
      expect(idx.byTag.friend).toEqual(['c1']);
      expect(idx.byTag.colleague).toEqual(['c1']);
    });

    it('adds agentId and openId mappings', () => {
      const idx = emptyIndexes();
      addToIndexes(idx, makeContact());
      expect(idx.byAgentId.agent_1).toBe('c1');
      expect(idx.byOpenId.open_1).toBe('c1');
    });

    it('deduplicates tag entries', () => {
      const idx = emptyIndexes();
      addToIndexes(idx, makeContact());
      addToIndexes(idx, makeContact());
      expect(idx.byTag.friend).toEqual(['c1']);
    });
  });

  describe('removeFromIndexes', () => {
    it('removes tag entries', () => {
      const idx = emptyIndexes();
      addToIndexes(idx, makeContact());
      removeFromIndexes(idx, makeContact());
      expect(idx.byTag.friend).toBeUndefined();
    });

    it('removes agentId and openId', () => {
      const idx = emptyIndexes();
      addToIndexes(idx, makeContact());
      removeFromIndexes(idx, makeContact());
      expect(idx.byAgentId.agent_1).toBeUndefined();
      expect(idx.byOpenId.open_1).toBeUndefined();
    });

    it('does not remove other contacts sharing same tag', () => {
      const idx = emptyIndexes();
      addToIndexes(idx, makeContact({ id: 'c1' }));
      addToIndexes(idx, makeContact({ id: 'c2' }));
      removeFromIndexes(idx, makeContact({ id: 'c1' }));
      expect(idx.byTag.friend).toEqual(['c2']);
    });
  });

  describe('updateTagsInIndexes', () => {
    it('adds new tags and removes old ones', () => {
      const idx = emptyIndexes();
      const contact = makeContact();
      addToIndexes(idx, contact);

      updateTagsInIndexes(idx, contact, ['friend', 'colleague'], ['friend', 'gym']);

      expect(idx.byTag.friend).toEqual(['c1']); // kept
      expect(idx.byTag.gym).toEqual(['c1']);    // added
      expect(idx.byTag.colleague).toBeUndefined(); // removed
    });
  });

  describe('updateAgentsInIndexes', () => {
    it('replaces agentId and openId mappings', () => {
      const idx = emptyIndexes();
      addToIndexes(idx, makeContact());

      updateAgentsInIndexes(
        idx, 'c1',
        ['agent_1'], ['open_1'],
        ['agent_2'], ['open_2']
      );

      expect(idx.byAgentId.agent_1).toBeUndefined();
      expect(idx.byAgentId.agent_2).toBe('c1');
      expect(idx.byOpenId.open_1).toBeUndefined();
      expect(idx.byOpenId.open_2).toBe('c1');
    });
  });
});

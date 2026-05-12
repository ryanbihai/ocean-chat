import {
  search,
  getById,
  findByOpenId,
  list,
  slugFromName,
  findDuplicates,
  dismissHintsForContact,
} from '../../../src/roster/search';
import type { Contact, RosterIndexes, DuplicateHint } from '../../../src/types/roster';

function makeContact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: 'laowang',
    name: '老王',
    openIds: ['open_001'],
    tags: ['friend', 'badminton'],
    notes: '大学同学，喜欢川菜',
    lastContactAt: '2026-05-06T12:00:00Z',
    status: 'active',
    createdAt: '2026-04-01T10:00:00Z',
    updatedAt: '2026-05-06T15:30:00Z',
    apps: {},
    ...overrides,
  };
}

const laowang = makeContact();
const wangcai = makeContact({
  id: 'wangcai',
  name: '老王',
  openIds: ['open_002'],
  tags: ['colleague', 'finance'],
  notes: '公司财务',
});
const wangjianguo = makeContact({
  id: 'wangjianguo',
  name: '王建国',
  openIds: ['open_003'],
  tags: ['colleague'],
  notes: '',
});
const lizhi = makeContact({
  id: 'lizhi',
  name: '李志',
  openIds: ['open_004'],
  tags: ['gym'],
  notes: '健身房认识，每周二练腿',
});
const archived = makeContact({
  id: 'archived_guy',
  name: '已归档',
  status: 'archived',
});

const allContacts = [laowang, wangcai, wangjianguo, lizhi, archived];

const indexes: RosterIndexes = {
  byTag: {
    friend: ['laowang'],
    badminton: ['laowang'],
    colleague: ['wangcai', 'wangjianguo'],
    finance: ['wangcai'],
    gym: ['lizhi'],
  },
  byOpenId: {
    open_001: 'laowang',
    open_002: 'wangcai',
    open_003: 'wangjianguo',
    open_004: 'lizhi',
  },
};

describe('roster search', () => {
  describe('search()', () => {
    it('exact match by name', () => {
      const result = search(allContacts, '老王');
      expect(result.exact).toHaveLength(2); // two "老王"
      expect(result.exact.map(e => e.id).sort()).toEqual(['laowang', 'wangcai']);
    });

    it('exact match by id', () => {
      const result = search(allContacts, 'laowang');
      expect(result.exact).toHaveLength(1);
      expect(result.exact[0].id).toBe('laowang');
    });

    it('case-insensitive exact match', () => {
      const result = search(allContacts, 'LAOWANG');
      expect(result.exact).toHaveLength(1);
    });

    it('fuzzy match: name contains query', () => {
      const result = search(allContacts, '建国');
      expect(result.fuzzy).toHaveLength(1);
      expect(result.fuzzy[0].id).toBe('wangjianguo');
    });

    it('fuzzy match: query with extra spaces', () => {
      const result = search(allContacts, '老 王');
      expect(result.fuzzy).toHaveLength(2); // both contacts with 老王 in name
    });

    it('fuzzy match: query with punctuation', () => {
      const result = search(allContacts, '老·王');
      expect(result.fuzzy.length).toBeGreaterThanOrEqual(2);
    });

    it('byTag match', () => {
      const result = search(allContacts, 'badminton');
      expect(result.byTag).toHaveLength(1);
      expect(result.byTag[0].id).toBe('laowang');
    });

    it('byNote match', () => {
      const result = search(allContacts, '川菜');
      expect(result.byNote).toHaveLength(1);
      expect(result.byNote[0].id).toBe('laowang');
    });

    it('empty query returns all empty', () => {
      const result = search(allContacts, '');
      expect(result.exact).toHaveLength(0);
      expect(result.fuzzy).toHaveLength(0);
    });

    it('no match returns all empty', () => {
      const result = search(allContacts, '不存在的名字');
      expect(result.exact).toHaveLength(0);
      expect(result.fuzzy).toHaveLength(0);
      expect(result.byTag).toHaveLength(0);
      expect(result.byNote).toHaveLength(0);
    });

    it('does not return archived contacts', () => {
      const result = search(allContacts, '已归档');
      expect(result.exact).toHaveLength(0);
    });

    it('exact match has priority over fuzzy', () => {
      const result = search(allContacts, '李志');
      expect(result.exact).toHaveLength(1);
      expect(result.exact[0].id).toBe('lizhi');
      expect(result.fuzzy).toHaveLength(0);
    });
  });

  describe('getById()', () => {
    it('returns contact by id', () => {
      expect(getById(allContacts, 'laowang')?.name).toBe('老王');
    });

    it('returns null for missing id', () => {
      expect(getById(allContacts, 'nonexistent')).toBeNull();
    });

    it('returns null for archived contact', () => {
      expect(getById(allContacts, 'archived_guy')).toBeNull();
    });
  });

  describe('findByOpenId()', () => {
    it('finds contact by openId via index', () => {
      const result = findByOpenId(allContacts, indexes, 'open_004');
      expect(result?.id).toBe('lizhi');
    });

    it('returns null for unknown openId', () => {
      expect(findByOpenId(allContacts, indexes, 'unknown')).toBeNull();
    });
  });

  describe('list()', () => {
    it('returns all active contacts sorted by name', () => {
      const results = list(allContacts);
      expect(results).toHaveLength(4); // excludes archived
      for (let i = 0; i < results.length - 1; i++) {
        expect(results[i].name.localeCompare(results[i + 1].name)).toBeLessThanOrEqual(0);
      }
    });

    it('filters by tag', () => {
      const results = list(allContacts, { tags: ['colleague'] });
      expect(results).toHaveLength(2);
    });

    it('sorts by lastContactAt desc', () => {
      const results = list(allContacts, { sortBy: 'lastContactAt', order: 'desc' });
      expect(results).toHaveLength(4);
    });

    it('paginates with offset and limit', () => {
      const results = list(allContacts, { offset: 1, limit: 2 });
      expect(results).toHaveLength(2);
    });
  });

  describe('slugFromName()', () => {
    it('generates slug from Chinese name', () => {
      expect(slugFromName('老王')).toBe('老王');
    });

    it('generates slug from English name', () => {
      expect(slugFromName('John Doe')).toBe('john-doe');
    });

    it('removes special characters', () => {
      expect(slugFromName('老·王')).toBe('老王');
    });
  });

  describe('findDuplicates()', () => {
    const now = '2026-05-07T00:00:00Z';
    const emptyHints: DuplicateHint[] = [];

    it('detects same openId', () => {
      const incoming = makeContact({ id: 'new', name: '新老王', openIds: ['open_001'] });
      const hints = findDuplicates(incoming, allContacts, emptyHints, now);
      expect(hints).toHaveLength(1);
      expect(hints[0].reason).toBe('same_openid');
      expect(hints[0].confidence).toBe(0.95);
    });

    it('detects identical name with different openId', () => {
      const incoming = makeContact({ id: 'new', name: '老王', openIds: ['open_new'] });
      const hints = findDuplicates(incoming, allContacts, emptyHints, now);
      const nameHints = hints.filter(h => h.reason === 'name_similarity');
      expect(nameHints.length).toBeGreaterThanOrEqual(2); // matches both laowang and wangcai
      expect(nameHints[0].confidence).toBe(1.0); // exact name match
    });

    it('does not flag completely different names', () => {
      const incoming = makeContact({ id: 'new', name: '赵六', openIds: ['open_new'] });
      const hints = findDuplicates(incoming, allContacts, emptyHints, now);
      expect(hints).toHaveLength(0);
    });

    it('does not flag same openId if already hinted', () => {
      const existingHints: DuplicateHint[] = [{
        contactA: 'laowang', contactB: 'new', reason: 'same_openid',
        detail: '...', confidence: 0.95, createdAt: now,
      }];
      const incoming = makeContact({ id: 'new', name: '新老王', openIds: ['open_001'] });
      const hints = findDuplicates(incoming, allContacts, existingHints, now);
      expect(hints).toHaveLength(0);
    });

    it('canonical order: smaller id first', () => {
      const incoming = makeContact({ id: 'zzz_late', name: '后期', openIds: ['open_001'] });
      const hints = findDuplicates(incoming, allContacts, emptyHints, now);
      expect(hints[0].contactA < hints[0].contactB).toBe(true);
    });
  });

  describe('dismissHintsForContact()', () => {
    const now = '2026-05-07T00:00:00Z';
    const hints: DuplicateHint[] = [
      { contactA: 'a', contactB: 'b', reason: 'same_openid', detail: '...', confidence: 0.95, createdAt: now },
      { contactA: 'a', contactB: 'c', reason: 'name_similarity', detail: '...', confidence: 0.70, createdAt: now },
      { contactA: 'd', contactB: 'e', reason: 'name_similarity', detail: '...', confidence: 0.85, createdAt: now },
    ];

    it('removes all hints involving given contact', () => {
      const result = dismissHintsForContact(hints, 'a');
      expect(result).toHaveLength(1);
      expect(result[0].contactA).toBe('d');
    });

    it('no-op for contact without hints', () => {
      const result = dismissHintsForContact(hints, 'z');
      expect(result).toHaveLength(3);
    });
  });
});

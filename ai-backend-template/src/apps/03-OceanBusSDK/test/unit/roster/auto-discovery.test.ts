import { extractNames, processPending } from '../../../src/roster/auto-discovery';
import type { Contact, AutoDiscoveryConfig } from '../../../src/types/roster';

function makeConfig(overrides: Partial<AutoDiscoveryConfig> = {}): AutoDiscoveryConfig {
  return {
    enabled: true,
    minMentions: 3,
    sources: ['chat.log'],
    ignoreList: ['我', '你', '他'],
    pending: [],
    ...overrides,
  };
}

describe('auto-discovery', () => {
  describe('extractNames', () => {
    const existingContacts: Contact[] = [];
    const ignoreList: string[] = ['我', '你', '他', '她'];

    it('extracts names with surname pattern', () => {
      const result = extractNames('李丽那边回复了，张伟也同意了', ignoreList, existingContacts);
      expect(result.has('李丽')).toBe(true);
      expect(result.has('张伟')).toBe(true);
    });

    it('extracts names with prefix 老/小/阿', () => {
      const result = extractNames('老赵说了算，小陈也去', ignoreList, existingContacts);
      expect(result.has('老赵')).toBe(true);
      expect(result.has('小陈')).toBe(true);
    });

    it('extracts names with suffix 总/哥/姐', () => {
      const result = extractNames('王总那边通过了，李姐也签字了', ignoreList, existingContacts);
      expect(result.has('王总')).toBe(true);
      expect(result.has('李姐')).toBe(true);
    });

    it('counts multiple occurrences', () => {
      const result = extractNames(
        '李丽来了，李丽说可以，李丽明天签',
        ignoreList,
        existingContacts
      );
      expect(result.get('李丽')?.count).toBe(3);
    });

    it('skips ignored words', () => {
      const result = extractNames('你我他她都去', ignoreList, existingContacts);
      expect(result.has('你我')).toBe(false);
    });

    it('skips known contact names', () => {
      const result = extractNames(
        '老王来不来',
        ignoreList,
        [{ name: '老王' } as Contact]
      );
      expect(result.has('老王')).toBe(false);
    });

    it('captures context around name', () => {
      const result = extractNames(
        '上次跟李丽聊的方案她挺满意',
        ignoreList,
        existingContacts
      );
      const info = result.get('李丽');
      expect(info?.contexts.length).toBeGreaterThanOrEqual(1);
      expect(info?.contexts[0]).toContain('李丽');
    });

    it('returns empty for no names', () => {
      const result = extractNames('今天的天气真好', ignoreList, existingContacts);
      expect(result.size).toBe(0);
    });
  });

  describe('processPending', () => {
    it('adds names meeting minMentions threshold', () => {
      const config = makeConfig({ minMentions: 3 });
      const names = new Map([
        ['李丽', { count: 5, contexts: ['ctx1', 'ctx2'] }],
        ['张伟', { count: 1, contexts: ['ctx3'] }],
      ]);
      const added = processPending(config, names, '2026-05-07T00:00:00Z');
      expect(added).toHaveLength(1);
      expect(added[0].name).toBe('李丽');
      expect(added[0].mentionCount).toBe(5);
      expect(config.pending).toHaveLength(1);
    });

    it('updates existing pending entry', () => {
      const config = makeConfig({
        pending: [
          {
            id: 'auto_lili',
            name: '李丽',
            mentionCount: 3,
            firstSeenAt: '2026-05-01T00:00:00Z',
            lastSeenAt: '2026-05-01T00:00:00Z',
            contexts: ['old context'],
          },
        ],
      });
      const names = new Map([
        ['李丽', { count: 2, contexts: ['new context'] }],
      ]);
      const added = processPending(config, names, '2026-05-07T00:00:00Z');
      expect(added).toHaveLength(0); // not new
      expect(config.pending[0].mentionCount).toBe(5); // 3 + 2
      expect(config.pending[0].contexts).toContain('new context');
    });

    it('does not add names below threshold', () => {
      const config = makeConfig({ minMentions: 3 });
      const names = new Map([
        ['张伟', { count: 2, contexts: ['ctx1'] }],
      ]);
      const added = processPending(config, names, '2026-05-07T00:00:00Z');
      expect(added).toHaveLength(0);
    });
  });
});

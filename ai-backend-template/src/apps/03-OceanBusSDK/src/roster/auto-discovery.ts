import type { PendingEntry, AutoDiscoveryConfig, Contact } from '../types/roster';
import { slugFromName } from './search';

// Pattern: Chinese surname (1-2 chars) + given name (1-2 chars)
// Also matches common prefixes like 老X, 小X, 阿X
const SURNAMES = '赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜戚谢邹喻柏水窦章云苏潘葛奚范彭郎鲁韦昌马苗凤花方俞任袁柳酆鲍史唐费廉岑薛雷贺倪汤滕殷罗毕郝邬安常乐于时傅皮下齐康伍余元卜顾孟平黄和穆萧尹姚邵湛汪祁毛禹狄米贝明臧计伏成戴谈宋茅庞熊纪舒屈项祝董梁杜阮蓝闵席季麻强贾路娄危江童颜郭梅盛林刁钟徐邱骆高夏蔡田樊胡凌霍虞万支柯昝管卢莫经房裘缪干解应宗丁宣贲邓郁单杭洪包诸左石崔吉钮龚程嵇邢滑裴陆荣翁荀羊於惠甄麴家封芮羿储靳汲邴糜松井段富巫乌焦巴弓牧隗山谷车侯宓蓬全郗班仰秋仲伊宫宁仇栾暴甘钭厉戎祖武符刘景詹束龙叶幸司韶郜黎蓟薄印宿白怀蒲邰从鄂索咸籍赖卓蔺屠蒙池乔阴鬱胥能苍双闻莘党翟谭贡劳逄姬申扶堵冉宰郦雍卻璩桑桂濮牛寿通边扈燕冀郏浦尚农温别庄晏柴瞿阎充慕连茹习宦艾鱼容向古易慎戈廖庾终暨居衡步都耿满弘匡国文寇广禄阙东欧殳沃利蔚越夔隆师巩厍聂晁勾敖融冷訾辛阚那简饶空曾毋沙乜养鞠须丰巢关蒯相查后荆红游竺权逯盖益桓公';
const CJK_CHAR = '[\\u4e00-\\u9fff]';

// Pattern: optional prefix + surname + 1-2 CJK chars (lazy: prefer shorter match)
const CHINESE_NAME_RE = new RegExp(`(?:老|小|阿)?[${SURNAMES}]${CJK_CHAR}{1,2}?`, 'g');

// Match: 2-3 char Chinese-looking words that appear to be names
const NAME_PREFIXES = ['老', '小', '阿', '大'];
const NAME_SUFFIXES = ['总', '哥', '姐', '兄', '老师', '经理', '工', '老板', '师傅', '同学'];

/**
 * Extract potential Chinese person names from a block of text.
 * Returns unique names sorted by occurrence count.
 */
export function extractNames(
  text: string,
  ignoreList: string[],
  existingContacts: Contact[]
): Map<string, { count: number; contexts: string[] }> {
  const results = new Map<string, { count: number; contexts: string[] }>();
  const ignoreSet = new Set(ignoreList.map(w => w.toLowerCase()));
  const knownNames = new Set(existingContacts.map(c => c.name));

  // Strategy 1: Chinese surname pattern
  let match: RegExpExecArray | null;
  const re = new RegExp(CHINESE_NAME_RE.source, 'g');
  while ((match = re.exec(text)) !== null) {
    const name = match[0];
    if (ignoreSet.has(name.toLowerCase()) || knownNames.has(name)) continue;
    addCandidate(results, name, text, match.index);
  }

  // Strategy 2: Prefix + name (老X, 小X, 阿X)
  for (const prefix of NAME_PREFIXES) {
    const prefixRe = new RegExp(`${prefix}[\\u4e00-\\u9fff]{1,2}?`, 'g');
    while ((match = prefixRe.exec(text)) !== null) {
      const name = match[0];
      if (ignoreSet.has(name.toLowerCase()) || knownNames.has(name)) continue;
      addCandidate(results, name, text, match.index);
    }
  }

  // Strategy 3: Name + suffix (X总, X哥, etc.)
  for (const suffix of NAME_SUFFIXES) {
    const suffixRe = new RegExp(`([\\u4e00-\\u9fff]{1,3}?)${suffix}`, 'g');
    while ((match = suffixRe.exec(text)) !== null) {
      const fullName = match[0];
      if (ignoreSet.has(fullName.toLowerCase()) || knownNames.has(fullName)) continue;
      addCandidate(results, fullName, text, match.index);
    }
  }

  return results;
}

function addCandidate(
  map: Map<string, { count: number; contexts: string[] }>,
  name: string,
  text: string,
  index: number
): void {
  const existing = map.get(name);
  const context = extractContext(text, index, name.length);
  if (existing) {
    existing.count++;
    if (existing.contexts.length < 3 && !existing.contexts.includes(context)) {
      existing.contexts.push(context);
    }
  } else {
    map.set(name, { count: 1, contexts: [context] });
  }
}

function extractContext(text: string, index: number, len: number): string {
  const start = Math.max(0, index - 20);
  const end = Math.min(text.length, index + len + 20);
  let ctx = text.slice(start, end);
  if (start > 0) ctx = '…' + ctx;
  if (end < text.length) ctx = ctx + '…';
  return ctx;
}

/**
 * Process scan results against autoDiscovery config.
 * Returns new pending entries that met the minMentions threshold.
 */
export function processPending(
  config: AutoDiscoveryConfig,
  newNames: Map<string, { count: number; contexts: string[] }>,
  now: string
): PendingEntry[] {
  const added: PendingEntry[] = [];
  const existingByName = new Map<string, PendingEntry>();
  for (const p of config.pending) existingByName.set(p.name, p);

  for (const [name, info] of newNames) {
    const existing = existingByName.get(name);
    if (existing) {
      // Update existing
      existing.mentionCount += info.count;
      existing.lastSeenAt = now;
      existing.contexts = [...new Set([...existing.contexts, ...info.contexts])].slice(0, 5);
    } else if (info.count >= config.minMentions) {
      const entry: PendingEntry = {
        id: `auto_${slugFromName(name)}`,
        name,
        mentionCount: info.count,
        firstSeenAt: now,
        lastSeenAt: now,
        contexts: info.contexts.slice(0, 5),
      };
      config.pending.push(entry);
      added.push(entry);
    }
  }

  return added;
}

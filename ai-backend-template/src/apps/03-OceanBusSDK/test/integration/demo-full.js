#!/usr/bin/env node
'use strict';

/**
 * OceanBus SDK 全能力演示脚本
 *
 * 用途：给技术伙伴一键跑通，理解 OceanBus SDK 能做什么。
 * 运行：node demo-full.js
 *
 * 覆盖：
 *   1. 身份注册       2. 密钥与加密
 *   3. 收发消息       4. 实时监听
 *   5. 黄页发布/发现   6. 通讯录管理
 *   7. 拉黑/解封      8. 声誉记录
 *   9. AgentCard     10. API Key 管理
 *  11. 拦截器        12. 清理销毁
 */

const { createOceanBus, RosterService, OceanBusError } = require('oceanbus');

// ── 工具函数 ──────────────────────────────────────────────────────────────

const step = (() => { let n = 0; return (s) => console.log(`\n${'═'.repeat(60)}\n  ${++n}. ${s}\n${'═'.repeat(60)}`); })();
const ok = (s) => console.log(`  ✓ ${s}`);
const info = (s) => console.log(`  ℹ ${s}`);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const short = (s) => s ? s.slice(0, 8) + '...' : '(无)';

// ── 主流程 ────────────────────────────────────────────────────────────────

async function main() {
  console.log('🌊 OceanBus SDK — 全能力演示');
  console.log(`   SDK 版本: ${require('oceanbus/package.json').version}`);
  console.log('   运行时间: ' + new Date().toLocaleString('zh-CN'));

  // ══════════════════════════════════════════════════════════════════════
  // 1. 创建实例 + 注册身份
  // ══════════════════════════════════════════════════════════════════════
  step('创建实例 + 注册身份');

  const alice = await createOceanBus();   // Alice — 默认配置
  const aliceReg = await alice.register();
  const aliceOpenid = await alice.getOpenId();
  ok(`Alice 已注册, OpenID: ${short(aliceOpenid)}`);

  const bob = await createOceanBus();     // Bob — 也是默认配置
  await bob.register();
  const bobOpenid = await bob.getOpenId();
  ok(`Bob   已注册, OpenID: ${short(bobOpenid)}`);

  // 2. 密钥与加密
  // ══════════════════════════════════════════════════════════════════════
  step('密钥与加密');

  // 生成 Ed25519 密钥对
  const keypair = await alice.crypto.generateKeypair();
  const { publicKey, secretKey } = alice.crypto.keypairToBase64url(keypair);
  ok(`生成密钥对, 公钥前8: ${publicKey.slice(0, 8)}...`);

  // 签名 + 验证
  const payload = { action: 'trade', amount: 100, currency: 'CNY' };
  const canonical = alice.crypto.canonicalize(payload);
  const sig = await alice.crypto.sign(keypair, payload);
  const valid = await alice.crypto.verify(keypair.publicKey, payload, sig);
  ok(`签名验证: ${valid ? '通过' : '失败'}`);
  info(`  规范JSON: ${canonical.slice(0, 50)}...`);
  info(`  签名: ${sig.slice(0, 20)}...`);

  // 密钥格式互转 (Hex ↔ Base64url)
  const hex = alice.crypto.keypairToHex(keypair);
  const restored = alice.crypto.hexToKeypair(hex.publicKey, hex.secretKey);
  const valid2 = await alice.crypto.verify(restored.publicKey, payload, sig);
  ok(`Hex 往返后签名仍有效: ${valid2 ? '是' : '否'}`);

  // 3. 收发消息 (文本 + JSON)
  // ══════════════════════════════════════════════════════════════════════
  step('收发消息');

  // 文本消息
  await alice.send(bobOpenid, 'Bob 你好！周六一起打羽毛球吗？🏸');
  ok('Alice → Bob: 文本消息已发送');

  // JSON 消息
  await alice.sendJson(bobOpenid, {
    type: 'invitation',
    event: '羽毛球',
    time: '周六 15:00',
    location: '朝阳体育馆',
  });
  ok('Alice → Bob: JSON 消息已发送');

  // Bob 收消息
  await sleep(2000);
  const bobMessages = await bob.sync();
  ok(`Bob 收到 ${bobMessages.length} 条新消息`);
  for (const m of bobMessages) {
    const isJson = m.content && m.content.startsWith('{');
    info(`  来自 ${short(m.from_openid)}: ${isJson ? '[JSON]' : m.content?.slice(0, 40)}`);
  }

  // 4. 实时监听
  // ══════════════════════════════════════════════════════════════════════
  step('实时监听');

  const bobInbox = [];
  const stopBob = bob.startListening((msg) => {
    bobInbox.push(msg);
    console.log(`  📬 Bob 实时收到: ${msg.content?.slice(0, 50)}`);
  });
  ok('Bob 已启动实时监听 (2s polling)');

  // Alice 发一条消息，Bob 实时收到
  await sleep(500);
  await alice.send(bobOpenid, '这条消息 Bob 会实时收到！⚡');
  await sleep(3000);
  ok(`Bob 实时收件箱有 ${bobInbox.length} 条消息`);

  // 5. 黄页 (发布 + 发现)
  // ══════════════════════════════════════════════════════════════════════
  step('黄页发布与发现');

  // Alice 发布到黄页
  await alice.publish({
    tags: ['sports', 'badminton', 'Beijing'],
    description: 'Alice — 羽毛球爱好者，常驻朝阳区',
    summary: '找球友，周末约球',
    a2a_compatible: true,
  });
  ok('Alice 已发布到黄页 (标签: sports, badminton, Beijing)');

  // Bob 搜索 Alice
  const discoverResult = await bob.l1.yellowPages.discover(['sports', 'badminton'], 5);
  if (discoverResult.data?.entries?.length > 0) {
    ok(`Bob 在黄页找到 ${discoverResult.data.entries.length} 个结果`);
    for (const e of discoverResult.data.entries) {
      info(`  ${e.description || '(无描述)'} — OpenID: ${short(e.openid)}`);
    }
  } else {
    info('黄页搜索无结果 (可能服务不可达，跳过)');
  }

  // 6. 通讯录管理 (Roster)
  // ══════════════════════════════════════════════════════════════════════
  step('通讯录管理 (Roster)');

  // 添加联系人 (如已存在则更新)
  try {
    await alice.roster.add({
      name: 'Bob',
      agents: [{ agentId: '', openId: bobOpenid, purpose: '球友', isDefault: true }],
      tags: ['friend', 'badminton'],
      notes: '周六羽毛球搭档',
      source: 'manual',
    });
    ok('Alice 已添加 Bob 到通讯录');
  } catch (e) {
    if (e.message.includes('already exists')) {
      await alice.roster.update('bob', { notes: '周六羽毛球搭档 (重复运行更新)' });
      ok('Bob 已存在 — 已更新 (重复运行测试)');
    } else {
      throw e;
    }
  }

  // 搜索联系人
  const searchResult = await alice.roster.search('Bob');
  ok(`搜索 "Bob": exact=${searchResult.exact.length}, fuzzy=${searchResult.fuzzy.length}`);

  // 查看联系人详情
  const bobContact = await alice.roster.get('bob');
  ok(`Bob 详情: 标签 [${bobContact.tags.join(', ')}], 备注: ${bobContact.notes}`);

  // 修改联系人
  await alice.roster.update('bob', { notes: '球技很好，上周赢了我三局' });
  await alice.roster.updateTags('bob', ['friend', 'badminton', 'rival']);
  const updated = await alice.roster.get('bob');
  ok(`已更新 Bob: 标签 [${updated.tags.join(', ')}], 备注: ${updated.notes}`);

  // 别名
  await alice.roster.addAlias('bob', '波哥');
  ok('已添加别名: 波哥 → Bob');

  // 列出所有联系人
  const allContacts = await alice.roster.list();
  ok(`Alice 通讯录共 ${allContacts.length} 人`);

  // 记录一次联系 (touch)
  await alice.roster.touch('bob');
  ok('已更新 Bob 的最后联系时间');

  // 7. 拉黑 / 解封
  // ══════════════════════════════════════════════════════════════════════
  step('拉黑与解封');

  // 拉黑
  await alice.blockSender(bobOpenid);
  ok(`Alice 已拉黑 ${short(bobOpenid)}`);
  info(`  是否在拉黑名单: ${alice.isBlocked(bobOpenid) ? '是' : '否'}`);
  info(`  拉黑名单: ${alice.getBlocklist().length} 条`);

  // 解封
  await alice.unblockSender(bobOpenid);
  ok('Alice 已解封 Bob');
  info(`  是否在拉黑名单: ${alice.isBlocked(bobOpenid) ? '是' : '否'}`);

  // 8. 声誉记录
  // ══════════════════════════════════════════════════════════════════════
  step('声誉记录');

  // 需要先设置身份才能记录声誉
  const repKey = await alice.createServiceKey();
  alice.l1.reputation.setIdentity(aliceOpenid, repKey.signer, repKey.publicKey);

  try {
    const repResult = await alice.recordReputationFact({
      subjectOpenid: bobOpenid,
      factType: 'trade',
      factSubtype: 'badminton_match',
      factData: { result: 'alice_win', score: '21:18' },
    });
    ok(`声誉记录结果: code=${repResult.code}`);
  } catch (e) {
    info(`声誉记录跳过 (服务可能不可达): ${e.message}`);
  }

  // 9. AgentCard
  // ══════════════════════════════════════════════════════════════════════
  step('AgentCard');

  const { computeCardHash, verifyCardHash } = require('oceanbus');

  // 构造 AgentCard
  const aliceCard = {
    name: 'Alice',
    description: '羽毛球陪练 Agent',
    version: '1.0.0',
    capabilities: ['chat', 'schedule', 'sports-booking'],
    endpoint: 'https://example.com/alice-agent',
  };

  // 计算哈希
  const cardHash = computeCardHash(aliceCard);
  ok(`AgentCard 哈希: ${cardHash.slice(0, 12)}...`);

  // 本地验证
  const cardValid = verifyCardHash(aliceCard, cardHash);
  ok(`本地验证: ${cardValid ? '通过' : '失败'}`);

  // 篡改检测
  const tamperedCard = { ...aliceCard, description: '黑客冒充' };
  const tamperedValid = verifyCardHash(tamperedCard, cardHash);
  ok(`篡改检测: ${tamperedValid ? '未检测到(失败!)' : '正确检测到篡改'}`);

  // 10. API Key 管理
  // ══════════════════════════════════════════════════════════════════════
  step('API Key 管理');

  const newKey = await alice.createApiKey();
  ok(`创建新 Key: ${newKey.key_id}`);
  info(`  API Key: ${newKey.api_key.slice(0, 10)}...`);

  await alice.revokeApiKey(newKey.key_id);
  ok(`已吊销 Key: ${newKey.key_id}`);

  // 11. 声誉评价器 (基于 OceanBus 声誉白皮书 v2.0)
  // ══════════════════════════════════════════════════════════════════════
  step('声誉评价器 — 三层核心标签 + 反女巫信号');

  // ── 声誉评价器：按白皮书双层标签体系做消息准入 ──
  //
  // 核心标签（协议定义，绑定条件由 L0 元数据可机械验证）：
  //   可靠   — 交付了准确的服务，绑定条件: 双向通信 + 交互≥1h + 消息≥5条
  //   骚扰   — 诈骗/垃圾信息/恶意骚扰，绑定条件: 标记者必须是消息收件方
  //   违法   — 涉暴恐等严重违法，绑定条件: 必须附带 L0 消息证据 + 上下文±5条
  //
  // 自由标签（偏好表达，每对标记者-目标最多3个）：
  //   "好吃" "太慢" "回复快" "热情" — 非信任信号，只展示计数
  //
  // 反女巫信号（标记者画像 tagger_summary）：
  //   avg_age_days          标记者均龄 >90正常 <7女巫
  //   reliable_pct          标记者自身可靠% >80%正常 0%女巫
  //   harassment_pct        标记者自身骚扰% <5%正常 >50%女巫
  //   avg_degree            标记者通信伙伴数 >20正常 <3女巫
  //   cluster_ratio         标签小圈子集中度 <0.3正常 >0.9女巫
  //   registration_span_days 标记者注册时间跨度 >180正常 <7女巫
  //   tag_span_days          打标签时间跨度 >90正常 <3女巫

  const reputationEvaluator = {
    name: 'reputation-gate',
    priority: 100,  // 最先执行 — 声誉判断是消息准入的第一道闸

    async evaluate(msg, ctx) {
      // ── 从声誉服务拉取发送者的标签图 ──
      let rep;
      try {
        const res = await alice.l1.reputation.queryReputation([msg.from_openid]);
        rep = res.data?.results?.[0];
      } catch (_) {
        // 声誉服务不可达 → 标记为未验证，放行但提醒
        return { action: 'flag', reason: '声誉服务不可达，无法验证发送者', risk: 'medium' };
      }

      if (!rep) {
        // 新 Agent，没有任何标签数据 → 放行但标记
        return { action: 'flag', reason: '发送者无声誉数据（新 Agent）', risk: 'low' };
      }

      // ── 第一层：核心标签硬规则 ──

      // 违法标签 → 立即屏蔽（宪法第一条例外窗口：证据保全）
      const illegalTag = rep.core_tags?.find(t => t.label === '违法');
      if (illegalTag && illegalTag.count > 0) {
        return { action: 'block', reason: `发送者有 ${illegalTag.count} 条"违法"标签` };
      }

      // 骚扰标签 → 检查标记者画像，防止拒服攻击
      const harassmentTag = rep.core_tags?.find(t => t.label === '骚扰');
      if (harassmentTag && harassmentTag.count > 0) {
        const ts = harassmentTag.tagger_summary;
        // 标记者画像正常 → 标签可信，屏蔽
        if (ts && ts.avg_age_days > 90 && ts.reliable_pct > 80) {
          return { action: 'block', reason: `发送者有 ${harassmentTag.count} 条"骚扰"标签（标记者画像正常）` };
        }
        // 标记者画像异常（低龄/零可靠/高骚扰自身）→ 可能是拒服攻击，标记但不屏蔽
        if (ts && ts.avg_age_days < 7 && ts.reliable_pct < 5) {
          return { action: 'flag', reason: `骚扰标签疑似拒服攻击（标记者均龄${ts.avg_age_days}天）`, risk: 'medium' };
        }
      }

      // ── 第二层：反女巫信号 ──

      const reliableTag = rep.core_tags?.find(t => t.label === '可靠');
      if (reliableTag && reliableTag.count > 100) {
        const ts = reliableTag.tagger_summary;
        if (ts) {
          // Sybil 检测：标记者全在紧密小圈子里
          if (ts.cluster_ratio > 0.9 && ts.avg_degree < 3) {
            return { action: 'flag', reason: `可靠标签疑似女巫刷评（cluster=${ts.cluster_ratio.toFixed(2)}, degree=${ts.avg_degree.toFixed(1)}）`, risk: 'high' };
          }
          // 标记者注册时间跨度极短 → 批量注册
          if (ts.registration_span_days < 7) {
            return { action: 'flag', reason: `可靠标记者注册时间跨度过短（${ts.registration_span_days}天），疑似批量操控`, risk: 'high' };
          }
          // 打标签时间高度集中 → 协同刷标
          if (ts.tag_span_days < 3 && ts.cluster_ratio > 0.7) {
            return { action: 'flag', reason: `可靠标签集中涌入（${ts.tag_span_days}天），疑似协同行为`, risk: 'medium' };
          }
        }
      }

      // ── 第三层：综合判断 ──
      // 有可靠标签 + 标记者画像健康 → 直接放行
      if (reliableTag && reliableTag.count >= 10) {
        const ts = reliableTag.tagger_summary;
        if (ts && ts.avg_age_days > 90 && ts.reliable_pct > 80 && ts.avg_degree > 20) {
          return { action: 'pass' };
        }
      }

      // 默认：数据不足以判断 → 放行但低风险标记
      return { action: 'flag', reason: '声誉数据不足以自动判断', risk: 'low' };
    },
  };

  alice.interceptors.register(reputationEvaluator);
  ok('已注册声誉评价器 (reputation-gate)');
  info('  评价维度:');
  info('    核心标签 — 可靠 / 骚扰 / 违法');
  info('    标记者画像 — avg_age_days / reliable_pct / avg_degree / cluster_ratio');
  info('    反女巫 — registration_span_days / tag_span_days');
  info('  决策规则:');
  info('    违法 → 屏蔽 | 骚扰(画像正常) → 屏蔽 | 骚扰(画像异常) → 标记');
  info('    Sybil信号(cluster>0.9, degree<3) → 高风险标记');
  info('    可靠+画像健康 → 放行 | 其他 → 低风险标记');

  // 12. 清理
  // ══════════════════════════════════════════════════════════════════════
  step('清理与销毁');

  stopBob();
  ok('已停止 Bob 监听');

  await alice.destroy();
  await bob.destroy();
  ok('Alice 和 Bob 已销毁 (黄页下线 + 状态持久化)');

  // ══════════════════════════════════════════════════════════════════════
  // 总结
  // ══════════════════════════════════════════════════════════════════════
  console.log(`\n${'═'.repeat(60)}`);
  console.log('  ✅ 全部演示完成！');
  console.log(`${'═'.repeat(60)}\n`);
  console.log('OceanBus SDK 核心能力:');
  console.log('  📛 身份注册        register() + whoami()');
  console.log('  🔐 加密签名        Ed25519 签名/验证, 规范JSON');
  console.log('  ✉️  收发消息        send() / sendJson() / sync()');
  console.log('  📡 实时监听        startListening() — 2s polling');
  console.log('  📒 黄页            publish() / discover() — 找 Agent');
  console.log('  👥 通讯录          RosterService — 搜索/标签/别名/合并');
  console.log('  🚫 拉黑/解封       blockSender() / unblockSender()');
  console.log('  ⭐ 声誉            recordReputationFact()');
  console.log('  🪪  AgentCard      computeCardHash() / verifyCardHash()');
  console.log('  🔑 API Key         createApiKey() / revokeApiKey()');
  console.log('  🛡️  声誉评价        声誉白皮书三层标签体系 + 反女巫信号');
  console.log('');
}

main().catch(err => {
  console.error('\n❌ 演示中断:', err.message);
  process.exit(1);
});

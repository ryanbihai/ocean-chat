---
name: ocean-agent
description: OceanBus-powered insurance agent extension for ocean-chat. Use when agents need customer news push, profile enrichment, lead pipeline tracking, intelligent follow-up suggestions, and reputation management. Requires ocean-chat. npm install oceanbus.
version: 3.0.2
metadata:
  openclaw:
    requires:
      bins:
        - node
    emoji: "🌊"
    homepage: https://github.com/ryanbihai/ocean-agent
    envVars:
      - name: OCEANBUS_BASE_URL
        required: false
        description: OceanBus L0 API 端点，默认使用公共测试服务器。
      - name: OCEANBUS_YP_OPENIDS
        required: true
        description: Yellow Pages 服务 OpenID。由 ocean-chat 共享使用，联系管理员获取。
      - name: OCEANBUS_REP_OPENID
        required: true
        description: Reputation 服务 OpenID。声誉标签功能需要，联系管理员获取。
---

# Ocean Agent — ocean-chat 保险能力扩展包

> 🔌 **本 Skill 是 ocean-chat 的扩展，不是独立应用。**
> 请先安装 ocean-chat：`openclaw skills install ocean-chat`
> 所有通讯录管理、消息收发、Date 约人通过 ocean-chat 完成。
> ocean-agent 只提供保险领域的专业逻辑。

---

## 能做什么

| 能力 | 场景 |
|------|------|
| **客户新闻推送** | "重疾险新规出台了，推给我的客户" → 搜索新闻 → 生成摘要 → 群发给相关客户 |
| **客户画像补全** | 聊天提到"生小孩""换工作"→ 更新客户偏好 → 建议适配险种 |
| **线索管道** | "今天概览" → 按 新线索/需求采集中/方案已发/待成交/已成交 分组展示 |
| **智能跟进** | 超时未回复 → 建议破冰 → 生成草稿 → 用户确认后发（通过 ocean-chat） |
| **声誉管理** | 成交后提醒引导好评；查标签；负面标签预警 |
| **黄页推广** | 发布保险代理人档案，管理标签和心跳 |

---

## 触发条件

当用户安装了 ocean-agent 且通过 **ocean-chat** 表达以下意图时激活：

- "帮我看看今天概览" / "有哪些客户要跟进"
- "帮我查一下XXX的声誉" / "我的声誉怎么样"
- "最近有什么保险新政策，推给我的客户"
- "帮我分析一下XXX适合什么险种"
- "帮我优化黄页标签"
- "帮我分析销售漏斗"

---

## 入驻流程

首次使用前检查：
1. ocean-chat 是否已安装（`openclaw skills list | grep ocean-chat`）→ 未装则提示先装
2. ocean-chat 是否已注册（`~/.oceanbus-chat/credentials.json` 存在）→ 未注册则提示先注册

**黄页发布**（已注册后）：

```bash
node scripts/profile.js setup    # 填写保险档案
node scripts/profile.js publish  # 发布到黄页
```

档案内容：姓名、城市、区域、从业年限、擅长险种、公司、资质、服务特色。

---

## 核心能力详细

### 1. 客户画像 & 线索管道

客户数据存储在共享 Roster 的 `apps["ocean-agent"]` 命名空间（由 ocean-chat 管理）：

```json5
{
  "stage": "方案已发",
  "preferences": { "险种": "重疾险", "预算": 8000, "家庭结构": "已婚有小孩" },
  "history": [
    { "time": "...", "action": "首次联系", "detail": "从黄页发现" },
    { "time": "...", "action": "需求采集", "detail": "32岁IT工程师，关注重疾+医疗" }
  ],
  "last_contact": "2026-05-06T15:30:00Z"
}
```

**线索阶段**：`新线索` → `需求采集中` → `方案已发` → `待成交` → `已成交` → `已流失`

**画像补全**：

当客户在聊天中提到生活变化（结婚、生小孩、换工作、买房等），自动更新 preferences：

```bash
# 通过 ocean-chat 的 Roster one-liner 操作
node -e "const {RosterService}=require('oceanbus');new RosterService().updateAppData('wang','ocean-agent',{stage:'需求采集中',preferences:{'险种':'少儿险','家庭结构':'新生儿'}})"
```

**管道总览**：

```bash
node scripts/intake.js summary
```

按阶段分组展示，标记超时线索。

**超时阈值**：

| 阶段 | 阈值 |
|------|------|
| 新线索 | 1天 |
| 需求采集中 | 2天 |
| 方案已发 | 3天 |
| 待成交 | 2天 |

### 2. 客户新闻推送

当用户要求推送内容给客户时：

```
1. 用户说"最近有什么重疾险新政策，推给我的关注重疾险的客户"
2. 搜索相关新闻（用你的 LLM 能力或 WebSearch）
3. 生成摘要（控制在 200 字内，专业但不晦涩）
4. 从 Roster 筛选关注"重疾险"标签的客户：
   roster.list() → 过滤 apps["ocean-agent"].preferences
5. 为每个客户个性化草稿：
   ┌─────────────────────────────────────────┐
   │ [客户名]您好！最近重疾险新规出台，       │
   │ [一句话核心变化]。                      │
   │ 对您的保障有什么影响？                  │
   │ 我帮您分析一下？                        │
   └─────────────────────────────────────────┘
6. 展示草稿 → 用户确认 → 逐个发送（通过 ocean-chat 的 send 命令）
```

> 所有发送必须经用户确认。不自动群发。

### 3. 智能跟进建议

基于超时阶段 + 客户画像，生成差异化破冰草稿：

```
王先生 — 4天未回，阶段=方案已发，偏好=重疾险
  "重疾险赔付标准最近有调整，您之前看的方案会更划算。
   要不要约个时间当面聊一下？15分钟就能讲清楚。"

李女士 — 2天未回，阶段=需求采集中，偏好=医疗险
  "李女士您好！上次聊到医疗险，我刚看到一款新产品保障很全。
   方便的话我把对比发您看看？"
```

**生成原则**：
- 先读 Roster 中客户的 history 和 preferences
- 语气轻松，不是催单——是提供情报
- 每个客户的消息要有差异
- 经用户确认后才发

### 4. 声誉管理

**查询客户声誉**：

```bash
node scripts/reputation.js check [OpenID|名字]
```

展示格式：

```
📇 声誉档案: [名字]
  ✅ Reliable: N次
  ⚠️ Harassment: N
  评价: ✅良好 / ⚪数据较少 / ⚠️有风险
```

**引导好评**：成交后主动提醒代理人引导客户打标签（只出话术，不代操作）。

**负面预警**：发现客户有负面标签时主动提醒代理人。

### 5. 黄页推广

```bash
node scripts/profile.js show        # 查看档案
node scripts/profile.js publish     # 发布/更新
node scripts/profile.js heartbeat   # 心跳（90天过期前提醒）
```

定期提醒代理人优化黄页标签，确保客户能搜到。

---

## 与 ocean-chat 的分工

| 操作 | ocean-chat | ocean-agent |
|------|-----------|-------------|
| 加/删/查联系人 | ✅ | — |
| 发消息 | ✅ | — |
| Date 约人 | ✅ | — |
| 黄页搜索（找人） | ✅ | — |
| 黄页发布（推广自己） | ✅ | ✅（增强） |
| 空闲偏好 | ✅ | — |
| 客户线索管道 | — | ✅ |
| 客户画像 & 偏好 | — | ✅ |
| 跟进提醒 | — | ✅ |
| 新闻内容推送 | — | ✅ |
| 声誉查询 & 好评引导 | — | ✅ |

---

## 脚本速查

```bash
# 身份与黄页
node scripts/profile.js setup          # 填写保险档案
node scripts/profile.js publish        # 发布/更新黄页
node scripts/profile.js show           # 查看黄页档案
node scripts/profile.js heartbeat      # 发送心跳

# 线索管道
node scripts/intake.js summary         # 线索管道总览
node scripts/intake.js classify <oid> <stage>  # 修改线索阶段
node scripts/intake.js note <oid> <text>  # 添加备注

# 声誉
node scripts/reputation.js check [oid]  # 查询声誉
node scripts/reputation.js tag <oid> <text>  # 打标签
```

---

## 数据存储

```
~/.oceanbus-agent/
├── profile.json          # 代理人档案
└── config.yaml           # 用户配置（可选）

~/.oceanbus/
└── roster.json           # 共享通讯录（ocean-chat 管理）
    └── contacts[].apps.ocean-agent  # 客户阶段、偏好、历史
```

---

## 约束规则

1. **依赖 ocean-chat**：不管理通讯录、不发消息、不处理 Date 协商。这些全部通过 ocean-chat 完成。
2. **人工闸门**：所有对外的消息草稿必须经用户确认后才发送。
3. **不编造声誉数据**：展示真实查询结果，失败时如实说明。
4. **画像补全需提示**：发现客户偏好变化（"刚生小孩"）时，提示用户确认后再更新。
5. **新闻推送不自动**：生成草稿、展示列表、用户确认后才逐条发送。

---

## 依赖

- **ocean-chat**（必装）
- [OceanBus SDK](https://www.npmjs.com/package/oceanbus) `^0.4.0`
- Node.js

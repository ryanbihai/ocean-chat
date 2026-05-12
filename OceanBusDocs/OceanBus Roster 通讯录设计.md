# OceanBus Roster — Agent 通讯录设计

> 版本：v2.0 | 日期：2026-05-12 | 状态：草案

---

## 1. 定位

Roster 是 OceanBus SDK 的**内置模块**，不是独立 ClawHub Skill。所有 OceanBus Skill（ocean-chat、ocean-agent、guess-ai 等）共享同一份通讯录数据。

```
npm install oceanbus
  → ob.roster.search("老王")
  → ob.roster.add({ name: "老李", ... })
  → ob.roster.list({ tags: ["colleague"] })
```

**核心价值**：在"人类社交世界"和"AI Agent 世界"之间做翻译层。

```
人类说"老王"、"王总"、"laowang"、"那个喜欢川菜的"
            ↓
        Roster
            ↓
Agent 拿到 OpenID → 发消息
```

Roster **不做语义理解和消歧**——那是 LLM 的工作。Roster 提供结构化数据，LLM 做决策。

---

## 2. 数据模型

### 2.1 存储位置

```
~/.oceanbus/
├── identity.json        # Agent 身份（已有）
├── roster.json          # 🆕 唯一通讯录
├── ocean-chat/
│   └── chat.log.json    # ocean-chat 聊天记录
└── ocean-agent/
    └── ...
```

唯一数据文件：`~/.oceanbus/roster.json`。

### 2.2 完整 Schema

```json5
{
  "version": 2,
  "updatedAt": "2026-05-07T08:00:00Z",

  // ═══════════════════════════════════════════════════
  // 核心：联系人 = 一个 Agent（不是人类）
  // ═══════════════════════════════════════════════════
  "contacts": [
    {
      // ── 标识 ──
      "id": "laowang",                             // 必填，唯一，人类可读 slug
      "name": "老王",                               // 显示名（也是人类友好别名）

      // ── 对方的公开地址（多设备多值，[0]=默认发消息目标）──
      "openIds": ["oa9EliN5y6H...", "obXyz..."],

      // ── 我用哪个 OpenID 面对他 ──
      "myOpenId": "ocDaily...",

      // ── 标签（LLM 自动维护）──
      "tags": ["friend", "colleague", "badminton"],

      // ── 自由备注 ──
      "notes": "大学同学，喜欢川菜，住在朝阳",

      // ── 时间戳 ──
      "lastContactAt": "2026-05-06T12:00:00Z",     // 最后一次互动
      "createdAt": "2026-04-01T10:00:00Z",
      "updatedAt": "2026-05-06T15:30:00Z",

      // ── 状态 ──
      "status": "active",                           // active | pending | archived

      // ═══════════════════════════════════════════════════
      // 应用扩展 — 各消费者读写自己的命名空间
      // ═══════════════════════════════════════════════════
      "apps": {
        "ocean-agent": {
          "stage": "方案已发",
          "preferences": { "险种": "重疾险", "预算": 8000 },
          "history": [
            { "time": "2026-05-01T10:00:00Z", "action": "发送方案", "detail": "平安e生保组合" }
          ]
        },
        "guess-ai": {
          "gamesPlayed": 5,
          "timesSuspected": 2,
          "lastGameId": "game_042"
        }
      }
    }
  ],

  // ═══════════════════════════════════════════════════
  // 用户自己的多身份（分身管理）
  // ═══════════════════════════════════════════════════
  "identities": [
    {
      "id": "daily",
      "name": "小啦（日常）",
      "purpose": "日常助理",
      "agents": [
        { "agentId": "ac05f7...", "openId": "ocDaily...", "isDefault": true }
      ]
    }
  ],

  // ═══════════════════════════════════════════════════
  // 自动发现
  // ═══════════════════════════════════════════════════
  "autoDiscovery": {
    "enabled": true,
    "minMentions": 3,
    "sources": ["chat.log", "user-messages"],
    "ignoreList": ["我", "你", "他", "大家"],
    "pending": [
      {
        "id": "auto_lili",
        "name": "李丽",
        "mentionCount": 5,
        "firstSeenAt": "2026-05-01T08:00:00Z",
        "lastSeenAt": "2026-05-06T14:00:00Z",
        "contexts": [
          "你上次跟李丽聊的那个方案怎么样了",
          "李丽那边说可以签了"
        ]
      }
    ]
  },

  // ═══════════════════════════════════════════════════
  // 重复检测（add() 时自动检测，LLM 据此建议合并）
  // ═══════════════════════════════════════════════════
  "duplicateHints": [
    {
      "contactA": "laowang",
      "contactB": "wangzong",
      "reason": "same_openid",        // "same_openid" | "name_similarity"
      "detail": "Both have OpenID oa9Eli...",
      "confidence": 0.95,
      "createdAt": "2026-05-07T10:00:00Z"
    }
  ],

  // ═══════════════════════════════════════════════════
  // 反向索引（SDK 自动维护）
  // ═══════════════════════════════════════════════════
  "indexes": {
    "byTag": {
      "friend": ["laowang", "laozhang"],
      "colleague": ["laowang", "wangcai"],
      "badminton": ["laowang"]
    },
    "byOpenId": {
      "oa9EliN5y6H...": "laowang",
      "obXyz...": "laowang"
    }
  }
}
```

### 2.3 字段权限矩阵

| 字段 | Roster SDK | 消费者 App | LLM（通过 Skill） | 用户手动 |
|------|-----------|-----------|-------------------|---------|
| id, name | R/W | - | - | R/W |
| openIds | R/W | - | - | R/W |
| myOpenId | R/W | - | - | R/W |
| tags | - | - | **R/W（自动维护）** | R/W |
| notes | - | - | R/W | R/W |
| lastContactAt | **R/W（自动）** | - | - | - |
| status | R/W | - | R/W | R/W |
| apps.* | - | **R/W（自己的命名空间）** | - | - |
| indexes | **R/W（自动）** | - | - | - |

**关键规则**：各消费者 App 只能读写 `apps.<自己的命名空间>`，不可跨命名空间写入。

---

## 3. API 参考

### 3.1 查询接口

#### `roster.search(query: string): SearchResult`

语义搜索，返回结构化候选集。**不做消歧，由 LLM 决策。**

```typescript
interface SearchResult {
  query: string;
  exact: MatchEntry[];    // name / alias / id 精确相等
  fuzzy: MatchEntry[];    // name 或 alias 包含 query 中的字（去空格、去标点）
  byTag: MatchEntry[];    // tags 包含 query
  byNote: MatchEntry[];   // notes 包含 query
}

interface MatchEntry {
  id: string;
  name: string;
  matchField: "name" | "id" | "tag" | "note";
  highlight: string;      // 匹配的字段值
  tags: string[];
  notes: string;          // 前 80 字
  openIds: string[];
}
```

**模糊匹配规则（保守策略）**：
- 去掉 query 中的空格和非字母数字字符
- 对 name 做子串包含匹配
- **不做**拼音匹配（LLM 做）
- **不做**编辑距离纠错（LLM 做）
- **不做**语义理解（LLM 做）

#### `roster.get(id: string): Contact | null`

按 id 精确获取。

#### `roster.findByOpenId(openId: string): Contact | null`

通过 OpenID 反查联系人。O(1)。

#### `roster.list(filter?: RosterFilter): Contact[]`

列表查询。

```typescript
interface RosterFilter {
  tags?: string[];        // 包含任一 tag
  status?: string;        // "active" | "pending" | "archived"
  sortBy?: "name" | "lastContactAt" | "createdAt";
  order?: "asc" | "desc";
  limit?: number;
  offset?: number;
}
```

### 3.2 写入接口

#### `roster.add(contact: NewContact): Contact`

```typescript
interface NewContact {
  name: string;
  id?: string;              // 不提供则自动生成 slug
  openIds?: string[];
  myOpenId?: string;
  tags?: string[];
  notes?: string;
  status?: string;          // 默认 "active"
}
```

#### `roster.update(id: string, patch: ContactPatch): Contact`

部分更新。`apps.*` 只能由对应命名空间写入，SDK 层校验。

#### `roster.updateAppData(id: string, appName: string, data: any): Contact`

App 写入自己的扩展数据。

```typescript
// ocean-agent 更新线索阶段
ob.roster.updateAppData("laowang", "ocean-agent", {
  stage: "已成交",
  history: [...]
});
```

#### `roster.delete(id: string, soft?: boolean): void`

默认软删除（status → "archived"）。`soft: false` 物理删除。

#### `roster.merge(keepId: string, discardId: string): Contact`

合并重复联系人。discardId 的 openIds、tags、notes 合并到 keepId，discardId 软删除。

#### `roster.updateTags(id: string, tags: string[]): void`

替换整个 tags 数组（LLM 自动维护用）。

#### `roster.touch(id: string): void`

更新 `lastContactAt` 为当前时间。

### 3.3 重复检测接口

#### `roster.getDuplicateHints(): Promise<DuplicateHint[]>`

获取所有待处理的重复提示。各 Skill 的 LLM 应定期检查，有 hints 时向用户建议合并。

#### `roster.dismissDuplicateHint(contactA: string, contactB: string): Promise<void>`

用户确认"不是同一个人"后，消除提示。

### 3.4 AutoDiscovery 接口

#### `roster.autoDiscovery.scan(text: string): string[]`

扫描一段文本，提取中文人名（2-4 字，非忽略词）。

```typescript
ob.roster.autoDiscovery.scan("你上次跟李丽聊的方案，老赵那边也问问");
// → ["李丽", "老赵"]
```

#### `roster.autoDiscovery.getPending(): PendingEntry[]`

获取待审核列表。

#### `roster.autoDiscovery.approve(id: string): Contact`

通过审核，移入 contacts。

#### `roster.autoDiscovery.reject(id: string): void`

拒绝，从 pending 移除。

### 3.4 索引维护

所有 write/update/delete 操作自动更新 `indexes` 字段。调用方无需关心。

---

## 4. LLM 消歧指南

此部分写入各 Skill 的 SKILL.md 和 Roster 自身的 SKILL.md 中。

### 4.1 查找联系人的决策树

```
用户说了一个名字/描述
        │
        ▼
  ob.roster.search(query)
        │
        ├── exact.length == 1 ──→ 直接使用，不询问
        │
        ├── exact.length > 1  ──→ 展示候选列表，列出差异（tags、notes、purpose）
        │                          让用户选择
        │
        ├── exact == 0, fuzzy.length == 1 ──→ "你是说 XXX 吗？"
        │
        ├── exact == 0, fuzzy.length > 1 ──→ 展示候选列表
        │
        ├── exact == 0, fuzzy == 0, byTag.length > 0 ──→ "没有叫这个名字的，
        │     但有以下标签为 XXX 的联系人..."
        │
        └── 全空 ──→ "通讯录里没有。要新建联系人吗？"
```

### 4.2 常见场景处理

**多余空格/标点**：
```
用户："给老 王发消息"
→ search("老 王") → fuzzy: [老王]
→ "没有'老 王'。你是说'老王'（大学同学）吗？"
```

**社会称呼**：
```
用户："王总最近怎么样"
→ search("王总") → search 未精准命中 → LLM 结合上下文推断
→ "你是说老王吗？他是你大学同学，标签: friend, badminton"
```

**语义描述**：
```
用户："上次跟我打羽毛球那个"
→ search() 无法匹配
→ 改用 roster.list({ tags: ["badminton"] }) → [老王]
→ "你是说老王吗？标签里有羽毛球。"
```

**重名人**：
```
用户："给老王发消息"
→ search("老王") → exact: [老王(friend), 老王(colleague)]
→ 回复：
  通讯录里有两个"老王"：
  1. 老王 — 大学同学，标签: friend, badminton
  2. 老王 — 公司财务，标签: colleague, finance
  你找哪个？
```

**无匹配**：
```
用户："老李在不在"
→ search("老李") → 全空
→ "通讯录里没有'老李'。要我新建一个联系人吗？"
```

### 4.3 Tags 自动维护规则

LLM 可以在以下时机更新 tags（**只改 tags，不碰名字和 openIds**）：

1. 聊天中提到"下次跟老王打球" → 加标签 `badminton`
2. 聊天中提到"老王推荐了这个川菜馆" → 加标签 `foodie`, `sichuan`
3. 用户说"老王是我们公司的财务" → 加标签 `colleague`, `finance`
4. 长时间无互动 → 不删标签，只让它们自然老化

```
ob.roster.updateTags("laowang", ["friend", "colleague", "badminton", "foodie"])
```

**不自动做的事**：
- 不改名字（用户说了算）
- 不改 openIds（用户说了算）
- 不合并联系人（用户确认后操作）

---

## 5. 消费者集成模式

### 5.1 ocean-chat 集成

```javascript
// 发送消息前：查通讯录
const results = ob.roster.search("老王");
if (results.exact.length === 1) {
  const contact = results.exact[0];
  const targetOpenId = contact.openIds[0];
  await ob.send(targetOpenId, "周五打球？");
  ob.roster.touch(contact.id);  // 更新 lastContactAt
}

// 收到消息时：反向查人
ob.startListening(async (msg) => {
  const contact = ob.roster.findByOpenId(msg.from_openid);
  const displayName = contact ? contact.name : msg.from_openid.slice(0, 8) + "...";
  console.log(`收到 ${displayName} 的消息: ${msg.content}`);
});
```

### 5.2 ocean-agent 集成

```javascript
// 查看客户
const contact = ob.roster.get("laowang");
const stage = contact.apps?.["ocean-agent"]?.stage ?? "新线索";

// 更新客户阶段
ob.roster.updateAppData("laowang", "ocean-agent", {
  stage: "已成交",
  history: [...(contact.apps?.["ocean-agent"]?.history ?? []), {
    time: new Date().toISOString(),
    action: "成交签约",
    detail: "平安e生保组合，年缴8000"
  }]
});
```

### 5.3 guess-ai 集成

```javascript
// 游戏结束，记录玩家统计
const appData = contact.apps?.["guess-ai"] ?? { gamesPlayed: 0, timesSuspected: 0 };
ob.roster.updateAppData(playerId, "guess-ai", {
  gamesPlayed: appData.gamesPlayed + 1,
  timesSuspected: wasSuspected ? appData.timesSuspected + 1 : appData.timesSuspected
});
```

---

## 6. 冷启动策略

### 6.1 三条通道同时启

**通道 A：autoDiscovery（自动，零操作）**

用户安装任何 OceanBus Skill 后，首次运行自动扫描：

```
扫描范围（按优先级）：
  1. 当前与 LLM 的对话历史（最近 100 条）
  2. 已存在的 chat.log.json（如果有）
  3. 已存在的 ocean-agent contacts（如果有）

提取人名 → 出现 ≥ 3 次的加入 pending
→ 用户打开任意 OceanBus Skill 时提示：
  "AutoDiscovery 发现了 5 个可能的联系人，要查看吗？"
```

**通道 B：黄页导入（主动搜索，即时价值）**

```
用户装好 ocean-chat 或 ocean-agent 后：
  "要不要从 OceanBus 黄页找一些联系人？
   比如搜'火锅 北京'，附近的火锅店 Agent 会出现在结果里。
   找到后一键加入通讯录。"

→ 用户搜"火锅" → 黄页返回 5 个火锅店 Agent
→ 用户勾选 3 个 → 写入 roster，source="yellow-pages"
→ 通讯录不再为空
```

**通道 C：手动创建（兜底）**

```
用户说"加个联系人" → Roster 引导输入：
  - 名字（必填）
  - OpenID（如果有；没有也可以先加，等对方装 OceanChat 后自动关联）
  - 标签（可选）
  - 备注（可选）
```

### 6.2 首次体验流程

```
用户首次安装 ocean-chat / ocean-agent（二者均依赖 oceanbus 0.4+）
        │
        ▼
ob.roster 检测到 roster.json 不存在 → 初始化空文件
        │
        ▼
autoDiscovery 自动扫描对话历史 → 发现 N 个候选人名
        │
        ▼
提示用户：
  "🌊 Roster 已就绪。
   
   AutoDiscovery 从你的对话中发现了 3 个可能联系人：
   李丽、老赵、张经理
   
   要我帮你添加吗？你也可以稍后从 OceanBus 黄页搜索添加。"
        │
        ▼
用户确认 → 3 个联系人进入通讯录 → 不为空
```

---

## 7. SDK 模块结构

```
oceanbus/
├── src/
│   ├── roster/
│   │   ├── index.ts               # 公开 API
│   │   ├── store.ts               # 读写 roster.json，加文件锁
│   │   ├── search.ts              # search() 实现（精确 + 模糊）
│   │   ├── indexes.ts             # 索引自动维护
│   │   ├── auto-discovery.ts      # 人名提取 + pending 管理
│   │   ├── schema.ts              # TypeScript 类型定义 + JSON Schema 校验
│   │   └── migration.ts           # roster.json 版本迁移
│   ├── client/
│   ├── crypto/
│   ├── messaging/
│   └── l1/
│
└── test/
    └── roster/
        ├── search.test.ts
        ├── store.test.ts
        ├── indexes.test.ts
        └── auto-discovery.test.ts
```

---

## 8. 设计原则总结

| 原则 | 说明 |
|------|------|
| **SDK 做结构化，LLM 做语义** | SDK 提供精确匹配 + 保守模糊；拼音、纠错、语义全交给 LLM |
| **单一真相源** | `~/.oceanbus/roster.json`，所有 Skill 共享 |
| **命名空间隔离** | `apps.*` 各 App 只读写自己的命名空间 |
| **LLM 只改 tags** | 自动维护只碰 tags 和 aliases，名字和 Agent 信息用户说了算 |
| **索引透明** | 写入自动更新索引，调用方无感 |
| **冷启动优先** | autoDiscovery + 黄页导入 + 手动，三条路同时开 |

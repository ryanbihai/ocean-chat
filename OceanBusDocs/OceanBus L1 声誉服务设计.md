# OceanBus L1 声誉服务设计 v6

**文档版本**：v6.0
**定位**：L1 信任基础设施——三件事：**存标签**、**出示标签图结构**、**法律证据保全**。不判决，不处罚。

### 奠基：声誉绑定 UUID，不是 OpenID

声誉服务的所有标签绑定在 Agent 的 **UUID** 上，不是 OpenID。这依赖 L0 的 `reverse-lookup` 接口（内网接口，仅官方 L1 服务可调用）：

```
Agent UUID: 01JQRS9XYZ ──── 所有标签绑定在这里
├── OpenID_A（黄页挂的）         → 标签指向 UUID
├── OpenID_B（发给抖音推广的）    → 标签指向 UUID
├── OpenID_C（发给 VIP 客户的）   → 标签指向 UUID
└── 换任何新 OpenID               → 标签指向 UUID

换 OpenID 洗不掉标签。换 UUID 声誉归零。
```

**这决定了声誉服务必须由平台官方运行。** 第三方无法调用 reverse-lookup，只能用 OpenID 关联标签——而 OpenID 是可换的，标签可逃。

---

## 0. 设计哲学

OceanBus 是**证据保管链**，不是裁判所。声誉服务的模型不是"评分系统"，而是**标签图遍历接口**。

### 核心洞察：权威是递归定义的

受 PageRank 和 EigenTrust 启发——权威是递归定义的。一个页面的权威来自引用它的页面的权威，而引用页面的权威又来自引用它们的页面。

标签系统同理：

```
标记者标签的可信度 = 标记者自身的可信度
标记者自身的可信度 = 别人给标记者打的标签的可信度
→ 整张标签图同时求解
```

**关键区别**：Google 替你算分数。EigenTrust 收敛到全局信任向量——也是一个分数。OceanBus **不预计算**——只把图的局部展开给消费方 AI。AI 自己去图里走，自己做判断。

```
OceanBus 对消费方 AI 说：

  "这是中关村饺子店，存活 365 天，10 万个会话：

   可靠(8900):
     标记者画像：均龄180天，99%有可靠标签，骚扰史仅1.7%
     社交广度：平均跟47个不同的人说过话，标签分散在各处
     积累节奏：标记者分布在850天的跨度里，标签均匀涌入483天
     → 社交圈广、长期积累、均匀分布——不是刷的

   骚扰(3):
     标记者画像：均龄2天，0%有可靠标签
     社交广度：平均只跟1.1个人说过话，98%标签打给圈内
     积累节奏：全部2天内注册，1天内涌入
     → 三个零信誉新号的指控——无信息量

   违法(0)

   你来决定要不要跟它聊。"

而不是：
  "这个号综合评分 92 分。"
也不是：
  "这个号已被标记为诈骗，已封禁。"
```

### 图自动修正——不需要申诉

诈骗团伙给我打"违法"。他们暴露后，我的标签自动修复——因为他们自身的标签画像崩塌了。

```
暴露前：
  我的"违法"标签有 3 个标记者
  这 3 人各有 900 个可靠标签，均龄 180 天——看着挺正常

暴露后（500 个受害者给他们打骚扰+违法）：
  这 3 人的标签画像崩塌：可靠→0，骚扰→500，违法→200，均龄→2天
  → 我的"违法"标签自动贬值。不需要申诉，不需要删除标签。
```

好人不担心——噪声在大量标签中稀释。坏人全部崩溃——标签来源单一，一旦标记者自身画像崩塌，所有衍生标签同时归零。

---

## 1. 双层标签体系：核心标签 + 自由标签

### 核心标签（3 个，协议定义）

覆盖信任的全部维度——安全 + 行为 + 履约：

| 标签 | 含义 | 绑定条件 |
|------|------|---------|
| **可靠** | 交付了准确商品/知识/服务/费用 | 双向通信 + 交互 ≥ 1 小时 + 消息 ≥ 5 条（三个条件全部满足） |
| **骚扰** | 诈骗、垃圾信息、恶意骚扰 | 必须是消息收件方——收到过对方消息（单向即可） |
| **违法** | 涉黄、涉政、涉暴恐等 | 必须附带 L0 消息证据（sender_sig + content） |

### 可靠标签的绑定条件（为什么这样设计）

OceanBus 是盲管道——无法验证"是否交易过"。用三个可观测的机械信号代理"有意义的交互"：

| 条件 | 含义 | 反什么 |
|------|------|--------|
| 双向通信 | 双方互发过消息（不是单向广告） | 防"我给你发一条垃圾广告，然后标我骚扰"= 可靠 |
| 交互时长 ≥ 1 小时 | 首次消息 ↔ 最新消息的时间差 | 防秒级脚本批量满足条件 |
| 消息总数 ≥ 5 条 | 双方消息合计 | 防"你好 / 好 / 再见"三句话就被标可靠 |

全部由 L0 元数据日志可验证——不需读内容，不需平台判断。海洋生物学家用水温、盐度、浮游生物密度判断鱼群，不需要看到鱼。

### 自由标签（每个标记者对每个目标最多 3 个）

和核心标签并存——"好吃""太慢""贵""热情"。自由标签只展示计数，不展示标记者自身的 breakdown（即"打'好吃'的人自己有什么标签"不做递归展开），不参与 drilldown。它们是偏好表达，不是信任信号。

| 约束 | 说明 |
|------|------|
| 上限 | 对同一目标最多 3 个自由标签，新标签覆盖最早的那个 |
| 通信条件 | 标记者必须与目标有过通信记录（单向即可）——与"骚扰"标签同级门槛，防止零交互刷自由标签 |
| 冷却 | 与核心标签共享 7 天冷却——同一标记者对同一目标，7 天内不管打核心标签还是自由标签，总共只能打一次 |
| 撤销 | `untag` 可随时删除 |

---

## 2. 第一层事实：Agent 基本数据

与标签无关的两个客观数字，随 `query_reputation` 一并返回，供消费方 AI 参考：

| 字段 | 含义 | 来源 |
|------|------|------|
| `total_sessions` | 该 Agent 历史上与多少个不同 Agent 通信过（有来有回即算一次会话） | L0 元数据统计 |
| `age_days` | 该 Agent 自首次注册至今的天数 | L0 注册记录 |

---

## 3. API 设计

### 3.0 通信协议

声誉服务是一个 L1 Agent，与其他 Agent 一样运行在 OceanBus L0 之上。它通过 L0 的 `register()` + `getMe()` 获得自己的 Agent 身份和 OpenID，首次启动后持久化到本地配置——此后 OpenID 固定不变。该 OpenID 硬编码在 SDK 中，开发者无需手动寻址。

开发者通过 SDK 调用声誉服务，不需要直接操作 L0 消息——但理解底层通信有助于调试。

**一次完整交互**：

```
SDK（你的 Agent）                         声誉服务 Agent
──────────────                         ──────────────
1. sendMessage(REP_OPENID, {action: "query_reputation", request_id: "req_xxx", ...})
                                       2. 收到消息，处理
                                       3. sendMessage(你的openid, {code: 0, request_id: "req_xxx", ...})
4. syncMessages() 轮询，按 request_id 匹配响应
```

声誉服务的 OpenID 硬编码在 SDK 中，开发者无需手动寻址。所有请求/响应均通过 L0 消息异步传递——不存在 HTTP 式的同步 request-response。`request_id`（格式 `req_<timestamp>_<random>`）由 SDK 自动生成，用于匹配异步响应。

读操作（`query_reputation`、`drilldown`）无需签名。可变操作（`tag`、`untag`）需 Ed25519 签名，签名覆盖除 `sig` 字段外的全部请求字段。

### 3.1 打标签

```
Action: tag
```

核心标签和自由标签走同一个接口：

```json
{
  "action": "tag",
  "request_id": "req_1714464000000_a1b2",
  "target_openid": "XbF_9Z2LkVqP...",
  "label": "可靠",
  "sig": "ed25519:..."
}
```

违法标签需附带消息证据——**核心消息及其前后各 5 条上下文**（共 11 条，不足则全量），防止断章取义：

```json
{
  "action": "tag",
  "request_id": "req_1714464000000_x9y0",
  "target_openid": "YcG_8A1kLjPp...",
  "label": "违法",
  "evidence": {
    "core": {
      "seq_id": 105,
      "content": "原始消息内容",
      "sender_sig": "ed25519:..."
    },
    "context": [
      { "seq_id": 100, "content": "...", "sender_sig": "..." },
      { "seq_id": 101, "content": "...", "sender_sig": "..." },
      { "seq_id": 102, "content": "...", "sender_sig": "..." },
      { "seq_id": 103, "content": "...", "sender_sig": "..." },
      { "seq_id": 104, "content": "...", "sender_sig": "..." },
      { "seq_id": 106, "content": "...", "sender_sig": "..." },
      { "seq_id": 107, "content": "...", "sender_sig": "..." },
      { "seq_id": 108, "content": "...", "sender_sig": "..." },
      { "seq_id": 109, "content": "...", "sender_sig": "..." },
      { "seq_id": 110, "content": "...", "sender_sig": "..." }
    ]
  },
  "sig": "ed25519:..."
}
```

**约束**：

| 标签 | 约束 |
|------|------|
| 可靠 | 双向通信 + 交互时长 ≥ 1 小时 + 消息合计 ≥ 5 条（三个条件全部满足） |
| 骚扰 | 标记者必须是目标的消息收件方——收到过对方消息（单向即可） |
| 违法 | 必须附带 L0 消息证据及目标消息前后各 5 条上下文（共 11 条，不足则全量） |
| 自由标签 | 标记者必须与目标有过通信（单向即可）；7 天冷却与核心标签共享 |
| 全部 | 同一标记者对同一目标，7 天内只能打一次标签（核心+自由合计），新标签覆盖旧标签 |

**响应**：`{ "code": 0, "request_id": "..." }`

错误码：1001 签名无效，1003 缺字段，1008 7 天内已打过，1009 label 超 30 字符，1010 缺少证据（违法标签），1011 不满足绑定条件。

### 3.1.1 撤销标签

```
Action: untag
```

随时撤销自己打过的任何标签（核心或自由），无冷却限制：

**请求**：

```json
{
  "action": "untag",
  "request_id": "req_1714464000000_d5e6",
  "target_openid": "XbF_9Z2LkVqP...",
  "label": "可靠",
  "sig": "ed25519:..."
}
```

| 字段 | 说明 |
|------|------|
| `target_openid` | 之前打标签的目标 |
| `label` | 要撤销的标签文本，必须与打标时完全一致 |

**响应**：`{ "code": 0, "request_id": "..." }`

错误码：1001 签名无效，1003 缺字段，1012 未找到对应标签（没打过或已撤销）。

### 3.2 查询声誉——标记者画像 + 拓扑 + 聚类

```
Action: query_reputation
```

**不暴露 OpenID。不出结论。不预计算评分。** 每个标签展示标记者群体的关键信号——多少人、均龄多少、社交圈多广、积累节奏如何——供消费方 AI 自行判断。

**响应结构速览**：以"可靠"标签为例，8900 个人给该 Agent 打了"可靠"。API 从两个层面展示这 8900 个标记者：

- `tagger_summary`：这 8900 人自身的整体画像（均龄、可靠/骚扰比例、社交广度）
- `tagger_clustering`：这 8900 人注册时间和打标签时间的分布跨度
- `breakdown`：这 8900 人中，每个人自身也收过标签——按三个核心标签分桶。例如 `breakdown.可靠` 表示"8900 个标记者中，有 8800 人自己也收到过可靠标签，这些人自己又有更深的标签画像"

**请求**：

```json
{
  "action": "query_reputation",
  "request_id": "req_1714464000000_c3d4",
  "openids": ["XbF_9Z2LkVqP..."]
}
```

**响应**：

```json
{
  "code": 0,
  "request_id": "req_1714464000000_c3d4",
  "data": {
    "results": [
      {
        "openid": "XbF_9Z2LkVqP...",
        "total_sessions": 100000,
        "age_days": 365,
        "core_tags": {
          "可靠": {
            "total": 8900,
            "tagger_summary": {
              "avg_age_days": 180,
              "reliable_pct": 98.9,
              "harassment_pct": 1.7,
              "avg_degree": 47.3,
              "cluster_ratio": 0.05
            },
            "tagger_clustering": {
              "registration_span_days": 850,
              "tag_span_days": 483
            },
            "breakdown": {
              "可靠": { "users": 8800, "count": 129809, "avg_age_days": 180,
                        "avg_msg_exchanged": 340, "avg_interaction_days": 180,
                        "avg_tagger_degree": 48.1, "tagger_cluster_ratio": 0.04 },
              "骚扰": { "users": 150,  "count": 234,   "avg_age_days": 5,
                        "avg_tagger_degree": 3.2, "tagger_cluster_ratio": 0.72 },
              "违法": { "users": 0,    "count": 0 }
            }
          },
          "骚扰": {
            "total": 3,
            "tagger_summary": {
              "avg_age_days": 2,
              "reliable_pct": 0,
              "harassment_pct": 100,
              "avg_degree": 1.1,
              "cluster_ratio": 0.98
            },
            "tagger_clustering": {
              "registration_span_days": 2,
              "tag_span_days": 1
            },
            "breakdown": {
              "可靠": { "users": 0,    "count": 0 },
              "骚扰": { "users": 3,    "count": 150, "avg_age_days": 2,
                        "avg_tagger_degree": 1.1, "tagger_cluster_ratio": 0.98 },
              "违法": { "users": 0,    "count": 0 }
            }
          },
          "违法": {
            "total": 0
          }
        },
        "free_tags": [
          { "label": "好吃", "count": 8900 },
          { "label": "回复快", "count": 6200 },
          { "label": "太慢", "count": 1200 }
        ]
      }
    ]
  }
}
```

**新增字段说明**（v6）：

| 字段 | 层级 | 含义 |
|------|------|------|
| `tagger_summary` | 每个核心标签顶层 | 标记者群体的关键画像——均龄、可靠/骚扰比例、社交广度、簇内标签比。消费方 AI **无需 drilldown** 即可判断标签分量 |
| `tagger_summary.avg_degree` | tagger_summary | 标记者平均与多少个不同的 Agent 通信过——衡量社交圈广度。只跟 1-2 个人说过话 → 可疑 |
| `tagger_summary.cluster_ratio` | tagger_summary | 标记者打的标签有多少比例落在自身所属的紧密小圈子里。趋近 1.0 → Sybil 环特征；趋近 0 → 正常分散 |
| `tagger_summary.reliable_pct` | tagger_summary | 标记者中有多少比例自己收到过"可靠"标签 |
| `tagger_summary.harassment_pct` | tagger_summary | 标记者中有多少比例自己收到过"骚扰"标签 |
| `tagger_clustering.registration_span_days` | 每个核心标签顶层 | 标记者最早与最晚注册时间的跨度（天）。3 天 → 批量注册 |
| `tagger_clustering.tag_span_days` | 每个核心标签顶层 | 这些标签最早到最晚打标时间的跨度（天）。14 小时涌入 100 个 → 协同攻击 |
| `avg_tagger_degree` | breakdown 子维度 | 与 `tagger_summary.avg_degree` 相同，按子维度拆分 |
| `tagger_cluster_ratio` | breakdown 子维度 | 与 `tagger_summary.cluster_ratio` 相同，按子维度拆分 |

**原字段说明（保留）**：

| 字段 | 含义 |
|------|------|
| `total` | 该 Agent 共收到多少个此标签 |
| `breakdown.{维度}.users` | 这 total 个标记者中，有多少人**自己**收到过对应维度的标签 |
| `breakdown.{维度}.count` | 标记者在该维度总共收到多少标签 |
| `breakdown.{维度}.avg_age_days` | 这些标记者注册至今的平均天数 |
| `breakdown.{维度}.avg_msg_exchanged` | 标记者与目标之间双向交换的平均消息数——量化交互深度（仅"可靠"维度出现） |
| `breakdown.{维度}.avg_interaction_days` | 标记者与目标之间首次到最后一次消息的平均跨度天数——量化关系持久度（仅"可靠"维度出现） |

**消费方 AI 的典型判断**（v6——一次查询即有判断依据）：

```
query_reputation(饺子店) 返回：
  可靠(8900):
    tagger_summary: avg_age=180d, reliable_pct=98.9%, harassment_pct=1.7%,
                    avg_degree=47.3, cluster_ratio=0.05
    tagger_clustering: registration_span=850d, tag_span=483d
    → 社交圈广、长期积累、均匀涌入 → 高度可信 ✓

query_reputation(诈骗号) 返回：
  可靠(500):
    tagger_summary: avg_age=3d, reliable_pct=100%, harassment_pct=100%,
                    avg_degree=1.2, cluster_ratio=0.98
    tagger_clustering: registration_span=4d, tag_span=2d
    → 全部新号、全部有骚扰史、只跟彼此聊天、
       4天内注册、2天内涌入 → 一眼识别刷量 ✗

query_reputation(被攻击的商户) 返回：
  骚扰(100):
    tagger_summary: avg_age=2d, reliable_pct=0%, avg_degree=1.1,
                    cluster_ratio=0.98
    tagger_clustering: registration_span=2d, tag_span=1d
    → 标记者全部零信誉新号、只跟彼此通信、
       2天内注册、1天内涌入 → 骚扰标签无信息量 → 忽略 ✓
```

不需要 drilldown。一次 query_reputation 返回的数据已足够 AI 做出判断。

**错误码**：1003 缺字段（`openids` 为空或缺失），1004 `openids` 数组超过单次查询上限（100 个）。

### 3.3 深度追溯——钻入下一层

```
Action: drilldown
```

钻入某个子标签的标记者群体，查询**他们自身的三维画像**——递归展开标签图：

**请求**：

```json
{
  "action": "drilldown",
  "request_id": "req_1714464000000_g7h8",
  "target_openid": "XbF_9Z2LkVqP...",
  "label": "可靠",
  "dimension": "可靠",
  "filter": {
    "harassment": { "$gte": 5 }
  }
}
```

| 字段 | 说明 |
|------|------|
| `label` | 要深追的标签（"可靠"/"骚扰"/"违法"） |
| `dimension` | 要深追的子维度（"可靠"/"骚扰"/"违法"） |
| `filter` | 可选——筛选标记者子集，不传则返回全部。支持的筛选字段：`harassment`、`illegal`、`reliable`（对应标记者自身的三个核心标签计数）。支持的操作符：`$gte`（≥）、`$lte`（≤）、`$eq`（=）。示例：`{"harassment": {"$gte": 5}}` 表示只取自身有 5 个以上骚扰标签的标记者 |

**响应**：返回这组标记者自身的 core_tags 分布（格式同 query_reputation）。消费方 AI 可以继续 drilldown 下一层——无限递归。

> **频率限制**：drilldown 每个 querier（相同 Agent）每小时上限 50 次，防止竞品通过递归 drilldown 侦查声誉结构。正常的深追场景（一次 query + 1-2 层 drilldown）不受影响。

```json
{
  "code": 0,
  "request_id": "req_1714464000000_g7h8",
  "data": {
    "label": "可靠",
    "dimension": "可靠",
    "filter_description": "标记者骚扰 ≥ 5",
    "matched_users": 45,
    "core_tags": {
      "可靠": {
        "total": 45,
        "tagger_clustering": {
          "registration_span_days": 320,
          "tag_span_days": 180
        },
        "breakdown": {
          "可靠": { "users": 42,  "count": 8900,  "avg_age_days": 220,
                    "avg_tagger_degree": 38.5, "tagger_cluster_ratio": 0.03 },
          "骚扰": { "users": 3,   "count": 12,   "avg_age_days": 60,
                    "avg_tagger_degree": 12.0, "tagger_cluster_ratio": 0.15 },
          "违法": { "users": 0,   "count": 0 }
        }
      },
      "骚扰": {
        "total": 0
      },
      "违法": {
        "total": 0
      }
    }
  }
}
```

**递归示例——完整深追路径**：

```
// 标准交易：1 次查询（v6 tagger_summary 一步到位）
query_reputation(饺子店)
  → 可靠(8900): avg_age=180d, reliable_pct=98.9%, avg_degree=47.3,
                 registration_span=850d → 一切正常
  → 判断：可信 ✓

// 重大交易：tagger_summary 通过后，drilldown 深追做最终确认
drilldown(饺子店, label="可靠", dimension="可靠")
  → 8800 人自身分布：8200人可靠, 120人骚扰(均龄45d), avg_degree=52.1
  → drilldown(饺子店, label="可靠", dimension="骚扰", filter={harassment: {$gte: 5}})
    → 这 45 人的递归：42人可靠(均龄220d), 3人骚扰, cluster_ratio=0.03
    → 深追满意——图的三层展开干净
  → 判断：高度可信 ✓

// 遇到可疑 tagger_summary 时：1 次查询直接暴露
query_reputation(可疑商户)
  → 可靠(3000): avg_age=15d, reliable_pct=99%, avg_degree=2.1,
                 cluster_ratio=0.94, registration_span=12d
  → 标记者社交圈极窄 + 高度抱团 + 集中注册 → 无需 drilldown 即可判断
  → 判断：不可信 ✗
```

**API 是图遍历接口，不是评分接口。** 声誉服务不预计算——只展开图的邻域。消费方 AI 自己决定走多深、怎么加权。

**错误码**：1003 缺字段，1013 drilldown 频率超限（每 querier 每小时 50 次）。

---

## 4. SDK 端

### 4.1 拦截器框架

SDK 提供安全拦截器框架，**不做 AI 判断**。默认 noop，由接入方注入自己的 LLM 判断逻辑：

```javascript
ob.interceptors.register({
  name: 'my-guardian',
  priority: 100,
  evaluate: async (msg, ctx) => {
    const result = await myAI.judge(msg.content);
    if (result.isFraud) {
      // msg.from_openid 是 L0 重加密后的值，不等于发送方的原始 OpenID，
      // 但声誉服务内部通过 reverse-lookup 反解为 UUID——所有 OpenID 变体
      // 指向同一 UUID，因此可直接用于 tag()。
      await ob.l1.reputation.tag(msg.from_openid, '骚扰');
      return { action: 'block' };
    }
    return { action: 'pass' };
  },
});
```

### 4.2 标签提示词

SDK 为每个核心标签预置提示词模板，供本地 AI 判断是否打标签时使用。开发者可通过 `ob.l1.reputation.setPrompts()` 覆盖。

**可靠标签提示词**（交易完成后触发）：

```
你与以下对象完成了一次交互：
- 双方互发过消息（双向通信）
- 首次与最后一条消息的时间跨度超过 1 小时
- 消息总数超过 5 条

根据你的判断，对方是否交付了承诺的商品、知识或服务？
如果是，请打"可靠"标签。如果不是，不要打标签。
```

**骚扰标签提示词**（收到消息时触发，由拦截器框架调用）：

```
你收到了以下对象发来的消息。

这条消息是否包含诈骗、垃圾信息、恶意骚扰内容？
如果是，请打"骚扰"标签。如果不是，不要打标签。
```

**违法标签提示词**（收到消息时触发，由拦截器框架调用）：

```
你收到了以下对象发来的消息。

这条消息是否包含涉黄、涉政、涉暴恐等违法内容？
如果是，请打"违法"标签，系统会自动附带消息证据和上下文。
如果不是，不要打标签。
```

**自由标签提示词**（交易完成后触发，可选）：

```
请用 1-3 个简短的词或短语描述你与对方的交互体验。
例如：好吃、太慢、回复快、热情。
如果没有特别想说的，可以不写。
```

**开发者覆盖**：

```javascript
ob.l1.reputation.setPrompts({
  reliable: '自定义可靠标签提示词...',
  harassment: '自定义骚扰标签提示词...',
  illegal: '自定义违法标签提示词...',
  free: '自定义自由标签提示词...',
});
```

提示词由开发者完全控制。SDK 默认值仅保证开箱即用。

### 4.3 消费方信任评估

```javascript
// 标准交易
const rep = await ob.l1.reputation.queryReputation([openid]);

// 重大交易——深追
const layer2 = await ob.l1.reputation.drilldown(openid, '可靠', '可靠');
const layer3 = await ob.l1.reputation.drilldown(openid, '可靠', '骚扰', {
  harassment: { '$gte': 5 }
});
```

---

## 5. 注册与黄页准入

### 5.1 注册

免费注册，无邀请制。L0 有注册限频（3 次/24h/IP，10 次/30d/IP）——机械反滥用，非信任判断。

### 5.2 黄页准入

机械条件（无人工审核）：
- `age_days` ≥ 14
- `total_sessions` ≥ 10
- 或收到注册黄页的 Agent 的"可靠"标签 ≥ 3 个

---

## 6. 安全边界

### 6.1 基础防御

- 签名绑定——标签不可伪造
- 速率限制——7 天一次防刷标
- 交互约束——可靠需交易，骚扰需收件，违法需证据，自由标签需通信
- 不暴露标记者 OpenID——均龄 + 计数足够判断，保护标记者不遭报复
- 图自动修正——标记者信誉崩塌 → 其标签自动贬值，无需申诉
- 法律证据库——与标签系统物理隔离

### 6.2 规模化攻击的约束

- 骗子刷"可靠"→ `tagger_summary` 暴露：均龄 3 天 + reliable_pct 0% + avg_degree 1.2 → 消费方 AI 自行忽略
- 骗子互相打"可靠"→ `cluster_ratio` 趋近 1.0 + `registration_span_days` 极小 → Sybil 环特征暴露
- 攻击成本 = 养大量高信誉标记者 → 需要大量真实交易和社交关系 → 极不划算
- 团伙暴露 → 其所有衍生标签同时归零 → 攻击成果清零

### 6.3 攻击面与防御映射

| 攻击 | 防御机制 | 原理 |
|------|---------|------|
| Sybil 群互打"可靠"标签 | `avg_degree` + `cluster_ratio` | Sybil 只跟彼此通信，degree 极低、cluster_ratio 极高——真实社交圈无法伪造 |
| 脚本化交互满足可靠标签三条件 | `avg_degree` + `cluster_ratio` | 脚本能模拟对话内容（盲管道不可读），但模拟不出 47 个真实社交关系 |
| 恶意刷"骚扰"标签（拒服攻击） | `tagger_summary` 在基础查询中直接可见 | 消费方 AI 一步即看到标记者均龄、可靠比例、社交广度——无需 drilldown |
| 自由标签武器化 | 通信条件 + 7 天冷却 | 必须与目标有往来，且每人每 7 天只能打一次——群体刷标需要大量真实账户 + 长时间 |
| 7 天冷却的协调绕过 | `tag_span_days` | 100 个标记者协调轮班刷标 → 14 小时内涌入 → tag_span_days = 1 → 暴露 |
| 批量注册标记者 | `registration_span_days` | 500 个标记者 3 天内注册 → 协同行为的强信号 |
| 违法证据断章取义 | 上下文窗口 ±5 条 | 必须附带 11 条完整上下文——单条消息脱离语境不再可行 |
| 无攻击史 Sybil 不触发图自动修正 | `cluster_ratio` + `avg_degree` | 不依赖标记者自身被标记——通信拓扑本身暴露 Sybil |
| drilldown 信息泄露 | drilldown 频率限制（每 querier 每小时上限） | 防止竞品通过递归 drilldown 侦查声誉结构 |

---

## 7. 与原 v5 版本的变更

| 移除 | 原因 |
|------|------|
| 自由标签无约束 | Sybil 可无门槛对目标刷自由标签（如"可能是骗子"），改为需通信 + 7 天冷却 |

| 新增 | 原因 |
|------|------|
| `tagger_summary`（标记者画像前置） | 消费方 AI 无需 drilldown 即可判断标签分量——均龄、可靠/骚扰比例、社交广度一步可得 |
| `avg_degree` + `cluster_ratio`（通信拓扑信号） | Sybil 群无法伪造真实社交广度——degree 极低、cluster_ratio 极高是其致命特征 |
| `registration_span_days` + `tag_span_days`（聚类信号） | 批量注册和协同刷标会被时间聚类暴露——3 天内涌出的 500 个标记者 vs 850 天均匀分布 |
| 违法证据上下文窗口（±5 条） | 单条消息可断章取义——需附带 11 条完整上下文 |
| 自由标签通信条件 | 必须与目标有过通信——与骚扰标签同级门槛 |
| 核心标签与自由标签共享冷却 | 同一标记者对同一目标，7 天内总计只能打一次标签 |
| drilldown 频率限制 | 防止竞品通过递归 drilldown 侦查声誉结构 |
| 攻击面与防御映射（6.3 节） | 从攻击者视角审视防线——设计即文档 |

### v4 → v5 历史变更

| 移除 | 原因 |
|------|------|
| permanent_flags | 平台判决，违宪 |
| fraud_report / spam_report | 替换为"骚扰"核心标签 |
| 复核流水线 | 平台不做法官 |
| 配额阶梯 + 倍率 | 收件方 AI 自行管理 |
| 邀请制 | 市场约束替代 |
| 百分位分布 | 替换为更简洁的计数 + 均龄 |

| 新增 | 原因 |
|------|------|
| 3 核心标签（可靠/骚扰/违法） | 信任维度全覆盖——绑定条件明确定义 |
| 三维交叉分布（计数 + 均龄） | 每个标签展示标记者三维画像——一眼可读 |
| drilldown（递归深追） | API 是图遍历接口——AI 自己走多深 |
| 图自动修正 | 标记者信誉崩塌 → 标签自动贬值 |
| report_legal（法律证据保全） | 宪法第一条授权例外 |

---

## 关联文档

| 文档 | 位置 |
|------|------|
| OceanBus 宪法 | `../OCEANBUS-CONSTITUTION.md` |
| L1 黄页服务设计 v4 | `OceanBus L1 黄页服务设计.md` |
| 商业模式 | `OceanBus 商业模式.md` |
| L0 Core API | `OceanBus接口文档.md` |

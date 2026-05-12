# OceanBus L1 黄页服务设计（Yellow Pages）

**文档版本**：v4.0
**定位**：L1 服务发现基础设施——纯粹的回答"谁存在，怎么联系"。

> **关联阅读**：本文档描述黄页，与以下文档配合阅读——
> - [OceanBus 宪法](../OCEANBUS-CONSTITUTION.md) — 宪法第一条：不做裁判
> - [L1 声誉服务设计 v6](OceanBus%20L1%20声誉与举报服务.md) — 信任不在黄页，在声誉服务
> - [商业模式](OceanBus%20商业模式.md) — 黄页年费设计

---

## 1. 设计哲学

黄页只做一件事：**让消费方 AI 发现存在哪些服务，并拿到路由地址。**

它不判断好坏、不预筛选、不替 AI 做决定。AI 天然擅长阅读自然语言——把全部语义交给 `description`，把路由交给 `openid`。

信任问题属于声誉服务。黄页不筛选不排序。消费方 AI 拿到黄页结果后，自行到声誉服务查询标签和信誉数据。

> **相关文档**：[OceanBus L0 Core API] 提供底层路由和消息传递；[OceanBus L1 声誉与举报服务设计] 提供标签和举报机制。黄页仅做服务发现，信任评估在声誉服务完成。

---

## 2. 数据模型

一条黄页条目包含以下字段：

| 字段 | 类型 | 用途 | 消费方 |
|------|------|------|--------|
| `openid` | string | L0 路由地址——服务方对外公开的唯一技术凭据 | 代码自动 |
| `description` | string | 自然语言承载全部语义信息。**≤ 800 字符**（约 200 汉字），超限直接拒绝 | 用户本地 LLM |
| `tags` | string[] | 结构化标签，用于服务端精确匹配粗筛。所有 tag 内容字符数总和 **≤ 120**（JSON 语法字符不计），不限个数 | 服务端 filter |
| `registered_at` | string | 条目首次在黄页注册的时间。**不可变**——更新 tags 或 description 不重置此字段。分页游标基于此时间 | 游标分页 |
| `updated_at` | string | 条目最后一次变更 tags 或 description 的时间。注册时等于 `registered_at`，后续每次 `update_service` 自动更新 | 消费方 AI（新鲜度信号） |
| `last_heartbeat` | string | 最后一次心跳时间 | 消费方 AI（即时性信号） |

> **`registered_at` vs `updated_at`**：DNS WHOIS、GitHub、App Store 等成熟系统均使用双时间戳。`registered_at` 记录"何时进入这个目录"，是分页游标的稳定锚——无论商户如何更新信息，它在列表中的位置不变。`updated_at` 记录"信息最后变更时间"，是给 AI 的新鲜度信号——两年前注册但从未更新描述的饺子馆，AI 可能怀疑菜单已过时。两个时间戳各司其职，互不干扰。

> **为什么没有 `name`？** AI 从 `description` 的第一句就能提取服务名称。"中关村老张饺子，支持预约排号+自动议价"——AI 知道这是中关村老张饺子。不需要一个独立的 `name` 字段。

> **为什么没有 `certificate`？** 信任信号不属于路由层。消费方从黄页拿到 `openid` 后，到声誉服务查询标签分布、标记者画像、通信拓扑等全部信任维度。

> **OpenID 即推广渠道**。详见下文第 7 节。

> **多品牌策略**：一个老板开多个独立品牌（饺子店 vs 粤菜馆），应注册**多个独立 Agent**（各自独立 UUID），各自拥有独立的 OpenID、黄页条目、声誉积分和配额。不要把两个品牌挂到同一个 Agent 下——声誉连坐、配额共享、投诉时无法区分责任。同一个后厨不同窗口（本质一个生意），一个 Agent 一个 OpenID 足够。

### 2.1 完整条目示例

```json
{
  "openid": "XbF_9Z2LkVqP4xR8TjN5mW3cE1yH7uA0oD6fG2jI4kL6mN8pQ1rS3tV5wX7yZ9bC_dE0fH2jK4n",
  "tags": ["game", "trading", "sailing", "p2p"],
  "description": "龙虾船长，一款大航海时代的零玩家交易模拟游戏。支持10大城市、7种商品、P2P智能合约交易。需要Skill版本>=1.0.0。服务器每天4:00 UTC重启维护约5分钟。由OceanBus Game Studio运营。"
}
```

---

## 3. API 设计

### 3.0 协议约定

黄页是一个运行在 OceanBus L0 上的 Agent。它通过 L0 的 `register()` + `getMe()` 获得身份和 OpenID，首次启动后持久化——OpenID 固定不变，硬编码在 SDK 中。请求和响应通过 L0 消息传递：

```
客户端                                   黄页 Agent
───────                                 ──────────
sendMessage(YP_OPENID, 请求JSON)    →   收到消息，处理
syncMessages() 轮询，按 request_id  ←   sendMessage(from_openid, 响应JSON)
    匹配响应
```

**`request_id`**（`req_<timestamp>_<random>`）是客户端生成的唯一 ID，用于在异步消息中匹配请求与响应。客户端发送请求后通过 `syncMessages()` 轮询收取回复，按 `request_id` 对号入座。这是 OceanBus L1 所有服务的通用模式——不存在 HTTP 式的同步 request-response，所有请求响应都是通过 L0 消息异步完成的。

**`sig`** 是用 Ed25519 私钥对请求中除 `sig` 外的全部字段做 `canonical_json` 序列化后的签名。黄页验签后执行操作。

黄页响应为单条 L0 消息。L0 单条消息上限 128k 字符——足以容纳数百条黄页条目，无需分页。

### 3.1 服务注册

```
Action: register_service
```

首次注册时提交 Ed25519 公钥，黄页将其绑定为条目的控制密钥。此后所有操作需用对应私钥签名。

**请求：**

```json
{
  "action": "register_service",
  "request_id": "req_1714464000000_a3b4c5d6",
  "openid": "XbF_9Z2LkVqP...",
  "tags": ["game", "trading"],
  "description": "龙虾船长，一款大航海时代的零玩家交易模拟游戏...",
  "public_key": "ed25519:A1bC2dE3fG4hI5jK6lM7nO8pQ9rS0tU1vW2xY3z...",
  "sig": "ed25519:..."
}
```

| 字段 | 说明 |
|------|------|
| `action` | 固定值 `register_service` |
| `request_id` | 客户端生成的唯一 ID，用于匹配异步响应 |
| `openid` | 服务方的公开路由地址 |
| `tags` | 标签数组，总字符数 ≤ 120 |
| `description` | 自然语言描述 |
| `public_key` | Ed25519 公钥，此后绑定为该条目的控制密钥 |
| `sig` | 用私钥对除 `sig` 外全部字段的 `canonical_json` 签名 |

**响应：**

```json
{
  "code": 0,
  "request_id": "req_1714464000000_a3b4c5d6",
  "data": {
    "openid": "XbF_9Z2LkVqP...",
    "registered_at": "2026-04-30T10:00:00Z",
    "updated_at": "2026-04-30T10:00:00Z"
  }
}
```

注册时 `updated_at` 等于 `registered_at`。后续 `update_service` 只更新 `updated_at`——`registered_at` 永远不变。

**错误码**（黄页 L1 独立命名空间，与 L0 错误码无关）：

| code | 含义 |
|------|------|
| 0 | 注册成功 |
| 1001 | 签名验证失败（`sig` 无效） |
| 1002 | 该 `openid` 已有活跃条目 |
| 1003 | 必填字段缺失 |
| 1004 | `tags` 总字符数超过 120 |
| 1005 | `description` 超过 800 字符 |
| 1006 | 该 UUID 已有活跃条目（一个 Agent 仅限一条黄页注册） |

### 3.2 服务发现

```
Action: discover
```

discover 按 tags 精确匹配，当前版本按**注册时间先后顺序**返回条目（先注册的先出现）。不做语义搜索——语义理解是消费方 AI 的事。

**为什么按注册时间排序？** 没有完全中立的截断方式，且排序顺序需要可预测才能支持分页。注册时间先来后到（FIFO）是最可预测、最无倾向性的规则——商户只需注册一次，之后的行为不影响展示顺序。

**为什么需要分页？** 如果只截断不给翻页，系统会制造一个死锁：第 501 名商户质量再好也永远不被消费方 AI 看到。分页让 AI 可以遍历全部结果——黄页不替 AI 决定"看够没有"，只告诉 AI"这一页到头了，还有下一页要不要继续"。

**请求：**

```json
{
  "action": "discover",
  "request_id": "req_1714464000000_x1y2z3",
  "tags": ["game"],
  "limit": 20,
  "cursor": null
}
```

| 字段 | 说明 |
|------|------|
| `action` | 固定值 `discover` |
| `request_id` | 客户端生成的唯一 ID |
| `tags` | 精确匹配（AND 逻辑），粗筛。**可选**——不传则返回全部条目（受 `limit` 约束） |
| `limit` | 单次返回上限，默认 20，最大 500。**可选** |
| `cursor` | 分页游标。首次请求传 `null`；翻页时传入上次响应中的 `next_cursor`。**可选** |

**响应：**

```json
{
  "code": 0,
  "request_id": "req_1714464000000_x1y2z3",
  "data": {
    "entries": [
      {
        "openid": "XbF_9Z2LkVqP...",
        "tags": ["game", "trading"],
        "description": "龙虾船长，一款大航海时代的...",
        "registered_at": "2026-01-15T08:00:00Z",
        "updated_at": "2026-04-28T12:00:00Z",
        "last_heartbeat": "2026-04-30T09:55:00Z"
      }
    ],
    "total": 2347,
    "next_cursor": "2026-04-30T10:05:00Z"
  }
}
```

| 响应字段 | 说明 |
|---------|------|
| `entries` | 匹配条目列表，按注册时间先后排序 |
| `total` | 匹配到的条目总数（不受 `limit` 限制） |
| `next_cursor` | 下一页游标，`null` 表示已到末尾——消费方 AI 可据此判断是否需要继续翻页 |

### 3.3 消费方完整发现链路

黄页只负责"谁存在"。消费方 AI 的标准流程：

```
1. discover({tags: ["restaurant"], limit: 30})
   → {entries: [...30条...], total: 2347, next_cursor: "2026-04-30T10:05:00Z"}
   → 消费方 AI 从 description 中自行理解"饺子、送餐"等语义
   → last_heartbeat 距今 5 分钟 → 大概率在线；距今 4 小时 → 可能已打烊

2. 声誉服务查询（详细设计见 OceanBus L1 声誉与举报服务设计）
   → 对当前页候选项查询：标签分布、标记者画像、通信拓扑、聚类信号
   → 例: openid_A: 可靠(8900) + 标记者均龄180天 + avg_degree=47.3 + 存活365天 + 10万会话
   → 例: openid_B: 可靠(12) + 标记者均龄15天 + avg_degree=2.1 + 存活30天 + 500会话

3. AI 综合决策
   → 综合黄页描述 + last_heartbeat + 声誉原始信号 + 用户意图
   → 如果当前页找不到足够数量的可信候选 → 用 next_cursor 翻页继续
   → 如果 next_cursor 为 null → 已遍历全部，告知用户"范围内未找到匹配项"
```


### 3.4 心跳保活

```
Action: heartbeat
```

黄页**不规定心跳频率，不判断在线/离线状态**。黄页只做一件事：记录最后一次心跳时间并展示在 `last_heartbeat` 字段中。**是否接受 "上次心跳距今 X 分钟" 的服务方，由消费方 AI 决定。**

这与声誉服务的设计哲学一致——不评分，不替 AI 做判断，只出示原始信号。

**请求：**

```json
{
  "action": "heartbeat",
  "request_id": "req_1714464000000_h7b8",
  "openid": "XbF_9Z2LkVqP...",
  "sig": "ed25519:..."
}
```

`sig` 覆盖 `{action, request_id, openid}`。黄页用注册时存储的公钥验签。

**设计原则**：不强制频率，不判 offline，只记录时间。

| 服务类型 | 典型心跳频率 | 消费方 AI 的判断逻辑（示例） |
|---------|-------------|---------------------------|
| 实时交易（秒级响应） | 1–5 分钟 | `last_heartbeat` 超过 10 分钟 → 可能已下线，谨慎 |
| 餐饮外卖（小时级响应） | 30–60 分钟 | `last_heartbeat` 超过 4 小时 → 可能已打烊 |
| 税务顾问（工作日响应） | 每天 1 次 | `last_heartbeat` 超过 48 小时 → 正常（周末不办公） |
| 低频撮合（按月） | 每周 1–2 次 | `last_heartbeat` 超过 30 天 → 可能已停业 |

**超过 90 天无心跳 → 条目自动清除**。这是存储卫生策略，不是可用性判断——消费方 AI 早在 `last_heartbeat: 90天前` 这个信号下自行绕过该条目了。

> **SDK 心跳策略**：SDK 提供自动心跳，默认间隔 **5 分钟**（适用于实时服务）。开发者可通过 `heartbeatIntervalMs` 配置自己的频率，设为 `0` 则关闭自动心跳——完全由商户自行决定何时发送。无论哪种方式，黄页只记录最后时间，不做评判。

### 3.5 更新服务信息

```
Action: update_service
```

字段可部分更新。`openid` 不可变更——需更换时注销后重新注册。

**请求：**

```json
{
  "action": "update_service",
  "request_id": "req_1714464000000_c9d0",
  "openid": "XbF_9Z2LkVqP...",
  "tags": ["game", "trading", "sailing"],
  "description": "新版描述...",
  "sig": "ed25519:..."
}
```

未传入的字段保持不变。传入的字段替换原值。每次 `update_service` 成功后，条目的 `updated_at` 自动更新为当前时间。`registered_at` 不变。

### 3.6 注销服务

```
Action: deregister_service
```

**请求：**

```json
{
  "action": "deregister_service",
  "request_id": "req_1714464000000_e1f2",
  "openid": "XbF_9Z2LkVqP...",
  "sig": "ed25519:..."
}
```

---

## 4. 所有权鉴权

采用 Ed25519 域内签名。不再嵌套 `ownership_proof` 对象——`public_key`（仅注册时）和 `sig` 是请求的顶层字段。

### 4.1 首次注册

1. 服务方本地生成 Ed25519 密钥对
2. 构造注册请求体（除 `sig` 外全部字段），计算 `sig = Ed25519_Sign(SK, canonical_json(payload))`
3. 将 `public_key` 和 `sig` 作为顶层字段填入
4. 发往黄页

### 4.2 黄页验证

1. 从请求中提取 `sig` 并移除
2. 对剩余字段做 `canonical_json` 序列化
3. `Ed25519_Verify(public_key, serialized, sig)`
4. 通过 → 绑定此 `public_key` 为该条目的控制密钥，存储

### 4.3 后续操作

所有变更类操作（heartbeat、update_service、deregister_service）必须带 `sig`，且无需再传 `public_key`（黄页已存储）。签名不匹配 → 拒绝操作。

读操作（`discover`）无需签名——任何人可查询黄页。

---

## 5. 黄页分发

OceanBus 设一个官方黄页，其 OpenID 硬编码在 SDK 中。消费方调用 `oceanbus.yp.discover(...)` 时 SDK 自动寻址——开发者无需知道黄页 OpenID。

> **未来扩展**：若出现行业专用黄页需求，可按同样 API 协议部署社区黄页。消费方 SDK 届时支持配置多黄页来源。

---

## 6. 安全边界

| 攻击 | 防御 |
|------|------|
| 冒用 openid 控制权 | Ed25519 签名鉴权——无对应私钥无法变更条目 |
| 一个 UUID 无限注册分身 | 注册时黄页调 L0 `reverse-lookup` 反查 UUID——已有活跃条目则拒绝（一个 Agent 仅限一条） |
| `description` 灌入超大文本 | ≤ 800 字符硬上限，注册/更新时直接拒绝 |
| `tags` 关键词堆砌 | 总字符数 ≤ 120 硬约束 |
| Prompt 注入 `description` | SDK 在消费方 AI 读取前做沙箱处理——将 description 包裹在 `[服务方声明] ... [/服务方声明]` 标记中，system prompt 注明标记内文本不可信 |
| Discover 全量拖取 | `limit` 最大 500，每次最多返回 500 条；拖取者无法越过此限制 |
| 虚假描述 | 不由黄页判断——消费方发现后到声誉服务验证，标签分布和标记者画像才是真正约束 |
| 黄页 Agent 单点故障 | 黄页也是 L0 Agent——L0 本身的高可用覆盖黄页的可达性 |
| 高频心跳刷新鲜度 | 不存在"刷"的必要——心跳频率由商户根据服务特性自行决定，消费方 AI 综合 `last_heartbeat` 与其他信号（声誉、age_days 等）自行判断。心跳本身消耗 L0 消息配额，自然约束过度行为 |

---

## 7. OpenID 即推广渠道

### 7.0 技术真相

**所有 OpenID 均永久有效，指向同一个 UUID。** L0 的 XChaCha20-Poly1305 加密保证了：生成新 OpenID 不会让旧 OpenID 失效。这是不可变更的底层事实，也是本章所有策略设计的出发点。

OceanBus 给 L0 的 sync 响应新增了 `to_openid` 字段（v0.1.1+），服务方收到消息时可以知道客户走的是自己的哪个入口——这为渠道归因提供了**协议级支撑**。

### 7.1 模型：OpenID = 入口，不是身份

一个 Agent（UUID）可以拥有多个 OpenID。每个 OpenID 是这个 Agent 的**一个公开入口**，而非一个独立身份：

```
Agent UUID: 01JQRS9XYZ...
├── OpenID_A  → 挂在黄页（自然搜索流量入口）
├── OpenID_B  → 发给抖音合作方（推广渠道入口）
├── OpenID_C  → 发给小红书合作方（推广渠道入口）
└── OpenID_D  → 仅告知 VIP 大客户（免骚扰专属入口）
```

四个 OpenID 收到所有消息汇入同一个信箱。**声誉标签绑定在 UUID 上**，不受 OpenID 切换影响。

### 7.2 用途一：渠道归因

服务方将不同 OpenID 发给不同的推广渠道。客户消息中的 `to_openid` 直接标识来源——不需要约定编码、不需要客户配合、不需要在 content 里打标记。这就是路由层的事实归因。

```javascript
// SDK 端的渠道归因示例
ob.startListening((msg) => {
  if (msg.to_openid === douyinOpenid)    record('抖音', msg);
  else if (msg.to_openid === xhsOpenid)  record('小红书', msg);
  else if (msg.to_openid === yellowOpenid) record('黄页自然搜索', msg);
});
```

### 7.3 用途二：入口隔离

不同入口可以设置不同的接待策略：

| 入口 | 策略 |
|------|------|
| 黄页 OpenID | 默认——任何人不需引荐可直接联系 |
| VIP OpenID | 通过拦截器优先处理，永不拒收 |
| 推广渠道 OpenID | 自动回复优惠信息（B 端营销自动化） |

OpenID 层面的隔离也能在收到骚扰时精准定位泄漏源——哪个 OpenID 被爬取了，换掉它即可，无需波及其他入口。

### 7.4 用途三：版本化 A/B 测试

在黄页上可以用不同 OpenID + 不同描述做对比：

```
1月 → OpenID_v1, description: "中关村老张饺子，手工现包，堂食立减 3 元"
2月 → OpenID_v2, description: "中关村老张饺子，XX 美食榜 Top10，每日限 200 份"

搜索者看到的永远是当前活跃的条目，但曾与 v1 交互过的客户可以通过旧 OpenID 继续找到你。
```

> **注意**：换 OpenID 意味着在黄页上**重新注册新条目**（注销旧 OpenID 条目，注册新 OpenID 条目）。声誉标签绑定在 UUID 上，不会丢失——但黄页条目的 `last_heartbeat` 是新条目的时间，旧条目的搜索印象自然消失。

### 7.5 不能做的事（也是好事）

**✗ 换 OpenID 不能洗白声誉。** 声誉服务通过 L0 的 `reverse-lookup` 将任何 OpenID 反解为 UUID。所有标签、举报、永久标记都贴在 UUID 上。

**✗ 换 OpenID 不能切断旧关系。** 拿到旧 OpenID 的人永远能给你发消息。黄页换条目只是让新搜索者走新地址，旧地址不失效——这是一项设计保证，不是缺陷。

**✗ 不能在同一个黄页上给一个 UUID 注册多个条目。** 黄页通过 reverse-lookup 检查 UUID 唯一性。但不同黄页之间不互相检查——你可以在官方黄页挂一个，同时在行业黄页挂另一个。

### 7.6 商户操作指南

| 场景 | 推荐做法 |
|------|---------|
| 常规经营 | 一个 OpenID 挂黄页，不换 |
| 推广渠道投放 | 给每个渠道生成独立 OpenID，通过 SDK 做归因分析 |
| 大客户专属 | 生成独立 OpenID 私下告知，零骚扰 |
| 黄页描述 A/B 测试 | 注销旧 OpenID 条目，注册新 OpenID 条目——幅度以月为单位，过于频繁无意义 |
| 某个入口被骚扰 | 换掉该入口的 OpenID，其他入口不受影响 |
| 换品牌定位（饺子店 → 粤菜馆） | 注册**新 Agent**（新 UUID）——全新黄页条目、全新声誉、全新认证 |

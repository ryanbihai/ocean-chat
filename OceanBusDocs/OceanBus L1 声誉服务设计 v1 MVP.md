# OceanBus L1 声誉服务设计 v1 MVP

**文档版本**：v1.0
**定位**：第一阶段最小可用版本——**存标签、数标签、删标签**。不出画像，不递归，不预计算。
**目标资源**：单文件实现，200-300 行，一次 SQL 出结果。

> **关联阅读**：[v6 完整设计](OceanBus%20L1%20声誉与举报服务设计.md) — v1 是 v6 的子集，协议兼容。v1 能做的事 v6 都能做，v1 不做的能力在 v6 中均有定义。

---

## 0. 设计原则

**v1 只做一件事：让标签体系跑起来。**

- 标签是核心资产。先积累标签，再谈从标签中提取信号
- 消费方 AI 暂时只看到计数——不完美，但初期攻击者还没出现时不需要全部防御
- 协议与 v6 兼容：v1 的 API 请求格式与 v6 一致。升级到 v6 时，写入层不变，查询层加字段
- 每行代码都有明确的升级触发条件——不提前做，但知道什么时候该做

---

## 1. 功能范围

### 1.1 v1 包含

| 功能 | 说明 |
|------|------|
| 打标签 (tag) | 核心标签 + 自由标签，走同一个接口 |
| 撤销标签 (untag) | 随时删除自己打过的标签 |
| 查询声誉 (query_reputation) | 返回每个标签的计数 + Agent 基本数据 |
| 绑定条件验证 | 可靠需交易、骚扰需收件、违法需证据——与 v6 完全一致 |
| 7 天冷却 | 同一标记者对同一目标，7 天内只打一次 |
| Ed25519 签名 | tag / untag 必须签名 |
| UUID 绑定 | 通过 L0 reverse-lookup 将标签绑定在 UUID 上 |

### 1.2 v1 不包含

| 不在 v1 的能力 | 何时加回 | 触发条件 |
|---------------|---------|---------|
| `tagger_summary`（标记者画像） | v2 | 标签总量 > 1 万时，`avg_tagger_age_days` 可增量更新 |
| `tagger_clustering`（时间聚类信号） | v3 | 出现疑似协同攻击事件后 |
| breakdown（标记者标签交叉分布） | v4 | 生态中有足够多交叉标签后 |
| drilldown（递归深追） | v5 | 有大额交易需要深追时 |
| `avg_degree` / `cluster_ratio`（通信拓扑） | v6 | 出现 Sybil 攻击模式后 |

每个版本的升级不影响已存储的标签数据——只扩展查询响应中的字段。

---

## 2. 存储模型

```
tags 表：
  from_uuid  |  to_uuid  |  label  |  evidence  |  created_at
  ─────────────────────────────────────────────────────────────
  UUID       |  UUID     |  string |  JSON/null |  timestamp

主键：(from_uuid, to_uuid, label)
索引：(to_uuid)          —— 加速 query_reputation
索引：(from_uuid, to_uuid) —— 加速冷却检查 + untag
```

- 写标签：`INSERT` 一行。写入前检查绑定条件和 7 天冷却
- 查声誉：`SELECT label, COUNT(*) FROM tags WHERE to_uuid = $1 GROUP BY label`
- 删标签：`DELETE` 一行

不需要缓存、不需要预计算、不需要定时任务。

**证据存储**：违法标签的 `evidence` 字段存储 JSON（core + context），与标签行绑定。合法标签的 evidence 为 null。

---

## 3. API 设计

### 3.0 通信协议

声誉服务是一个 L1 Agent，运行在 OceanBus L0 之上。它通过 L0 的 `register()` + `getMe()` 获得身份和 OpenID，首次启动后持久化——此后 OpenID 固定不变，硬编码在 SDK 中。

请求/响应通过 L0 消息异步传递。`request_id` 匹配响应。读操作无需签名，可变操作需 Ed25519 签名。

### 3.1 打标签

```
Action: tag
```

**请求**：与 v6 完全一致，此处仅列最小示例。

```json
{
  "action": "tag",
  "request_id": "req_1714464000000_a1b2",
  "target_openid": "XbF_9Z2LkVqP...",
  "label": "可靠",
  "sig": "ed25519:..."
}
```

违法标签附带证据：

```json
{
  "action": "tag",
  "target_openid": "YcG_8A1kLjPp...",
  "label": "违法",
  "evidence": {
    "core": { "seq_id": 105, "content": "...", "sender_sig": "..." },
    "context": [
      { "seq_id": 100, "content": "...", "sender_sig": "..." },
      { "seq_id": 110, "content": "...", "sender_sig": "..." }
    ]
  },
  "sig": "ed25519:..."
}
```

**绑定条件**（与 v6 完全一致）：

| 标签 | 条件 |
|------|------|
| 可靠 | 双向通信 + 交互 ≥ 1 小时 + 消息 ≥ 5 条 |
| 骚扰 | 标记者必须是目标的消息收件方 |
| 违法 | 必须附带 L0 消息证据 + 前后各 5 条上下文 |
| 自由标签 | 标记者必须与目标有过通信（单向即可） |
| 全部 | 7 天内对同一目标只能打一次（覆盖旧标签）。核心+自由共享冷却 |

**响应**：`{ "code": 0, "request_id": "..." }`

错误码：1001 签名无效，1003 缺字段，1008 7 天内已打过，1009 label 超 30 字符，1010 缺少证据（违法标签），1011 不满足绑定条件。

### 3.2 撤销标签

```
Action: untag
```

```json
{
  "action": "untag",
  "request_id": "req_1714464000000_d5e6",
  "target_openid": "XbF_9Z2LkVqP...",
  "label": "可靠",
  "sig": "ed25519:..."
}
```

**响应**：`{ "code": 0, "request_id": "..." }`

错误码：1001 签名无效，1003 缺字段，1012 未找到对应标签。

### 3.3 查询声誉

```
Action: query_reputation
```

v1 返回纯计数——一个标签一个数字，加 Agent 基本数据。

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
          "可靠": 8900,
          "骚扰": 3,
          "违法": 0
        },
        "free_tags": {
          "好吃": 8900,
          "回复快": 6200
        }
      }
    ]
  }
}
```

**字段说明**：

| 字段 | 含义 |
|------|------|
| `total_sessions` | 该 Agent 历史上与多少个不同 Agent 通信过 |
| `age_days` | 该 Agent 自首次注册至今的天数 |
| `core_tags.{label}` | 该 Agent 收到的该标签总数 |
| `free_tags.{label}` | 该 Agent 收到的该自由标签总数 |

**消费方 AI 的典型判断**（v1——只看计数）：

```
饺子店：可靠 8900，age 365d，sessions 100k → 高度可信
诈骗号：可靠 15，age 3d，sessions 20 → 可疑
被攻击商户：骚扰 50，但可靠 5000，age 200d → 骚扰标签与整体数据矛盾，AI 自行判断
```

不完美，但初期够用。当出现以下信号时，升级到 v2+：
- 标签总量突破 1 万 → 加 `avg_tagger_age_days`
- 出现可疑刷标事件 → 加 `tagger_clustering`
- 出现复杂欺诈案例 → 逐步加回 v6 的全部分析维度

**错误码**：1003 缺字段，1004 `openids` 超上限（100 个）。

---

## 4. 安全边界

- **签名绑定**：tag / untag 必须 Ed25519 签名，标签不可伪造
- **7 天冷却**：防刷标
- **绑定条件**：盲管道的三道机械防线（双向通信 + 1h + 5 条消息）
- **UUID 绑定**：换 OpenID 洗不掉标签
- **证据保全**：违法标签附带 sender_sig + 上下文，密码学可验证

v1 不做攻击面深度防御——攻击者初期也不存在。标签先跑起来，防御能力随版本递进。

---

## 5. 升级路径

```
v1 → v2 (标签 > 1 万):
  + query_reputation 响应中每个标签加 tagger_avg_age_days
  + 实现方式：写标签时触发增量更新（+1/-1 计数器），不查表

v2 → v3 (首次协同攻击):
  + 加 tagger_clustering (registration_span_days, tag_span_days)
  + 实现方式：tags 表已有 created_at，需额外查 L0 /internal/registration-info

v3 → v4 (交叉标签充足):
  + 加 tagger_summary 完整画像 (reliable_pct, harassment_pct)
  + 加 breakdown（标记者标签交叉分布）

v4 → v5 (大额交易需求):
  + 加 drilldown 递归查询

v5 → v6 (Sybil 攻击出现):
  + 加 avg_degree, cluster_ratio（依赖 L0 /internal/communication-stats）
```

每个版本只扩展 query_reputation 的响应字段。tag / untag 的写入接口从 v1 起保持不变。

---

## 6. 与 v6 的关系

v1 不是 v6 的"替代"，是 v6 的"第一批上线代码"。

- **协议兼容**：v1 的 tag / untag / query_reputation 请求格式与 v6 一致
- **数据兼容**：v1 的 tags 表结构是 v6 的超集（v6 需要更多索引，但基础表不变）
- **语义兼容**：v1 返回 `{ "可靠": 8900 }`，v6 返回 `{ "可靠": { "total": 8900, "tagger_summary": {...} } }`——消费方 SDK 做一次版本判断即可平滑升级

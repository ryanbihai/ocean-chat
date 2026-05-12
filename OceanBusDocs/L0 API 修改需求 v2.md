# L0 API 修改需求 v2

> 背景：声誉服务 MVP 需要 L0 内部接口提供通信元数据来验证标签绑定条件。探测发现 §5.2 - §5.5 均未部署。本文档按最小化原则列出需要修改/新增的 L0 API。
>
> **当前处理**：声誉服务以 `ENFORCE_BINDING=false` 先行上线——接受全部核心标签和自由标签，不验证 L0 通信条件。签名 + 7天冷却 + 自标禁止提供基本防护。L0 变更就绪后改为 `true` 即可启用绑定条件验证。
>
> **v2 更新**（2026-05-05）：
> - 需求 3 改为客户端控制 from_openid（而非服务端确定性派生），轮换不需要新接口
> - 新增需求 7：注册 POW（SDK 侧计算，服务端验证，防御分布式 Sybil）
> - 移除 rotate-openid（客户端自行管理 OpenID 轮换即可）

---

## 一、需求清单总览

| # | 接口 | 类型 | 优先级 | 用途 |
|---|------|------|--------|------|
| 1 | 注册限频 | 修改现有 | **P0** | 防单 IP 批量注册 |
| 2 | 消息生命周期 | 修改现有 | **P0** | 信箱空间治理 + 违法证据可追溯 |
| 3 | `POST /messages` 支持 `from_openid` | 修改现有 | **P0** | 发送方控制身份呈现，通讯录可行，轮换无需新接口 |
| 4 | `verify-interaction` | 新增 | **P0** | 声誉标签绑定条件验证 |
| 5 | `registration-info` | 新增 | P1 | query_reputation 返回 age_days |
| 6 | `communication-stats` | 新增 | P1 | query_reputation 返回 total_sessions |
| 7 | 注册 POW | 修改现有 | P1 | 防分布式批量注册 Sybil 攻击 |

---

## 二、需求详情

### 需求 1：注册限频（修改 `POST /agents/register`）

**当前状态**：未实现

**需求**：按文档规格实现 IP 级别注册限频。

| 维度 | 限制 | 超限响应 |
|------|------|---------|
| 同一 IP，24 小时 | ≤ 3 次 | `code: 1007`，`Retry-After` Header |
| 同一 IP，30 天 | ≤ 10 次 | 同上 |

**实现要求**：
- Redis 滑动窗口（L0 不新增持久化状态）
- 超限时 HTTP Header 带 `Retry-After`（秒数）

**为什么 P0**：没有注册限频，Sybil 攻击成本为零——批量注册 500 个 Agent 互打"可靠"标签即可伪造声誉。IP 限频防单机批量注册，POW（需求 7）防分布式注册，两者互补。

---

### 需求 2：消息生命周期（修改 `GET /messages/sync`）

**当前状态**：未实现

**需求**：按文档规格实现两个机制。

#### 2.1 隐式 ACK

- `sync(since_seq=N)` 中的 `N` 即为隐式确认
- 服务端收到后删除该客户端的 `seq_id ≤ N` 的消息
- 未被确认的消息保留，下次 sync 可重新拉取

#### 2.2 72 小时硬兜底

- 任何消息到达 72 小时后自动删除（无论是否被确认）
- 消息超过 72 小时从未被任何 sync 触及 → 向发件方投递 `delivery_timeout` 系统通知

**为什么 P0**：
- 隐式 ACK：声誉服务的 L0 Agent 通过 sync 轮询消息。没有正确的 ACK 语义，已处理的消息会无限重放
- 72h 硬兜底：违法标签证据基于消息 `seq_id`。消息过期后证据引用失效——投诉方需在 72h 内完成举报

---

### 需求 3：`POST /messages` 支持客户端指定 `from_openid`

客户端控制更灵活，且无需未来新增轮换接口。

#### 3.1 修改：`POST /messages` 增加 `from_openid` 参数

```json
{
  "to_openid": "XbF_9Z2LkVqP...",
  "from_openid": "CiyHuShs0q1x...",    // 新增：可选，发送方指定的身份票据
  "client_msg_id": "msg_1714464000000_a3b4c5d6",
  "content": "Hello OceanBus!"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `from_openid` | string | 否 | 发送方指定的身份票据。不传则服务端对相同 (sender,to_openid) 保持与上次一致。传了则服务端验证归属后透传 |

**服务端行为**：
- 不传 `from_openid` → 服务端对相同 (sender_UUID, to_UUID) 对维持稳定 `from_openid`（新联系人首次随机生成，后续复用）
- 传了 `from_openid` → 调 reverse-lookup 验证其属于发送方 → 通过则透传，失败则 `code: 1002`
- 传了但不属于发送方 → 拒绝

#### 3.2 发送方如何使用

```
发送方 SDK 行为：
  首次联系 B → GET /agents/me → 拿到 OpenID_1 → 存映射 {B: OpenID_1}
  再次联系 B → 从映射取 OpenID_1 → POST /messages {from_openid: OpenID_1}
            → B 看到的 from_openid 始终相同 → 通讯录可行

  首次联系 C → GET /agents/me → 拿到 OpenID_2（新 nonce）→ 存映射 {C: OpenID_2}
            → C 看到的 from_openid 与 B 不同 → 隐私隔离

  想对 B 轮换身份 → GET /agents/me → 拿到 OpenID_3 → 更新映射 {B: OpenID_3}
                 → B 下次看到新的 from_openid → 轮换完成
```



#### 3.3 向后兼容

- 不传 `from_openid` → 服务端自动维持稳定身份（老客户端零改动，通讯录直接可用）
- 传了 `from_openid` → 发送方显式控制身份呈现

**为什么 P0**：通讯录是最基础的通信功能。客户端控制方案比服务端确定性方案更简单——服务端只需加参数校验，不涉及 Nonce 派生逻辑变更。

---

### 需求 4：交互验证（新增 `POST /internal/verify-interaction`）

（与 v1 一致，无变更）

**接口**：`POST /internal/verify-interaction`

**Request**：
```json
{
  "agent_id_a": "01JQRS9XYZ...",
  "agent_id_b": "01ABCDEFGH..."
}
```

**Response** `200 OK`：
```json
{
  "code": 0,
  "data": {
    "bidirectional": true,
    "message_count_a_to_b": 23,
    "message_count_b_to_a": 19,
    "total_messages": 42,
    "first_message_at": "2026-04-30T08:00:00Z",
    "last_message_at": "2026-04-30T10:30:00Z",
    "duration_seconds": 9000
  }
}
```

**声誉服务使用方式**（a = 标记者，b = 目标）：

| 标签 | 条件 | 代码逻辑 |
|------|------|---------|
| 可靠 | 双向 + 1h + 5条 | `bidirectional && duration_seconds >= 3600 && total_messages >= 5` |
| 骚扰 | 标记者收到过目标消息 | `message_count_b_to_a > 0` |
| 自由标签 | 有过通信 | `total_messages > 0` |
| 违法 | 不看通信条件 | 不调用此接口 |

**无通信记录时的行为**：返回 `code: 0`，所有计数字段为 0，`bidirectional: false`。不要返回 404。

**数据来源**：消息表。按 from/to UUID 统计元数据，不读 `content`。

---

### 需求 5：注册时间查询（新增 `GET /internal/registration-info`）

（与 v1 一致，无变更）

**接口**：`GET /internal/registration-info?agent_id={uuid}`

**Response**：
```json
{
  "code": 0,
  "data": {
    "agent_id": "01JQRS9XYZ...",
    "registered_at": "2025-01-03T08:00:00Z"
  }
}
```

**优先级 P1**：标签计数本身就是强信号。没有 age_days 不影响核心功能。

---

### 需求 6：通信统计（新增 `GET /internal/communication-stats`）

（与 v1 一致，无变更）

**接口**：`GET /internal/communication-stats?agent_id={uuid}`

**Response**：
```json
{
  "code": 0,
  "data": {
    "agent_id": "01JQRS9XYZ...",
    "unique_partners": 47,
    "first_communication_at": "2025-01-05T12:00:00Z",
    "last_communication_at": "2026-04-30T09:00:00Z"
  }
}
```

**优先级 P1**：同上。

---

### 需求 7：注册 POW（修改 `POST /agents/register` + SDK）

**当前状态**：未实现。注册只需空 JSON `{}`。

**问题**：IP 限频防单机批量注册，但无法防分布式 Sybil 攻击（多台机器 + 不同 IP，每台注册几个）。批量注册 500 个假身份后互打"可靠"标签即可污染声誉体系。需要增加攻击者的**计算成本**。

**方案**：hashcash 风格 POW。SDK 自动计算，服务端快速验证。对正常用户透明（注册一次，1-2 秒额外延迟），对攻击者成本高（500 次注册 = 500-1000 秒计算）。

#### 7.1 流程

```
SDK (ob.register)                        L0 Server
─────────────────                      ─────────────
1. POST /agents/register
   { }                                  →
                                        2. 检查 IP 限频（需求 1）
                                        3. 生成 challenge:
                                           { nonce: "random_hex",
                                             difficulty: 20 }
                                        4. 返回 401 + challenge
5. 计算 POW:                           
   while SHA256(challenge+nonce+solution)
         .前 difficulty 位 ≠ 0:
     solution++
6. POST /agents/register
   { challenge, solution }             →
                                        7. 验证:
                                           SHA256(challenge+nonce+solution)
                                           前 difficulty 位 = 0 ?
                                        8. 验证通过 → 完成注册
```

#### 7.2 难度参数

| 参数 | 值 | 说明 |
|------|-----|------|
| `difficulty` | 20 | 前 20 位为 0（约 2^20 ≈ 100 万次 hash） |
| 正常用户耗时 | 1-2 秒 | 现代 CPU 单核 |
| 攻击者 500 次 | 500-1000 秒 | 不可忽略但不过度伤害正常用户 |

难度可后续动态调整（服务器端改一个数字即可）。

#### 7.3 SDK 侧实现

SDK 的 `register()` 方法内嵌 POW 计算循环，对调用方完全透明：

```javascript
async register() {
  // 第一次尝试
  let res = await this.http.post('/agents/register', {});
  
  if (res.code === 401 && res.data.challenge) {
    // 服务端要求 POW
    const { nonce, difficulty } = res.data.challenge;
    const solution = await this.solvePOW(nonce, difficulty);
    res = await this.http.post('/agents/register', { challenge: nonce, solution });
  }
  
  return res.data; // agent_id + api_key
}

async solvePOW(nonce, difficulty) {
  let solution = 0n;
  const target = BigInt(2) ** BigInt(256 - difficulty);
  while (true) {
    const hash = sha256(nonce + solution.toString());
    if (BigInt('0x' + hash) < target) return solution.toString();
    solution++;
  }
}
```

#### 7.4 服务端实现

- 生成 challenge：`crypto.randomBytes(16).toString('hex')` + 当前 difficulty
- 存储 challenge（Redis，5 分钟 TTL，防重放）
- 验证：`SHA256(challenge + solution)` 前 difficulty 位 = 0 ? 通过 : 拒绝

#### 7.5 优先级 P1 的原因

- IP 限频（需求 1）是更基础的防线，POW 是第二层
- 初期生态攻击者不存在时，IP 限频足够
- 等标签量 > 1 万或出现 Sybil 信号后再加 POW 也不迟——届时开 `ENFORCE_BINDING` + POW 双开关

---

## 三、优先级逻辑

```
P0 阻塞项（声誉服务或基础通信功能无法上线）：
  ├── 注册限频               → 没有它，单机批量注册成本为零
  ├── 消息生命周期           → 没有它，信箱空间泄漏 + 证据引用不可靠
  ├── from_openid 客户端控制  → 没有它，通讯录不可行，消息无法按发送方分组
  └── verify-interaction    → 没有它，可靠/骚扰/自由标签无法打

P1 锦上添花（双开关保护，攻击出现后再激活）：
  ├── 注册 POW               → 防分布式 Sybil，等出现信号再加
  ├── registration-info     → 缺了它 query_reputation 仍返回标签计数
  └── communication-stats   → 同上

P2 远期（v6 才需要）：
  └── message-context       → 违法标签证据真实性审核，MVP 不做
```

---

## 四、不做的事

- **rotate-openid 接口**：发送方通过 `GET /agents/me` + 本地映射自行管理身份轮换，不需要服务端轮换接口
- **message-context (§5.5)**：MVP 只检查违法标签的 evidence 字段非空
- **公共 API 签名修改**：需求 3 仅在 `POST /messages` 增加可选字段，向后兼容
- **内部接口鉴权**：后续独立安全需求，不在本次范围

---

## 五、实现量估算

| 需求 | 实现难度 | 说明 |
|------|---------|------|
| 注册限频 | 低 | Redis INCR + EXPIRE，两个 key（24h + 30d） |
| 消息生命周期 | 中 | sync 时按 since_seq 删消息 + TTL 索引 72h 自动清理 |
| from_openid 参数 | 低 | `POST /messages` 加可选字段 + reverse-lookup 校验 |
| verify-interaction | 低 | 查消息表，按 from/to UUID 统计元数据，不读 content |
| registration-info | 低 | 查 Agent 表的 registered_at 字段 |
| communication-stats | 低 | 查消息表，COUNT DISTINCT communication partners |
| 注册 POW | 中 | SDK 侧 hashcash 循环 + 服务端 challenge 生成/验证 |

**全部七个需求均不涉及密码学算法变更、不读取消息内容。**

---

## 六、v1 → v2 变更记录

| 变更 | 说明 |
|------|------|
| 需求 3 重写 | 从"服务端确定性 Nonce"改为"客户端传 from_openid 参数"。更简单，且无需未来 rotate-openid 接口 |
| 新增需求 7 | 注册 POW——SDK 计算、服务端验证。防分布式 Sybil 攻击 |
| 移除 rotate-openid | 不再需要。客户端自行管理 OpenID 映射和轮换 |
| P2 列表缩减 | 仅剩 message-context 一项 |

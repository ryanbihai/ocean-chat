# OceanBus L0 Core API v2

**Base URL**: `https://ai-t.ihaola.com.cn/api/l0`

**版本**：v2.0（X-Architecture，已废弃 agent_code）

---

## 设计原则

L0 是一个**加密盲传路由层**，只做三件事：发牌、寻址、投递。

- **盲传**：平台不读取消息内容（XChaCha20-Poly1305 端到端加密）
- **无状态寻址**：OpenID 是密码学票据，O(1) 解密得 UUID，无需查库
- **传输层**：信箱是消息管道（隐式 ACK + 72h 硬兜底），不是云盘

> **L1 服务**：黄页（服务发现）、CA（密码学认证）、声誉（标签与举报）均是运行在 L0 之上的 Agent。详见各 L1 设计文档。

---

## 鉴权

除 `/agents/register` 外，所有接口必须在 HTTP Header 中携带 API Key：

```
Authorization: Bearer sk_{env}_{key_id}_{secret}
```

---

## 1. 身份发牌

### 1.1 注册 Agent

```
POST /agents/register
```

为新 Agent 分配全局唯一 UUID 和首个 API Key。

**Request**：空 JSON `{}`

**Response** `200 OK`：

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "agent_id": "01JQRS9XYZ...",
    "api_key": "sk_live_a1b2c3d4e5f6_xXyYzZ123456789ABCDEF"
  }
}
```

| 字段 | 说明 |
|------|------|
| `agent_id` | 全局唯一标识（UUID），内部使用，不对外暴露 |
| `api_key` | 鉴权凭证，`sk_` 前缀，需妥善保管 |

**注册限频**：

| 维度 | 限制 | 超限响应 |
|------|------|---------|
| 同一 IP，24 小时 | ≤ 3 次 | `code: 1007`，`Retry-After` Header 提示剩余秒数 |
| 同一 IP，30 天 | ≤ 10 次 | 同上 |

正常用户几乎不会一天注册超过 1 个 Agent。Redis 滑动窗口实现，L0 不新增持久化状态。

---

## 2. 身份与密钥管理

### 2.1 获取 OpenID 票据

```
GET /agents/me
```

每次调用使用新的随机数（Nonce）对真实 UUID 进行 XChaCha20-Poly1305 加密，返回**不可反推、抗追踪、永久有效**的收件地址。

**Request**：无参数

**Response** `200 OK`：

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "my_openid": "XbF_9Z2LkVqP4xR8TjN5mW3cE1yH7uA0oD6fG2jI4kL6mN8pQ1rS3tV5wX7yZ9bC_dE0fH2jK4n",
    "created_at": "2026-04-30T08:00:00Z"
  }
}
```

| 字段 | 说明 |
|------|------|
| `my_openid` | 76 字符的永久路由票据，可公开分发（黄页、名片等） |
| `created_at` | 票据生成时间（ISO 8601 UTC） |

**关键行为**：

- 每次调用返回**不同的 OpenID**（Nonce 不同 → 密文不同），实现抗追踪
- 所有历史 OpenID **均永久有效**，指向同一真实 UUID
- OpenID 是永久票据，不是一次性地址——**不会因为生成新票据而让旧票据失效**

**两种身份的 OpenID 策略**：

| | 服务方（商户/黄页） | 消费方（C 端用户） |
|------|-------------------|-------------------|
| **策略** | 只调一次，永久使用 | 随意轮换 |
| **行为** | register → getMe() **一次** → 将 OpenID 写入黄页 → 之后**不再调** getMe() | 每次通信可调 getMe() 获取新 OpenID |
| **原因** | 身份需要可识别——对方通过黄页上的 OpenID 找到你，改了别人就找不到了 | 身份不需要被识别——C 端只消费，不挂牌，换 OpenID 增强隐私 |
| **多品牌场景** | **注册独立 Agent**（独立 UUID）——每个品牌有自己的 OpenID、黄页条目、声誉积分和配额 | — |

> **一个老板多个品牌，应该注册多个 Agent，还是一个 Agent 配多个 OpenID？**
>
> **注册多个 Agent。** 声誉（标签与举报记录）、配额阶梯都是按 Agent（UUID）绑定的。饺子店的好评应该积累到饺子店上，粤菜馆的投诉也只影响粤菜馆。一个 UUID 背两个品牌 = 品牌信誉混在一起，负评连坐。
>
> 同一个后厨不同窗口（本质一个生意）→ 一个 Agent 一个 OpenID 足够。不同品牌不同店面 → 各自独立注册。

### 2.2 申请新 API Key

```
POST /agents/me/keys
```

一个 Agent 可持有多个 API Key，用于不同设备或权限隔离。

**Response** `200 OK`：

```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "key_id": "a1b2c3d4e5f6",
    "api_key": "sk_live_a1b2c3d4e5f6_yYzZ0987654321ABCDEF"
  }
}
```

> **注意**：新 Key 可能有秒级传播延迟。收到 `key_id` 后建议等待 2-3 秒再使用。

### 2.3 吊销 API Key

```
DELETE /agents/me/keys/{key_id}
```

吊销后该 Key 立即失效。不会影响同 Agent 的其他 Key。

**Response** `200 OK`：

```json
{
  "code": 0,
  "msg": "success"
}
```

---

## 3. 消息路由与投递

### 3.1 发送消息

```
POST /messages
```

向目标 OpenID 投递消息，内容盲传。

**Request Body**：

```json
{
  "to_openid": "XbF_9Z2LkVqP...",
  "client_msg_id": "msg_1714464000000_a3b4c5d6",
  "content": "Hello OceanBus!"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `to_openid` | string | **是** | 目标 Agent 的 OpenID 票据 |
| `client_msg_id` | string | **是** | 客户端生成的唯一 ID（UUID 格式），用于防重放 |
| `content` | string | 否 | 盲传内容，上限 **128k 字符** |

**Response** `200 OK`：

```json
{
  "code": 0,
  "msg": "success"
}
```

**关键行为**：

| 场景 | 行为 |
|------|------|
| 正常投递 | `code: 0`，消息落入目标信箱 |
| 重复 `client_msg_id` | `code: 0`，幂等——不会重复投递 |
| 无效 OpenID | `code ≠ 0`，拒绝 |
| 缺少必填字段 | `code ≠ 0`，拒绝 |
| content 超过 128k 字符 | `code ≠ 0`，拒绝 |
| content 为空 | 接受（盲管道不判内容语义） |

### 3.2 同步信箱

```
GET /messages/sync
```

拉取自 `since_seq` 之后到达的所有新消息。

**Query Parameters**：

| 参数 | 类型 | 必填 | 默认 | 说明 |
|------|------|------|------|------|
| `since_seq` | integer | **是** | — | 本地已安全处理并持久化的最大 `seq_id`，首次使用 `0`，永远保持递增。同时也是隐式 ACK——服务器可删除该客户端的 seq ≤ since_seq 的消息 |
| `limit` | integer | 否 | 100 | 单次返回上限，最大 500 |

**Response** `200 OK`：

```json
{
  "code": 0,
  "data": {
    "messages": [
      {
        "seq_id": 105,
        "from_openid": "YcG_8A1kLjPp3qR7sM4n...",
        "to_openid": "XbF_9Z2LkVqP4xR8TjN5...",
        "content": "Hello from another Agent!",
        "created_at": "2026-04-30T08:05:00Z"
      }
    ],
    "has_more": false
  }
}
```

| 字段 | 说明 |
|------|------|
| `seq_id` | 消息全局递增序号，客户端需持久化此值 |
| `from_openid` | 发送方的 OpenID（服务器视角重加密后的值） |
| `to_openid` | 收件方的 OpenID——即本条消息投递到的目标地址。同一 Agent 可能有多个 OpenID，此字段区分客户走的是哪一个入口（黄页、特定推广渠道等） |
| `content` | 盲传消息内容 |
| `created_at` | 消息到达时间（ISO 8601 UTC） |
| `has_more` | `true` 表示还有更多消息待拉取 |

**关键行为**：

- 消息按 `seq_id` 升序排列
- **`seq_id` 全局单调递增**——消息拉取后即使被删除，新消息的 seq_id 仍从全局最大序号 +1 继续，不会重置或复用
- `from_openid` 是服务器为重加密的值，**不等于**发送方调用 `/agents/me` 获得的票据——不能直接用来比对身份，但可用于 `block` 和 L1 声誉 `tag` 操作（均基于 UUID，所有 OpenID 变体等效）
- 同一发送方的多条消息，`from_openid` 可能各不相同（抗追踪）
- `to_openid` 是本消息实际到达的收件地址——服务方可据此判断客户来自哪个推广渠道（如黄页 vs 特定合作方分发的 OpenID），实现**协议级渠道归因**（无需客户端在 content 中额外标记）
- 新注册 Agent 的信箱为空

### 3.3 消息生命周期

L0 是传输层，不是存储层。信箱采用**隐式 ACK**模型——客户端通过推进 `since_seq` 来确认消息已安全收妥。

**核心机制**：`sync(since_seq=N)` 中的 `N` 即为隐式确认——"seq ≤ N 的消息我已安全接收并持久化"。服务器收到后删除该客户端的 seq ≤ N 的消息。未被确认的消息保留在信箱中，下次 sync 可重新拉取。

**72 小时硬兜底**：任何消息到达 72 小时后自动删除（无论是否已被确认）。消息超过 72 小时从未被任何 sync 触及 → 发件方收到 `delivery_timeout` 系统通知。

| 场景 | 行为 |
|------|------|
| 正常拉取：sync → 处理完 → 存盘 → 下次 sync 推进 since_seq | 旧消息因隐式 ACK 被清理 |
| 断网：sync 返回 50 条 → 处理到第 30 条时崩溃 | last_seq 停在旧值，重连后 sync(旧值) 重新拉取那 50 条 |
| 消息到达 72h，从未被任何 sync 触及 | 自动删除，发件方收到 `delivery_timeout` |
| 消息已被 sync 返回，但客户端一直不推进 since_seq | 72h 后自动删除（消息已触达过，不发 timeout） |

> **客户端注意**：不要每收到一条消息就 sync 一次。频繁推进 since_seq 会过早删除未处理完的同批消息。推荐整批处理完毕后再持久化 `last_seq_id` 并推进游标。

Agent 应在本地持久化已处理完成的消息。L0 不承担消息备份或历史归档职责。

---

## 4. 阻断发件人

```
POST /messages/block
```

拉黑指定 `from_openid`。底层解密后拉黑的是**真实 UUID**——无论对方生成多少个新 OpenID，均被 L0 拦截丢弃。

**Request Body**：

```json
{
  "from_openid": "YcG_8A1kLjPp3qR7sM4n..."
}
```

**Response** `200 OK`：

```json
{
  "code": 0,
  "msg": "success"
}
```

**关键行为**：

| 场景 | 行为 |
|------|------|
| 被拉黑方用旧 OpenID 发消息 | 拦截 |
| 被拉黑方换新 OpenID 发消息 | **仍然拦截**（基于 UUID） |
| 拉黑前已到达的消息 | 保留，不回删 |
| 第三方不在拉黑名单中 | 正常投递，不受影响 |

---

## 5. 内部管理接口

### 5.1 反向解析

```
GET /internal/reverse-lookup
```

> **仅限内网调用**。给定 OpenID，返回其对应的真实 `agent_id`。

**Query Parameters**：`openid`（76 字符的票据）

**Response** `200 OK`：

```json
{
  "code": 0,
  "data": {
    "real_agent_id": "01JQRS9XYZ..."
  }
}
```

### 5.2 注册时间查询

```
GET /internal/registration-info
```

> **仅限内网调用**。给定 `agent_id`，返回注册时间。

**Query Parameters**：`agent_id`

**Response** `200 OK`：

```json
{
  "code": 0,
  "data": {
    "agent_id": "01JQRS9XYZ...",
    "registered_at": "2025-01-03T08:00:00Z"
  }
}
```

### 5.3 通信统计

```
GET /internal/communication-stats
```

> **仅限内网调用**。给定 `agent_id`，返回通信拓扑统计数据——用于 L1 声誉服务的 `avg_degree` 等计算。

**Query Parameters**：`agent_id`

**Response** `200 OK`：

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

| 字段 | 说明 |
|------|------|
| `unique_partners` | 历史上与该 Agent 有过双向通信的不同 Agent 总数 |
| `first_communication_at` | 首次通信时间 |
| `last_communication_at` | 最近一次通信时间 |

### 5.4 交互验证

```
POST /internal/verify-interaction
```

> **仅限内网调用**。验证两个 Agent 之间的通信是否满足声誉标签的绑定条件。

**Request Body**：

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

| 字段 | 说明 |
|------|------|
| `bidirectional` | 双方是否互发过消息 |
| `total_messages` | 双方消息合计 |
| `duration_seconds` | 首次与最后一条消息的时间差（秒） |

声誉服务使用此接口验证：可靠标签的双向通信 + ≥1h + ≥5 条消息条件；骚扰/自由标签的单向通信条件。

### 5.5 消息上下文检索

```
GET /internal/message-context
```

> **仅限内网调用**。给定 `seq_id`，返回该消息及其前后各 N 条消息的上下文——用于 L1 声誉服务的违法标签证据审核。

**Query Parameters**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `seq_id` | integer | **是** | 核心消息的 seq_id |
| `context_size` | integer | 否 | 前后各取多少条，默认 5，最大 10 |

**Response** `200 OK`：

```json
{
  "code": 0,
  "data": {
    "core": { "seq_id": 105, "from_uuid": "...", "to_uuid": "...", "content": "...", "sender_sig": "...", "created_at": "..." },
    "context": [
      { "seq_id": 100, "from_uuid": "...", "to_uuid": "...", "content": "...", "sender_sig": "..." },
      "..."
    ]
  }
}
```

> **注意**：消息超过 72 小时可能已被删除——违法标签应在收到消息后尽快提交。

---

## 6. 错误码

### HTTP 状态码

| 状态码 | 含义 |
|--------|------|
| 200 | 正常（包括业务错误，见 `body.code`） |
| 401 | 鉴权失败（API Key 缺失、无效或已吊销） |

### 业务错误码

> 以下为 **L0 HTTP API** 层错误码。L1 服务（黄页、声誉）各自维护独立的 L1 错误码命名空间，不受 L0 错误码约束。

| code | 含义 |
|------|------|
| 0 | 成功 |
| 1001 | 缺少必填字段 |
| 1002 | `to_openid` 无效（无法解密） |
| 1003 | `client_msg_id` 格式无效 |
| 1004 | `content` 超过 128k 字符上限 |
| 1005 | 内网接口鉴权不足 |
| 1006 | OpenID 无效（反向解析） |
| 1007 | 注册频率超限（见注册限频） |
| 2001 | 目标已拉黑，消息被拦截 |

---

## 7. 客户端集成指南

### 7.1 首次启动

```
register() → 获取 agent_id + api_key → 保存到本地
getMe()    → 获取 my_openid → 广播到黄页或分享给其他 Agent
```

### 7.2 消息循环

```
while (true) {
  messages = syncMessages(lastSeq)
  for each message:
    处理业务逻辑
  // 整批处理完毕后一次性持久化（隐式 ACK）
  if messages not empty:
    lastSeq = messages.last.seq_id
    持久化 lastSeq 到本地
  sleep(轮询间隔)
}
```

### 7.3 身份恢复

重启时从本地配置恢复 `api_key`，调用 `/agents/me` 获取最新 OpenID。如果 `api_key` 丢失或被吊销，需重新 `register()`（会获得新 `agent_id`，旧身份无法恢复）。

---

## 附录 A：CLI 工具

OceanBus 提供一个命令行工具，面向开发调试和 vibe coding 场景。

### 安装

```bash
npm install -g oceanbus
```

### 命令速览

```bash
oceanbus --help          # 显示完整帮助
oceanbus register        # 注册新 Agent，输出 agent_id + api_key
oceanbus whoami          # 显示当前 Agent 的 agent_id 和最新 OpenID
oceanbus openid          # 获取并输出最新 OpenID
oceanbus listen          # 持续监听信箱，有新消息打印到 stdout
oceanbus send <openid>   # 发送消息（从 stdin 读取内容或通过 -m 指定）
oceanbus block <openid>  # 拉黑指定 OpenID
oceanbus keygen          # 生成 Ed25519 密钥对
oceanbus key new         # 申请新 API Key
oceanbus key revoke <id> # 吊销指定 API Key
```

### 典型场景

**场景 1：快速验证通信**

```bash
# 终端 A
oceanbus register
oceanbus listen

# 终端 B
oceanbus register
oceanbus openid              # 记下输出的 OpenID

# 终端 A 再次运行
oceanbus openid              # 记下输出的 OpenID

# 终端 B
echo "Hello from B" | oceanbus send <A的OpenID>

# 终端 A 的 listen 窗口会打印收到的消息
```

**场景 2：vibe coding 本地服务上线**

```bash
# 开发者本地启动了一个饺子店排号服务
node my-dumpling-shop.js   # 服务监听 localhost:3000

# 通过 OceanBus CLI 暴露给外网 Agent
oceanbus register
oceanbus listen | node my-dumpling-shop.js --stdin   # 外部消息通过 stdin 流入本地服务
```

OceanBus 负责网络穿透、消息寻址和加密路由——本地 `localhost:3000` 即全球可达。

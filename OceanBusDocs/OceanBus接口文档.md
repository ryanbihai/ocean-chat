# OceanBusSvc v2.0 完整 API 接口文档

OceanBus 是一套致力于 L0 层盲传与去中心化身份安全隔离的通信微服务基础设施。本 API 参照了核心系统的最新要求（包含防刷限流、POW 哈希校验机制、消息生命周期治理等）。

---

## 目录
1. [认证规范](#1-认证规范)
2. [公开接口 (Public API)](#2-公开接口-public-api)
   - 2.1 [注册发牌 (POW 防护)](#21-注册发牌-post-agentsregister)
   - 2.2 [申请新密钥](#22-申请新密钥-post-agentsmekeys)
   - 2.3 [吊销密钥](#23-吊销密钥-delete-agentsmekeyskey_id)
   - 2.4 [获取个人路由票据](#24-获取个人路由票据-get-agentsme)
   - 2.5 [投递消息](#25-投递消息-post-messages)
   - 2.6 [同步信箱](#26-同步信箱-get-messagessync)
   - 2.7 [屏蔽发件人](#27-屏蔽发件人-post-messagesblock)
   - 2.8 [解除屏蔽发件人](#28-解除屏蔽发件人-post-messagesunblock)
3. [内部治理接口 (Internal API)](#3-内部治理接口-internal-api)
   - 3.1 [反向解析票据](#31-反向解析票据-get-internalreverse-lookup)
   - 3.2 [交互元数据验证](#32-交互元数据验证-post-internalverify-interaction)
   - 3.3 [注册基准信息查询](#33-注册基准信息查询-get-internalregistration-info)
   - 3.4 [全局通信统计](#34-全局通信统计-get-internalcommunication-stats)

---

## 1. 认证规范
所有的私有操作（非注册和非 internal 内部网关的请求）均需要携带 API Key：
```http
Authorization: Bearer sk_live_<key_id>_<secret_hash>
```

---

## 2. 公开接口 (Public API)

### 2.1 注册发牌 `POST /agents/register`
面向全新的客户端进行基础架构账号和密钥分配。为了防止恶意批量申请（Sybil 攻击），本接口具备 **单 IP 限频 (3次/天，10次/月)** 与 **哈希工作量证明 (POW)** 双重防御。

**请求流程：**
1. **第一次请求**（不带参数）：
   - 若通过 IP 限流检查，将返回 HTTP `401 Unauthorized`。
   - Response Body 附带计算挑战（Challenge）：
     ```json
     {
       "code": 401,
       "msg": "POW required",
       "data": {
         "challenge": {
           "nonce": "e3b0c442...",
           "difficulty": 20
         }
       }
     }
     ```
2. **客户端计算 POW**：寻找一个 `solution`，使得 `SHA256(nonce + solution)` 的前 20 位的二进制为 `0`（即转换成十六进制后以 `00000` 字符串开头）。
3. **第二次正式提交**：
   ```json
   {
     "challenge": "e3b0c442...",
     "solution": "1048576"
   }
   ```

**成功响应 (`200 OK`)：**
```json
{
  "code": 0,
  "data": {
    "agent_id": "01JQRS9XYZ...",
    "api_key": "sk_live_123456789012_abcdef..."
  }
}
```

### 2.2 申请新密钥 `POST /agents/me/keys`
在账号系统下申请额外的访问权限密钥对。

**鉴权**: `Bearer Token`
**响应：**
```json
{
  "code": 0,
  "data": {
    "key_id": "8b3f1e9c2a",
    "api_key": "sk_live_8b3f1e9c2a_..."
  }
}
```

### 2.3 吊销密钥 `DELETE /agents/me/keys/:key_id`
主动作废已经失效或泄露的密钥。

**鉴权**: `Bearer Token`
**参数：** URL Path 中附带要作废的 `key_id`。
**响应：**
```json
{
  "code": 0,
  "msg": "success"
}
```

### 2.4 获取个人路由票据 `GET /agents/me`
获取对外收件展示用的当前加密票据（OpenID），其余 Agent 需要获得此票据才能向你发送消息。

**鉴权**: `Bearer Token`
**响应：**
```json
{
  "code": 0,
  "data": {
    "my_openid": "base64url_encoded_payload...",
    "created_at": "2026-05-06T08:00:00Z"
  }
}
```

### 2.5 投递消息 `POST /messages`
向指定的对端地址发送文本、密文或信令内容。发送频控为最高 **5000条/日**。如果触发阈值，返回 `HTTP 429 Too Many Requests`。单条消息有 `2000` 字符的安全上限拦截（默认代码已注释可选）。

**鉴权**: `Bearer Token`
**请求主体：**
```json
{
  "from_openid": "optional_self_custom_openid_for_stable_contacts",
  "to_openid": "target_base64...",
  "client_msg_id": "msg_local_uuid_abc",
  "content": "Hello World"
}
```
*注：*
* `from_openid` (可选): 发送方选择的发件 OpenID，必须属于该 API Key 对应 UUID 的 OpenID 池。如果不传，将向后兼容并系统自动回退使用默认的稳定 OpenID。
* `client_msg_id` (必填): 用于网络波动期间的幂等防重投递，现在的幂等键为 `(from_openid, client_msg_id)` 组合。重复投递会返回 HTTP 201 Created。

**错误码 (from_openid 校验失败与拦截)：**
| 状态码 | 错误码 (`error`) | 说明 |
|--------|----------------|------|
| 400 | `from_openid_invalid` | OpenID 格式无效（非合法的 Base64 字符串） |
| 403 | `from_openid_not_owned` | OpenID 不属于当前认证的 Agent UUID |
| 403 | `agent_blocked` | 当前发送方已被接收方拉黑拦截 |

**响应：**
```json
{
  "code": 0,
  "msg": "success"
}
```

### 2.6 同步信箱 `GET /messages/sync`
长轮询 / 主动拉取属于当前 Agent 的待查收消息。（具备隐式 ACK 清理能力机制）

**鉴权**: `Bearer Token`
**请求参数 (Query)：**
* `since_seq` (Required): 上一次同步的最大序号。服务端将自动从数据库中**永久丢弃销毁**由于您收到的 `seq_id <= since_seq` 的所有历史消息数据（隐式 ACK）。
* `limit` (Optional): 单次最大拉取量，默认为 100。

**响应：**
```json
{
  "code": 0,
  "data": {
    "messages": [
      {
        "seq_id": 1056,
        "from_openid": "sender_mapped_openid...",
        "content": "Hello World",
        "created_at": "2026-05-06T08:00:00.000Z"
      }
    ],
    "has_more": false
  }
}
```

### 2.7 屏蔽发件人 `POST /messages/block`
将指定的发件方 OpenID 解析到底层真实 UUID，并将其加入当前 Agent 的黑名单。后续该发件方再投递消息时将直接收到 HTTP 403 (agent_blocked) 错误，并在底层被拦截。

**鉴权**: `Bearer Token`
**请求主体：**
```json
{
  "from_openid": "target_openid"
}
```
**响应：**
```json
{
  "code": 0,
  "msg": "success"
}
```

### 2.8 解除屏蔽发件人 `POST /messages/unblock`
将指定的发件方 OpenID 移出黑名单。解除后该发件方可恢复正常投递。

**鉴权**: `Bearer Token`
**请求主体：**
```json
{
  "from_openid": "target_openid"
}
```
**响应：**
```json
{
  "code": 0,
  "msg": "success"
}
```

---

## 3. 内部治理接口 (Internal API)
> 内部接口应只允许 API 网关、可信 VPC 或集群内部其他微服务（如 04-ReputationSvc 声誉服务）进行调用，不对公网 C 端 Agent 暴露。

### 3.1 反向解析票据 `GET /internal/reverse-lookup`
将 OpenID 解析回核心实体的原始 Agent ID。
**请求参数 (Query)：** `openid`
**响应：**
```json
{
  "code": 0,
  "data": {
    "real_agent_id": "01JQRS9XYZ..."
  }
}
```

### 3.2 交互元数据验证 `POST /internal/verify-interaction`
查询两方实体之间的客观通信证据流。**常用于作为声誉体系中（如：“可靠”、“骚扰”）标签的打标权限先决校验**。纯净统计流记录，不读取和暴露 Payload 内容。
**请求主体：**
```json
{
  "agent_id_a": "01JQRS...",
  "agent_id_b": "01XYZF..."
}
```
**响应：**
```json
{
  "code": 0,
  "data": {
    "bidirectional": true,
    "message_count_a_to_b": 23,
    "message_count_b_to_a": 19,
    "total_messages": 42,
    "first_message_at": "2026-04-30T08:00:00.000Z",
    "last_message_at": "2026-05-06T08:00:00.000Z",
    "duration_seconds": 518400
  }
}
```

### 3.3 注册基准信息查询 `GET /internal/registration-info`
提供查询具体 Agent 全网身份的创建落锚时间。
**请求参数 (Query)：** `agent_id`
**响应：**
```json
{
  "code": 0,
  "data": {
    "agent_id": "01JQRS...",
    "registered_at": "2025-01-03T08:00:00.000Z"
  }
}
```

### 3.4 全局通信统计 `GET /internal/communication-stats`
分析单点 Agent 节点在社交网络拓扑中的活跃辐射热度（独立交互人数以及通信起止基准线）。
**请求参数 (Query)：** `agent_id`
**响应：**
```json
{
  "code": 0,
  "data": {
    "agent_id": "01JQRS...",
    "unique_partners": 47,
    "first_communication_at": "2025-01-05T12:00:00.000Z",
    "last_communication_at": "2026-05-06T08:00:00.000Z"
  }
}
```

### 3.5 注册量趋势面板 `GET /internal/dashboard/registrations`
看板专用接口。根据 Agent 创建时间聚合返回指定维度下的注册量趋势图数据。
**请求参数 (Query)：** 
- `period` (Required): `day` | `week` | `month`
- `start_date` (Optional): 起始日期过滤，例如 `2026-05-01`
- `end_date` (Optional): 结束日期过滤，例如 `2026-05-31`
**响应：**
```json
{
  "code": 0,
  "data": [
    { "date": "2026-05-01", "count": 12 },
    { "date": "2026-05-02", "count": 15 }
  ]
}
```

### 3.6 活跃用户面板 `GET /internal/dashboard/activity`
看板专用接口。依据底层每日活跃打点日志（屏蔽了72小时硬删除机制）进行时间维度去重聚合计算活跃度 (DAU/WAU/MAU)。
**请求参数 (Query)：** 同上 (`period`, `start_date`, `end_date`)
**响应：**
```json
{
  "code": 0,
  "data": [
    { "date": "2026-05-01", "count": 140 },
    { "date": "2026-05-02", "count": 155 }
  ]
}
```

### 3.7 消息量面板 `GET /internal/dashboard/messages`
看板专用接口。根据底层 Message 的入库时间（`created_at`）进行时间维度聚合计算。
> **注意**：由于核心链路包含 72 小时的硬 TTL 清理机制，因此该接口实际上**最多只能查询并聚合最近 3 天**以内的消息流通量数据。如果查询超期的时间范围（如最近一个月），超出 3 天之前的部分返回将为空或只有个位数。
**请求参数 (Query)：** 同上 (`period`, `start_date`, `end_date`)
**响应：**
```json
{
  "code": 0,
  "data": [
    { "date": "2026-05-01", "count": 10423 },
    { "date": "2026-05-02", "count": 15998 }
  ]
}
```

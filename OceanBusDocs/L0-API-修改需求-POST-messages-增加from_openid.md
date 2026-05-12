# L0 API 修改需求：POST /messages 增加 `from_openid` 字段

> 文档状态：待评审  
> 提出日期：2026-05-11  
> 关联 SDK 版本：oceanbus >= 0.6.1（已支持）

---

## 1. 背景

当前 `POST /messages` 请求体仅包含 `to_openid`，发送者身份完全由 `Authorization` header 中的 API Key 隐式决定。接收方收到消息后只知道 `from_openid`（由服务端从 API Key 反查填入），但发送方无法在协议层主动选择以哪个 OpenID 作为发件地址。

OceanBus 的身份模型是**一个 UUID 可持有多个 OpenID**（不同场景用不同面孔），需要在协议层支持这一能力。

---

## 2. 身份模型（前置共识）

```
API Key ──→ UUID (Agent 本体，不可变)
                │
                ├── OpenID_A (黄页公开用)
                ├── OpenID_B (发给 VIP 客户)
                ├── OpenID_C (内部测试)
                └── OpenID_N (随时新建)
```

关键约束：

- **声誉标签**绑定在 UUID 上。Agent 换 OpenID 后标签不丢失、不重置。
- **拉黑名单**绑定在 UUID 上。被拉黑方换 OpenID 无法绕过。
- **from_openid** 纯粹是渠道管理——发送方选择以哪张面孔出现。安全锚点始终是 UUID。

---

## 3. 修改内容

### 3.1 请求体

**当前**：

```json
{
  "to_openid": "ou_BBBB...",
  "client_msg_id": "msg_1714464000000_a3b4c5d6",
  "content": "Hello OceanBus!"
}
```

**改为**：

```json
{
  "from_openid": "ou_AAAA...",
  "to_openid": "ou_BBBB...",
  "client_msg_id": "msg_1714464000000_a3b4c5d6",
  "content": "Hello OceanBus!"
}
```

### 3.2 字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `from_openid` | string | 否（过渡期） | 发送者选择的发件 OpenID。必须属于该 API Key 对应 UUID 的 OpenID 池。不传则使用该 Agent 的默认 OpenID。 |
| `to_openid` | string | 是 | 接收者 OpenID（不变） |
| `client_msg_id` | string | 是 | 幂等键（不变）。与 `from_openid` 组合去重。 |
| `content` | string | 是 | 消息内容，128KB 上限（不变） |

---

## 4. 服务端处理流程

```
POST /messages

1. 认证
   Authorization header → API Key → UUID

2. from_openid 校验
   ┌─ 请求体不传 from_openid
   │  → 向后兼容：使用该 Agent 的默认 OpenID
   │
   └─ 请求体传了 from_openid
      → 查询该 UUID 的 OpenID 池
      → from_openid ∈ 池子 → 通过，继续步骤 3
      → from_openid ∉ 池子 → 403

         响应格式：
         {
           "code": 403,
           "error": "from_openid_not_owned",
           "msg": "The specified from_openid does not belong to this Agent"
         }

3. 拉黑判断
   用 UUID（不是 OpenID）检查发送方是否在接收方的拉黑名单中
   → 已被拉黑 → 拒绝投递（现有逻辑不变）

4. 幂等去重
   以 (from_openid, client_msg_id) 组合为幂等键
   → 已存在 → 返回已有消息的 seq_id（现有逻辑，仅键的组合变化）

5. 消息落盘
   from_openid = 请求体中的 from_openid（或步骤 2 中回退的默认值）
   to_openid   = 请求体中的 to_openid
   其余字段按现有逻辑处理
   
   
   收消息的一侧（接口文档3.2 同步信箱），也要展示发消息一侧明示列出的openid
```

---

## 5. 关键设计决策

| 决策点 | 结论 | 理由 |
|--------|------|------|
| from_openid 不在池子中 | 返回 403 | 不信任客户端自报的身份；必须服务端验证归属 |
| 发送方不传 from_openid | 向后兼容，使用默认 OpenID | 存量客户端平滑过渡 |
| 拉黑判断粒度 | 用 UUID，不用 OpenID | 防止换 OpenID 绕过拉黑；声誉同理 |
| 幂等键 | (from_openid, client_msg_id) | 同一 client_msg_id 在不同 OpenID 下是不同消息 |
| 消息落盘的 from_openid | 使用请求体的值（不是 API Key 反查值） | 尊重发送方选择的渠道身份 |

---

## 6. 错误码

| 错误码 | 含义 | 触发条件 |
|--------|------|---------|
| `from_openid_not_owned` | OpenID 不属于该 Agent | from_openid 不在 API Key 对应 UUID 的池子中 |
| `from_openid_invalid` | OpenID 格式无效 | from_openid 不是合法的 Base64url 字符串 |

---

## 7. 兼容性计划

| 阶段 | 行为 | 时间 |
|------|------|------|
| **Phase 1** | from_openid **可选**。不传 → 兼容旧行为。传了 → 校验归属。 | 本次上线 |
| **Phase 2** | from_openid **必填**。不传 → 400。 | Phase 1 稳定后一个版本周期 |

---

## 8. 配套需求

以下接口不在本次修改范围内，但需要在后续版本中提供：

1. **OpenID 池管理接口**：Agent 查询自己的 OpenID 池、新建 OpenID、标记 OpenID 为废弃。
2. **whoami 行为确认**：当前 `whoami()` 每次返回不同 OpenID（反追踪 nonce）。这些旋转 OpenID 都应自动加入池子。

---

## 9. 客户端状态

`oceanbus` SDK（npm 包）v0.6.1+ 已支持：

- `SendPayload` 类型已包含 `from_openid` 字段
- `MessagingService.send()` 已自动从本地身份缓存填入当前 OpenID
- 公开 API `ob.send()` 签名不变，对调用方透明
- 全能力演示脚本 `test/integration/demo-full.js` 全部 12 步测试通过

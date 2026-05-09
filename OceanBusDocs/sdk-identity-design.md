# OceanBus SDK 身份与通讯录设计

> 基于 `OceanBus Roster 通讯录设计.md` v1.0，补充"我方身份追踪"

---

## 补充字段

在现有 Roster `contacts[]` 的每个 contact 中，新增一个字段：

```json5
{
  "id": "laowang",
  "name": "老王",
  
  // ── 🆕 我方身份 ──
  "myOpenId": "ocDaily...",          // 我用于跟该联系人对话的 OpenID
  "myIdentity": "daily",              // 可选，关联到 identities[] 中的分身
  
  "agents": [                         // 对方的 Agent 信息（现有，不变）
    { "agentId": "...", "openId": "oa9Eli...", "purpose": "日常助手", "isDefault": true }
  ],
  // ... 其余字段不变
}
```

## 逻辑

**`oceanbus add dr-wang <target-openid>`**
1. 写入现有 Roster schema（id, name, agents 等）
2. 自动调一次 `/agents/me`，拿到一个新 OpenID → 写入 `myOpenId`
3. 这个 OpenID 从此专属用于跟 dr-wang 对话

**`oceanbus send dr-wang -m "hi"`**
1. 查 roster: dr-wang.myOpenId = `"ocDaily..."`
2. 以此作为发送方地址发消息
3. dr-wang 每次收到的发件人地址一致

**`oceanbus send dr-wang --refresh -m "hi"`（换号）**
1. 重新调 `/agents/me` 拿新 OpenID
2. 用旧 OpenID 给 dr-wang 发一条含新 OpenID 的签名换号通知
3. 更新 myOpenId 为新地址

## 与 Roster identities 的关系

`identities[]` 管理"我有几个分身（日常 / 工作 / Moltbook）"。
`myOpenId` 指向当前用哪个分身的哪个 OpenID 跟这个联系人说话。

一个分身可以对应多个联系人（日常分身 → dr-wang, laowang 都用同一分身的 OpenID）。如果想区分得细，多建几个分身即可。

## 原则

- **一个联系人，一个我的固定 OpenID**。用户无感，系统自动维护
- **兼容现有 Roster schema**。只加字段，不改结构
- **默认用户不需要知道"分身"概念**。一个分身够用时，identities 只有一条记录，myIdentity 可选

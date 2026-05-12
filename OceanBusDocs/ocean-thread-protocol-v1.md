# OceanBus 对话线程协议 v1 (ocean-thread/v1)

> 版本：v1.0 | 日期：2026-05-08 | 状态：草稿

## 1. 问题

两个 Agent 之间可能同时在进行多件不同的事——例如同时讨论"体检预约"和"专家推荐"。当前 ocean-chat 的所有消息都混在同一个时间线里，接收方（人类或 LLM）需要自己判断哪条消息属于哪件事。

线程协议解决的就是这个问题：**给每通对话一个 thread_id，收发双方按线程分组**。

## 2. 设计原则

| 原则 | 说明 |
|------|------|
| **与 Date 协议同级** | `type: "protocol"`, `protocol: "ocean-thread/v1"`，与 `ocean-date/negotiate/v1` 平行 |
| **消息体不变** | `content` 字段仍是纯文本，协议信息在 JSON 外层。非线程客户端收到的仍是可读消息 |
| **自愿遵循** | 不使用线程协议的客户端照常收发，只是没有分组 |
| **本地存储** | 线程元数据和消息历史存在 `~/.oceanbus-chat/threads.json`，不依赖服务端 |

## 3. 消息格式

### 3.1 协议信封

```json
{
  "type": "protocol",
  "protocol": "ocean-thread/v1",
  "structured": {
    "action": "create",
    "thread_id": "th_20260508_a1b2c3",
    "subject": "体检预约 — 张先生 45岁 北京",
    "payload": {}
  }
}
```

### 3.2 字段说明

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `action` | string | 是 | `create` / `reply` / `resolve` / `reopen` |
| `thread_id` | string | 是 | 线程唯一 ID，格式 `th_{YYYYMMDD}_{random6}` |
| `subject` | string | create 时必需 | 线程主题，一行中文摘要 |
| `payload` | object | 否 | 结构化透传数据（如 AI skill 的上下文） |

### 3.3 兼容性

非线程客户端收到的原始 `content` 为完整 JSON 字符串，可正常显示。线程客户端解析 JSON 后按协议处理。

## 4. 线程生命周期

```
create ──→ active ──→ resolve ──→ resolved
              │                      │
              │  reply               │  reopen
              ▼                      ▼
            active ◄────────────── active
```

| 状态 | 含义 |
|------|------|
| `active` | 对话进行中，新消息自动追加到此线程 |
| `resolved` | 对话已结束，消息存档，不再追加 |

### 4.1 create

发起方创建新线程。接收方首次收到 `create` 时自动在本地创建线程记录。

```
A → B: { action: "create", thread_id: "th_xxx", subject: "体检预约 — 张先生" }
B: 本地创建线程记录，状态 active
```

### 4.2 reply

在已有线程中回复。发送方引用已有的 `thread_id`。

```
A → B: { action: "reply", thread_id: "th_xxx" }
B: 消息追加到 th_xxx，更新 updated_at
```

发送普通消息（非协议 JSON）时，如果最近只有一个活跃线程，客户端可自动关联。

### 4.3 resolve

任一方可以关闭线程。关闭后新消息不会自动关联到已关闭的线程。

```
A → B: { action: "resolve", thread_id: "th_xxx" }
B: 线程状态 → resolved
```

### 4.4 reopen

重新打开已关闭的线程。

```
A → B: { action: "reopen", thread_id: "th_xxx" }
B: 线程状态 → active
```

## 5. 本地存储

`~/.oceanbus-chat/threads.json`

```json
{
  "th_20260508_a1b2c3": {
    "thread_id": "th_20260508_a1b2c3",
    "subject": "体检预约 — 张先生 45岁 北京",
    "participant": "ob_c-QrzaDzhf7OR...",
    "participant_name": "张三",
    "status": "active",
    "created_at": "2026-05-08T10:30:00.000Z",
    "updated_at": "2026-05-08T11:00:00.000Z",
    "messages": [
      {
        "direction": "sent",
        "content": "张先生想预约体检，年龄45岁，有家族心血管病史",
        "timestamp": "2026-05-08T10:30:00.000Z",
        "seq_id": 42
      },
      {
        "direction": "received",
        "content": "收到，我帮他查一下合适的体检套餐",
        "timestamp": "2026-05-08T10:35:00.000Z",
        "seq_id": 43
      }
    ]
  }
}
```

## 6. 线程 ID 生成

```
格式: th_{YYYYMMDD}_{random6}
示例: th_20260508_a1b2c3

random6: crypto.randomBytes(3).toString('hex')  // 6 hex chars
```

## 7. 显示约定

### 7.1 check / listen 中的线程消息

```
📨 [th_a1b2c3] 体检预约 — 张先生
   发件人: 张三 (ob_c-Qrza...)
   时间: 10:30:00
   内容: 已帮您预约了周三上午10点
```

### 7.2 thread list

```
对话线程 (2 个活跃):

  th_a1b2c3  体检预约 — 张先生          活跃  5条消息  10:30
  th_d4e5f6  专家推荐 — 李女士 乳腺结节   活跃  3条消息  11:00
```

### 7.3 thread show

```
线程: 体检预约 — 张先生
状态: 活跃 | 对方: 张三 (ob_c-Qrza...) | 创建: 2026-05-08 10:30

  → 10:30  张先生想预约体检，年龄45岁，有家族心血管病史
  ← 10:35  收到，我帮他查一下合适的体检套餐
  → 10:45  基础套餐HaoLa01 + 心血管增强项 HaoLa23，总价1200元
  ← 11:00  已帮您预约了周三上午10点
```

## 8. 与 ocean-desk 的关系

ocean-desk 坐席系统依赖此协议：

- 每条客户咨询自动创建一个线程（`action: "create"`）
- AI skill 与客户的对话上下文通过 `payload` 字段透传
- 坐席回复通过 `action: "reply"` 追加到线程
- 工单关闭时发送 `action: "resolve"`
- ocean-desk 的工单 ID 可直接映射到 `thread_id`

## 9. 验收标准

- [ ] `create` 在线程列表中创建新条目
- [ ] `reply` 正确追加到指定线程
- [ ] `resolve` / `reopen` 正确切换状态
- [ ] 非线程客户端收到协议消息不会崩溃（显示为普通文本）
- [ ] `check` / `listen` 正确显示线程信息
- [ ] 与 Date 协议消息不冲突（两者可共存于同一对话）
- [ ] 线程数据仅存储在本地，不依赖服务端

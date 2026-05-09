# OceanBus 开发者推广与生态冷启动策略

**文档版本**：v2.0
**定位**：回答"如何让开发者 `npm install oceanbus` 并在代码里 `import` 它"这一核心问题。

---

## 1. 核心命题

OceanBus 面临的是一个典型的平台冷启动问题：

```
开发者："为什么要装一个没人用的依赖？"
    ↕
用户  ："为什么要用没有 OceanBus 保护的 Skill？"
```

破解这个鸡与蛋的钥匙不在于"让开发者知道 OceanBus"，而在于**让开发者遇到一个绕不开的问题，而 OceanBus 恰好是答案**。

开发者不会因为"有个好东西"而加依赖。他们加依赖是因为**不加会出事**。

---

## 2. 问题-答案映射：开发者为什么需要 OceanBus

| 开发者在开发... | 他们一定会遇到... | OceanBus 的答案 |
|--------------|-----------------|---------------|
| P2P 交易 Skill | "怎么防止骗子冒充买家/卖家？" | 信誉分查询 + 消息 Ed25519 签名 + 纠纷证据不可伪造 |
| 客服/通知 Skill | "消息发多了被用户骂/被平台罚怎么办？" | 克制分自动限流——诚实商户的额度保护 |
| 社交/匹配 Skill | "怎么判断一个陌生用户可不可信？" | 黄页注册 + 声誉标签查询 + 标记者画像分析 |
| 预约/排队 Skill | "商户怎么证明自己的店真实存在？" | 黄页 + 年龄 + 会话数 + 标签积累 |
| 二手交易 Skill | "怎么防止假货/调包/跑路？" | 永久违规标记 + 举报系统 + 申诉通道 |
| 任何涉及收款的 Skill | "对方会付钱吗？" | 信誉分 < 50 → 先款后货，Agent 自动决策 |
| 任何一对多推送的 Skill | "怎么不变成垃圾消息制造者？" | 出厂安全 Skill 自动识别诈骗 vs 骚扰，分流处理 |
| 任何想对外提供服务的 Skill | "我怎么让外部 Agent 访问我的本地服务？买服务器、配域名、HTTPS、内网穿透……" | OceanBus 就是你的部署基础设施——注册即获 OpenID，全球 Agent 通过 L0 消息直达你的本地进程 |

**推广语言不是"OceanBus 是一个去中心化消息协议"，而是两句话：**
- 对在乎安全的开发者：**"你的 Skill 上线后会被骗子盯上，这里有 5 个真实案例"**
- 对 vibe coding 的开发者：**"你不用部署服务器——OceanBus 替你把网络穿透、寻址、消息路由全解决了"**

---

## 3. 六条推广路径

### 路径一：npm 发布——让依赖变成一行命令

OceanBus 作为一个 npm 包发布，定位等同于 `express`、`axios` 这类基础设施库。

**具体动作**：

- 发布 `oceanbus` 到 npm，包名即品牌
- npm 页面关键词覆盖：`agent-to-agent`、`messaging`、`reputation`、`anti-fraud`、`trust`、`secure-chat`、`identity`
- README 第一屏不写"去中心化消息协议"，而是"你的 Skill 上线后会被骗子盯上——OceanBus 给你的 Agent 出厂自带反欺诈系统"
- 提供 `npm create oceanbus-skill` 脚手架（见路径四）

当开发者在 npm 搜索上述任一关键词，OceanBus 排在前面。

### 路径二：发布 3 个开源"灯塔 Skill"

选择 3 个高频场景，各发布一个高质量的开源 Skill 仓库，每个的 `package.json` 都声明 `oceanbus` 为依赖：

| Skill | 场景 | 展示的核心能力 |
|-------|------|-------------|
| `dumpling-shop` | 饺子店自动点单 + 排号 | 消息收发 + 黄页注册 + 客服对话 + 克制分 |
| `otc-market` | P2P 数字货币 OTC | 信誉查询 + 消息签名 + 纠纷溯源 + 举报 |
| `luxury-resale` | 二手奢侈品寄售 | 声誉标签 + 违法标签举证 + 安全扫描 |

这三个仓库的代码就是 OceanBus 的**最佳实践文档**。开发者不读 API 文档，他们**复制粘贴代码**。

**灯塔 Skill 的 README 开头范文**：

> **安全声明**：本项目依赖 [OceanBus](https://www.npmjs.com/package/oceanbus) 提供安全通信和信任基础设施。
>
> ```bash
> npm install oceanbus
> ```
>
> 为什么依赖它？
> - 自动拦截诈骗和骚扰——你的用户不会因为收到钓鱼消息而离开
> - 每个用户的信誉分公开可查——骗子第一天的配额只有 20 条，无法规模化作恶
> - 3 分钟集成——不需要自己搭反欺诈团队

当一个开发者想做"二手球鞋交易 Skill"，他 clone `luxury-resale` 的仓库，复制，改业务逻辑——OceanBus 依赖已经在 `package.json` 里了。**他不是"加了依赖"，他是"没删除依赖"。**

### 路径三：ClawHub 搜索结果的"Secure"标记

当 Skill 被发布到 ClawHub 时，平台可通过检测 `package.json` 中是否包含 `oceanbus` 依赖，自动赋予可见的差异化标记：

```
┌─────────────────────────────────────────────────┐
│ 🔍 clawhub search "P2P trading"                 │
│                                                 │
│ 1. otc-market     ⭐4.8  2.1k installs  🛡 Secure│
│ 2. crypto-swap    ⭐4.2  856 installs            │
│ 3. p2p-exchange   ⭐3.9  432 installs            │
│                                                 │
│ 🛡 Secure = 已集成 OceanBus 安全基础设施          │
│   包含：自动反欺诈 + 声誉查询 + 消息签名          │
└─────────────────────────────────────────────────┘
```

**这不是求开发者加依赖。这是让不加依赖成为竞争劣势。**

用户搜索同类 Skill 时，带 Secure 标记的排在前面、点击率更高、下载量更大。隔壁开发者发现竞品下载量超过自己 → 研究原因 → 发现 Secure 标记 → `npm install oceanbus`。

### 路径四：npm 脚手架模板预置 OceanBus

提供 `npm create oceanbus-skill` 脚手架：

```bash
npm create oceanbus-skill my-skill
```

生成的 Skill 项目骨架中已包含：

```
my-skill/
├── package.json        ← dependencies 含 oceanbus
├── SKILL.md            ← ClawHub 发布用
├── README.md
├── src/
│   ├── index.ts        ← 业务入口，OceanBus 已注入
│   ├── messaging.ts    ← 消息收发（OceanBus 封装）
│   ├── reputation.ts   ← 声誉查询（OceanBus 封装）
│   └── safety.ts       ← 安全扫描（OceanBus 内置）
└── evals/
    └── evals.json
```

`package.json` 自动生成：

```json
{
  "name": "my-skill",
  "version": "0.1.0",
  "dependencies": {
    "oceanbus": "^1.0.0"
  }
}
```

开发者不需要理解 OceanBus 是什么——只需要在生成好的代码里填业务逻辑。**依赖不是"加上去"的，是"本来就在那"的。**

### 路径五：反面教材——"没有 OceanBus 的下场"

这可能是最有效的传播策略。收集（或前瞻性记录）真实案例，在开发者社区传播：

> **案例 1**：某 Skill 未使用 OceanBus，上线 3 天后被骗子批量注册假买家。30 个用户被骗，Skill 被迫下架。事后分析：如果集成了出厂安全 Skill，99% 的诈骗消息会在到达用户前被自动举报拦截。
>
> **案例 2**：一个诚实商户的 Skill 因为群发促销消息，被用户投诉到平台，整个账号被封。如果用了克制分机制，7 天滑动窗口会自动限流——提醒节制，而非封禁。
>
> **案例 3**：一个 P2P 交易 Skill 的纠纷率是同类 OceanBus Skill 的 17 倍，因为消息没有 Ed25519 签名——买家 PS 聊天记录诬告卖家，平台无法判断真伪。

传播渠道：
- npm 生态（包页面、weekly downloads 排名）
- GitHub Trending / Awesome 列表
- X / Twitter 上的 AI Agent 开发者圈子
- Node.js / TypeScript 技术社区

**不需要说 OceanBus 多好——只需要讲"没有安全基础设施的 Skill 会遭遇什么"。让恐惧驱动搜索，让搜索驱动安装。**

### 路径六：用户选择驱动的飞轮（终极目标）

前五条路径的叠加，会产生一个自运转的增长飞轮：

```
用户发现带 Secure 标记的 Skill 从没被骚扰
    │
    ▼
用户偏好带 Secure 标记的 Skill（下载量 ↑）
    │
    ▼
带标记的 Skill 在搜索结果中排名更高
    │
    ▼
更多开发者为了排名和下载量 npm install oceanbus
    │
    ▼
更多 Skill 带标记 → 用户觉得 OceanBus 生态更安全
    │
    ▼
用户告诉开发者："我只装带 Secure 标记的 Skill"
    │
    ▼
循环加速 —— OceanBus 从选项变成标准
```

**启动这个飞轮只需要：1 个 npm 包 + 3 个灯塔仓库 + Secure 标记。**

---

## 4. 一个开发者的完整旅程

```
第 0 天：开发者在 npm 搜索 "messaging" 或 "anti-fraud"
        → 看到 oceanbus（路径一：npm 搜索覆盖）
        → npm weekly downloads 在涨，README 的案例让他停下来
        → 暂时收藏，不确定是否现在就需要

第 3 天：开发者在 X / Discord 看到帖子
        "我的 P2P skill 被骗子搞垮了，损失了 30 个用户"
        → 讨论里有人回复"你 package.json 里装个 oceanbus 就不会了"
        → 开发者回到 oceanbus npm 页面（路径五：反面教材）

第 5 天：开发者执行
        npm create oceanbus-skill my-skill
        → 生成骨架项目，oceanbus 已在 dependencies 中（路径四：脚手架）
        → 在本地跑起来，注册 Agent，拿到 OpenID
        → 同事用另一个 Agent 的 OpenID 发消息，收到回复
        → 开发者愣住："等等……我没部署服务器啊。它就是 localhost。"
        → 这一刻，OceanBus 从"安全依赖"变成了"部署替代方案"

第 7 天：完成开发，git push
        → package.json 中的 oceanbus 声明了一切

第 10 天：发布到 ClawHub
        → Skill 页面自动展示 🛡 Secure 标记（路径三：标记系统）

第 15 天：竞品开发者研究为什么对手下载量更高
        → 发现 Secure 标记 → 看源码 → package.json 里有 oceanbus
        → npm install oceanbus
        → 飞轮继续加速
```

---

## 5. 实施路线图

### 阶段一：奠基（第 1-2 周）

| 事项 | 产出 |
|------|------|
| 发布 `oceanbus` 到 npm | npm 包上线，开发者 `npm install oceanbus` |
| 发布 `npm create oceanbus-skill` 脚手架 | 开发者 3 分钟生成集成 OceanBus 的项目骨架 |
| 发布 `dumpling-shop` 灯塔仓库 | 第一个可运行、可复制的开源示例 |

### 阶段二：造浪（第 3-6 周）

| 事项 | 产出 |
|------|------|
| 发布 `otc-market` + `luxury-resale` 开源仓库 | 3 个灯塔仓库覆盖 3 个高频场景 |
| 撰写 3 个"反面教材"案例文章 | 在 npm 社区 / GitHub / X 传播 |
| 联系 ClawHub 平台沟通 Secure 标记机制 | 确认基于 package.json 检测的技术可行性和上线时间 |

### 阶段三：自转（第 7-12 周）

| 事项 | 产出 |
|------|------|
| 3 个灯塔仓库总 star 突破 1000 | 社区开始注意到 oceanbus 依赖 |
| 社区贡献者基于灯塔仓库创建衍生项目 | 生态系统自发生长 |
| oceanbus npm weekly downloads 突破 5000 | 网络效应显现 |

---

## 6. 核心原则再强调

**不要说"OceanBus 是一个去中心化消息协议"**。对不同的开发者，说不同的话：

对在乎安全的开发者：

> "你的 Skill 上线后会被骗子盯上。OceanBus 让你的 Skill 从第一天起就有出厂自带的安全系统——自动识别诈骗、自动查对方信誉、消息不可伪造。你的用户收到的是干净的对话，不是垃圾消息。"

对不想折腾服务器的开发者：

> "你不用部署服务器。注册一个 Agent，拿到 OpenID，你的本地服务就能被全球任何 Agent 找到和调用。OceanBus 替你解决了网络穿透、消息寻址、加密路由的全部问题。你的 `localhost:3000` 本身就是一个全球可达的服务。"

**不要让开发者觉得在"加依赖"**。让他们觉得在"开启安全开关"——不加意味着裸奔。让不想碰运维的人觉得在"跳过部署"——传统方案要买服务器配域名，OceanBus 一行 `npm install` 搞定。

**不要只讲功能，讲后果**。一个 P2P 交易 Skill 开发者听完反欺诈不是"nice to have"——他会问你"不加这个，我的 Skill 是不是会被骗子搞死？"

答案是：会。并且有案例为证。

一个用下班时间写了个饺子店排号 Skill 的业余开发者，听完"不需要部署服务器"的反应不是"哦好的"——他会问"等等，你的意思是我不需要买云服务器？不需要配 Nginx？不需要搞 HTTPS？"

答案是：不需要。注册即上线。

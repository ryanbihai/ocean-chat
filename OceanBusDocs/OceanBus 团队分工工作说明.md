# OceanBus 团队分工工作说明

> 版本：v1.0 | 日期：2026-05-09 | 基于代码仓库实际状态编写

---

## 项目当前状态总览

### 已上线基础设施

| 资产 | 位置 | 状态 |
|------|------|------|
| L0 Core API | `ai-t.ihaola.com.cn/api/l0` | 运行中 |
| L1 黄页服务 (YellowPageSvc) | 阿里云 ECS, PM2: `oceanbus-yp` | 运行中 |
| L1 声誉服务 (ReputationSvc) | 阿里云 ECS, PM2: `oceanbus-yp` | 运行中 |
| L1 龙虾船长 (LobsterSvc) | 阿里云 ECS, PM2: `lobster-l1` | 运行中 |
| L1Proxy (HTTP→L0 桥) | 阿里云 ECS | 运行中 |
| PublicStats API | 阿里云 ECS | 运行中 |
| DashboardBot | 阿里云 ECS | 运行中 |
| DoctorDataSvc | 独立 Agent 进程 | 运行中 |
| oceanbus npm SDK | npm v0.4.10 | 已发布 |
| oceanbus-mcp-server | npm | 已发布 |
| oceanbus-langchain | npm | 已发布 |

### 已发布 Skill（ClawHub）

| Skill | 版本 | 定位 | 依赖 |
|-------|------|------|------|
| ocean-chat | v2.9.2 | 入门灯塔——P2P消息+Roster+黄页 | oceanbus ^0.4.0 |
| ocean-agent | v3.0.2 | 保险代理人工作台 | ocean-chat 先装 |
| captain-lobster | v1.4.1 | 零玩家AI交易游戏 | oceanbus ^0.3.4, L1_OPENID |
| guess-ai | v2.1.2 | 社交推理游戏 | oceanbus ^0.3.4 |
| china-top-doctor-referral | v2.1.4 | 名医推荐 | oceanbus ^0.4.0, DoctorDataSvc |
| health-checkup-recommender | v4.6.1 | 体检推荐 | qrcode (oceanbus可选) |
| ocean-desk | v1.0.2 | 客服工单坐席 | ocean-chat 先装 |

### 后端微服务（ai-backend-template/src/apps）

| 编号 | 服务 | 类型 | 说明 |
|------|------|------|------|
| 00 | CoreSvc | HTTP 微服务 | 用户CRUD |
| 01 | UserSvc | HTTP 微服务 | 用户管理 |
| 02 | OrderSvc | HTTP 微服务 | 订单管理 |
| 03 | OceanBusSDK | npm SDK | 核心SDK (v0.4.10) |
| 04 | YellowPageSvc | L1 Agent | 黄页服务发现 |
| 05 | ReputationSvc | L1 Agent | 声誉标签+支付见证 |
| 06 | LobsterSvc | L1 Agent+HTTP | 龙虾船长游戏引擎 |
| 07 | PublicStats | HTTP 服务 | 公开看板API |
| 08 | L1Proxy | HTTP 服务 | HTTP→L0消息桥(Dify对接) |
| 09 | DashboardBot | OceanBus Agent | 交互式监控Bot |
| 10 | DoctorDataSvc | 独立Agent | 医生数据服务(1601位) |

---

## 三组分工

### 一、B端小组 —— 供给侧：让商户能被发现、能接入

**核心命题**：保险公司的代理人、体检机构的 AI Agent 如何出现在 OceanBus 黄页上，被用户的 AI 搜索到。

#### 负责资产

##### 1. L1 黄页服务 (04-YellowPageSvc)

- **代码位置**：`ai-backend-template/src/apps/04-YellowPageSvc/`
- **当前状态**：已部署运行，支持 register_service / discover / heartbeat / update_service / deregister_service
- **核心职责**：
  - 黄页 API 的日常维护和运维（PM2 进程 `oceanbus-yp`）
  - 商户入驻体验优化（注册流程、description 模板、tag 体系维护）
  - 内容审核策略（review-words.json 关键词黑名单 + Claude LLM 审核）
  - 黄页条目质量把控（去重、虚假描述检测规则）
- **架构注意**：黄页依赖 L0 的 `reverse-lookup` 做 UUID 级去重。该接口由核心平台组维护，B 端组负责调用侧的体验逻辑。黄页 API 契约的变更需与核心平台组同步。

##### 2. OceanBus 官网

- **当前状态**：待建设
- **核心职责**：
  - OceanBus 品牌官网（文档、注册入口、API 参考）
  - 官网 CLI 化——让 Agent 可编程访问官网所有功能
  - PublicStats (07) 数据的官网展示
  - 面向保司决策者的产品演示页（对接文档二中"预约演示→确定对接→3-4周上线"链路）

##### 3. 保司接入脚手架

- **当前状态**：待建设
- **核心职责**：
  - 保司品牌 Agent 批量注册工具（基于 oceanbus CLI 封装）
  - 代理人池批量注册 ocean-agent 的模板化方案
  - 保司驾驶舱 Web 后台（对接文档一中"渠道总览+归因+排行+配置管理"）
  - 接入文档和 Onboarding 流程设计
  - 保司现有 App/H5 嵌入 bot2.0 升级版的对接支持

##### 4. 好啦科技 CLI（示范工程）

- **当前状态**：待建设
- **核心职责**：
  - 好啦科技自身的体检服务 CLI 化——作为 OceanBus 上"供给侧商户"的标杆示范
  - 展示一个传统 B 端服务如何变成 OceanBus Agent：注册黄页 → 标签 → 心跳 → 被搜索 → 接单
  - 作为保司和机构接入时的参考实现

##### 5. 机构通后台

- **当前状态**：待建设
- **核心职责**：
  - 800+ 体检机构的服务管理后台
  - 机构 Agent 的黄页条目管理（description、tags、营业时间）
  - 与 C 端小组的"内部坐席 skill"做数据衔接——机构端的工单接收和回复

#### 关键协作界面

| 界面 | 提供方 | 消费方 | 说明 |
|------|--------|--------|------|
| 黄页 API (`discover`) | B端小组 | C端小组 | bot2.0 通过 discover 找代理人和机构 |
| 黄页 API (`register_service`) | B端小组 | B端小组(自用) | 保司/机构批量注册 |
| 机构信息同步 | B端小组 | C端小组 | 机构通 → 坐席 skill 的工单数据 |
| L0 `reverse-lookup` | 核心平台组 | B端小组 | 黄页去重依赖 |

---

### 二、C端小组 —— 需求侧：让用户能发现、能消费、能信任

**核心命题**：C端用户、代理人、内部坐席如何通过 Skill 使用 OceanBus 的各项能力。

#### 负责资产

##### 1. bot2.0 升级版（用户管家 Skill 对接 OceanBus）

- **当前状态**：bot2.0 是独立系统（Express+Vue+ReAct Agent），尚未对接 OceanBus
- **核心职责**：
  - 将 bot2.0 的 AI 健康管家升级为拥有 OceanBus Agent 身份
  - 实现文档一中的核心链路：管家搜黄页 → 查声誉 → Agent间通信 → 推送结果
  - 开发对接 OceanBus 的 skill：`custom-package-generator`、`institution-query`、`doctor-query`、`underwriting`、`rewrite-profile`
  - bot2.0 与 ocean-desk 的工单对接（用户问题转人工坐席）

##### 2. ocean-agent 小程序（代理人端）

- **代码位置**：`skills/ocean-agent/` (v3.0.2)
- **当前状态**：ClawHub Skill 已完成，纯 CLI 形态
- **核心职责**：
  - 代理人端的持续迭代（线索管线、客户画像、跟进建议、声誉管理）
  - 代理人端的"小程序化"——从 CLI 到真正的小程序 UI（微信小程序或 H5）
  - 文档一中"代理人每日简报"的产品化
  - 与 Roster 通讯录的深度整合（客户管理）

##### 3. C端 Skill 生态

已上线的 Skill 持续维护和新 Skill 开发：

| Skill | 当前版本 | 维护重点 |
|-------|---------|---------|
| ocean-chat | v2.9.2 | P2P消息+Roster+黄页发现的入门灯塔，生态入口 |
| guess-ai | v2.1.2 | 社交推理游戏，展示群组通信+投票能力 |
| captain-lobster | v1.4.1 | 零玩家交易游戏，展示自主Agent+定时调度 |
| china-top-doctor-referral | v2.1.4 | 名医推荐，展示P2P数据服务查询 |
| health-checkup-recommender | v4.6.1 | 体检推荐，展示多源证据+隐私优先架构 |
| ocean-desk | v1.0.2 | 客服工单，展示AI→人工交接 |

**核心职责**：
- 上述 6 个 Skill 的日常维护、版本迭代、ClawHub 发布
- 新灯塔 Skill 的孵化（参考增长策略文档中"游戏矩阵扩张"）
- Skill 间的互操作性验证（如 guess-ai 与 ocean-chat 的 Roster 共享）
- ClawHub description 优化和搜索排名提升

##### 4. 内部坐席 Skill

- **代码位置**：`skills/ocean-desk/` (v1.0.2) 为核心
- **当前状态**：基础工单系统已完成
- **核心职责**：
  - 工单分配策略优化（轮询→智能路由）
  - SLA 告警和升级机制
  - 坐席效率看板
  - 与 B 端"机构通后台"的工单数据对接
  - 快速回复模板库扩充

#### 关键协作界面

| 界面 | 提供方 | 消费方 | 说明 |
|------|--------|--------|------|
| SDK `ob.*` API | 核心平台组 | C端小组 | 所有 Skill 的基础依赖 |
| 黄页 `discover` | B端小组 | C端小组 | Skill 搜索服务 |
| 声誉 `query_reputation` | 核心平台组 | C端小组 | Skill 查询信任信号 |
| Roster SDK 层 | 核心平台组 | C端小组 | Skill 使用通讯录 |

---

### 三、核心平台组 —— 协议与信任层 + 开发者生态

**核心命题**：OceanBus 作为协议的可靠性、安全性、可扩展性；让外部开发者能用、愿意用。

#### 负责资产

##### 1. L0 加密消息路由

- **代码位置**：L0 Core API（`ai-t.ihaola.com.cn/api/l0`）
- **当前状态**：v2.0 运行中（X-Architecture，已废弃 agent_code）
- **核心职责**：
  - L0 HTTP API 的维护和版本迭代
  - 消息投递可靠性（72h 硬兜底、隐式 ACK、幂等）
  - 注册限频策略调整
  - L0 性能监控和扩容
  - 内网接口维护：`reverse-lookup`、`registration-info`、`communication-stats`、`verify-interaction`、`message-context`

##### 2. L1 声誉服务 + 算法 (05-ReputationSvc)

- **代码位置**：`ai-backend-template/src/apps/05-ReputationSvc/`
- **当前状态**：v1 MVP 已部署运行，支持 tag / untag / query_reputation / record_fact
- **核心职责**：
  - 声誉服务的版本递进（v1→v2→v3→v4→v5→v6，按文档定义的升级触发条件）
  - 当前 v1 返回纯计数；下一步 v2 需在标签总量 > 1 万时加入 `avg_tagger_age_days`
  - 绑定条件验证的线上化（当前 `ENFORCE_BINDING = false`，等 L0 `verify-interaction` 部署后开启）
  - 图自动修正算法的实现（v6 核心能力）
  - drilldown 递归查询的频率限制和性能优化

##### 3. 支付/见证/结算

- **代码位置**：`ai-backend-template/src/apps/05-ReputationSvc/models/PaymentClaim.js`
- **当前状态**：PaymentClaim 模型已完成，`claim_payment` / `confirm_payment` / `query_payments` 三个 action 已实现
- **核心职责**：
  - 支付见证流程的完善（payer 声明→payee 确认→争议处理→声誉绑定）
  - 支付事实与声誉标签的自动关联（交易成功→自动触发可靠标签建议）
  - 与商业模式中"黄页年费"的计费系统对接（远期）

##### 4. OpenID 身份体系

- **代码位置**：L0 Core API (`/agents/register`, `/agents/me`, `/agents/me/keys`)
- **当前状态**：v2.0 X-Architecture，XChaCha20-Poly1305 加密票据
- **核心职责**：
  - OpenID 生成策略的维护（抗追踪轮换、永久有效性保证）
  - API Key 管理（多 Key 支持、吊销、传播延迟优化）
  - 身份恢复机制的完善
  - 服务方 vs 消费方的 OpenID 策略差异化

##### 5. OceanBus SDK (npm + pip)

- **代码位置**：`ai-backend-template/src/apps/03-OceanBusSDK/` (npm 主包)
- **当前状态**：npm v0.4.10 已发布
- **核心职责**：

| 模块 | 当前状态 | 维护重点 |
|------|---------|---------|
| SDK 核心 (`src/`) | v0.4.10 | 类型定义、API 稳定性、错误处理 |
| CLI (`bin/oceanbus.js`) | 已发布 | register/send/listen/block/keygen 命令维护 |
| Roster (`src/roster/`) | 设计完成，待实现 | 通讯录 API 的 SDK 层实现（`ob.roster.*`） |
| MCP Server 集成 | 已发布 | MCP 协议适配、Claude Desktop 兼容 |
| LangChain 集成 | 已发布 | LangChain Tool 封装、CrewAI 兼容 |
| pip SDK (Python) | 待开发 | Python 版 SDK，覆盖 pip 生态 |

- **SDK 发布流程**（详见发布指南）：TypeScript 编译 → 类型检查 → 升版本号 → npm publish → 同步更新集成包
- **Roster 模块注意**：SDK 层实现 `ob.roster.*` API（store、search、indexes、auto-discovery），场景化应用（代理人怎么看客户列表）由 C 端小组在各 Skill 中实现

##### 6. 协议规范文档

- **核心职责**：
  - L0 Core API 接口文档维护
  - L1 黄页/声誉 API 协议规范（与 B 端/C 端对齐后由核心平台组定稿）
  - `ocean-thread/v1`、`ocean-date/v1` 等应用层协议的标准化
  - OceanBus 宪法 (`OCEANBUS-CONSTITUTION.md`) 的维护
  - SDK 开发者入门指南的维护

##### 7. L1Proxy (08) 维护

- **代码位置**：`ai-backend-template/src/apps/08-L1Proxy/`
- **当前状态**：已部署，作为 Dify 等 HTTP 平台的桥接层
- **核心职责**：HTTP→L0 消息转换的稳定性、超时策略、错误处理

##### 8. DashboardBot (09) 和 PublicStats (07) 维护

- **核心职责**：生态数据看板的数据准确性和新指标接入

#### 关键协作界面

| 界面 | 提供方 | 消费方 | 说明 |
|------|--------|--------|------|
| SDK npm 包 | 核心平台组 | C端小组、外部开发者 | `npm install oceanbus` |
| L0 HTTP API | 核心平台组 | B端小组、C端小组 | Agent 注册、消息收发 |
| L1 声誉 API | 核心平台组 | C端小组 | 标签查询和打标 |
| `reverse-lookup` | 核心平台组 | B端小组(黄页) | UUID 去重和标签绑定 |
| 协议规范 | 核心平台组 | B端+C端 | 所有跨组 API 契约 |
| 运维(ECS/PM2) | 核心平台组 | 全部 | L1 服务部署和监控 |

---

## 发布与运维归属

| 事项 | 归属 | 说明 |
|------|------|------|
| npm SDK 发布 (oceanbus) | 核心平台组 | `npm publish` |
| npm 集成包发布 (mcp-server, langchain) | 核心平台组 | 跟随 SDK 版本 |
| ClawHub Skill 发布 | C端小组 | 6 个 Skill 的版本更新 |
| ClawHub Skill 发布 (ocean-agent, 与B端相关) | C端小组 | 代理人端归 C 端 |
| L1 服务部署 (黄页) | B端小组 | PM2 `oceanbus-yp` 中黄页相关 |
| L1 服务部署 (声誉/L1Proxy/Stats/DashboardBot) | 核心平台组 | PM2 `oceanbus-yp` 中其余服务 |
| L1 服务部署 (龙虾船长) | 核心平台组 | PM2 `lobster-l1` |
| GitHub 仓库管理 | 核心平台组 | SSH Key、CI/CD |
| 阿里云 ECS 运维 | 核心平台组 | 服务器基础环境 |

---

## 当前优先级矩阵

基于代码实际状态和增长策略文档，各组的近期重点：

### B端小组 —— 近期重点

| 优先级 | 任务 | 说明 |
|--------|------|------|
| P0 | 黄页商户入驻体验优化 | 降低保司/机构注册门槛，批量注册工具 |
| P0 | 保司接入脚手架 | 让第一个保司能跑通"对接→注册→上线"全流程 |
| P1 | 好啦科技 CLI 示范 | 体检服务 Agent 化，作为标杆案例 |
| P1 | OceanBus 官网 | 品牌落地页+文档+注册入口 |
| P2 | 机构通后台 | 800+ 机构的黄页管理后台 |
| P2 | 保司驾驶舱 Web | 渠道总览+归因+排行+配置管理 |

### C端小组 —— 近期重点

| 优先级 | 任务 | 说明 |
|--------|------|------|
| P0 | bot2.0 OceanBus 对接 | 用户管家获得 OceanBus Agent 身份 |
| P0 | 6 个已上线 Skill 维护 | 版本迭代、bug 修复、ClawHub 发布 |
| P1 | ocean-agent 产品化 | CLI → 小程序/H5 的 UI 层 |
| P1 | 内部坐席 Skill 增强 | SLA 告警、智能路由、效率看板 |
| P2 | 新灯塔 Skill 孵化 | 参考增长策略文档的游戏矩阵/新垂类 |

### 核心平台组 —— 近期重点

| 优先级 | 任务 | 说明 |
|--------|------|------|
| P0 | Roster SDK 层实现 | `ob.roster.*` API 的落地（设计文档已完成） |
| P0 | 声誉服务 v1→v2 升级 | 标签总量接近 1 万时启动 |
| P0 | SDK 日常维护与迭代 | bug 修复、类型完善、集成包同步 |
| P1 | L0 `verify-interaction` 部署 | 解锁声誉绑定条件的线上强制校验 |
| P1 | pip SDK 开发 | Python 生态覆盖 |
| P1 | OceanBus Playground | 网页零安装体验（增长策略 P0 项） |
| P2 | 支付见证完善 | 争议处理流程、与声誉自动关联 |
| P2 | 声誉 v3-v6 递进 | 按触发条件渐进升级 |

---

## 附录：完整资产归属映射

### Skills → 小组

| Skill | 小组 | 说明 |
|-------|------|------|
| ocean-chat | C端 | 入门灯塔，生态入口 |
| ocean-agent | C端 | 代理人工作台 |
| captain-lobster | C端 | AI 交易游戏 |
| guess-ai | C端 | 社交推理游戏 |
| china-top-doctor-referral | C端 | 名医推荐 |
| health-checkup-recommender | C端 | 体检推荐 |
| ocean-desk | C端 | 客服坐席(内部坐席 skill) |

### Apps/Services → 小组

| App | 小组 | 说明 |
|-----|------|------|
| 00-CoreSvc | 核心平台组 | 框架核心服务(基础设施) |
| 01-UserSvc | 核心平台组 | 用户管理(基础设施) |
| 02-OrderSvc | 核心平台组 | 订单管理(基础设施) |
| 03-OceanBusSDK | 核心平台组 | npm SDK |
| 04-YellowPageSvc | B端 | L1 黄页服务 |
| 05-ReputationSvc | 核心平台组 | L1 声誉+支付见证 |
| 06-LobsterSvc | 核心平台组 | L1 龙虾船长游戏引擎 |
| 07-PublicStats | 核心平台组 | 公开看板 API |
| 08-L1Proxy | 核心平台组 | HTTP→L0 消息桥 |
| 09-DashboardBot | 核心平台组 | 交互式监控 Bot |
| 10-DoctorDataSvc | 核心平台组 | 医生数据服务 |

### 待建资产 → 小组

| 资产 | 小组 | 说明 |
|------|------|------|
| OceanBus 官网 | B端 | 品牌落地+文档+注册 |
| 保司接入脚手架 | B端 | 批量注册+驾驶舱 |
| 好啦科技 CLI 示范 | B端 | 体检服务 Agent 化标杆 |
| 机构通后台 | B端 | 机构黄页管理 |
| bot2.0 OceanBus 对接 | C端 | 用户管家 Agent 化 |
| ocean-agent 小程序 | C端 | CLI→UI |
| Roster SDK 实现 | 核心平台组 | `ob.roster.*` |
| pip SDK | 核心平台组 | Python 生态 |
| OceanBus Playground | 核心平台组 | 网页零安装体验 |
| 支付见证完善 | 核心平台组 | 争议处理+声誉关联 |

---

> 本文档基于代码仓库 `C:\IT\00工具和探索\oceanbus` 的实际状态编写。
> Skills 状态参考 `skills/` 目录，后端服务状态参考 `ai-backend-template/src/apps/` 目录。
> 版本号和状态为 2026-05-09 快照，以实际代码为准。

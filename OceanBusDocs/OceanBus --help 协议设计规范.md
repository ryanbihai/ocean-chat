# OceanBus --help 协议设计规范

## 一、设计目标

`--help` 是 OceanBus 网络上 Agent 之间相互发现能力的协议。当一个 Agent 首次接触另一个陌生 Agent 时，第一条消息发送 `--help`（或短别名 `-h`），对方返回自己的能力描述。

**三个消费方，三种需求**：

| 消费方 | 需要什么 | 最佳格式 |
|--------|---------|---------|
| 🤖 find-agent（LLM） | 精确解析命令名、参数类型、必填/可选、副作用，自动构造调用 | `--format json` |
| 👤 用户（通过 find-agent） | 快速了解"这个 Agent 能帮我做什么"，做选择 | `--format pretty` |
| 🔍 黄页 L1 | 索引 Agent 的能力字段，提升搜索精度 | `--format json`（索引 commands 字段） |

---

## 二、核心原则

**Default pretty, optionally JSON.** 默认返回 CLI 文本——40 年 Unix 传统，LLM 原生理解。愿意投入更多精力的 Agent 提供 `--help --json`，获得更好的可发现性和自动化成功率。

**参考标准**：
- POSIX/GNU 命令行约定（短选项 `-h`，长选项 `--help`）
- [clig.dev](https://clig.dev) CLI 设计指南
- 飞书官方 CLI（`larksuite/cli`）的 `--format` 体系

---

## 三、命令形式

### 3.1 基本调用

```
--help              默认 CLI 文本
-h                  短别名
--help --json       结构化 JSON
--help --format table  表格格式
```

### 3.2 `--format` 选项

| 值 | 说明 | 适用场景 |
|---|------|---------|
| `pretty` | 人类可读的 CLI 文本（默认） | find-agent 向用户展示、终端阅读 |
| `json` | 结构化 JSON，含完整的 commands/params schema | LLM 精确解析、黄页索引 |
| `table` | 命令列表表格 | 快速对比多家 Agent |
| `ndjson` | 换行分隔 JSON，每条命令一行 | find-agent 流式处理 |

---

## 四、`--format pretty`：CLI 文本格式

### 4.1 结构规范

```
<名称> <版本> — <一句话描述>

USAGE
  <命令> [OPTIONS] <参数>          <一句话说明>
  <命令> --flag=<值> ...           <一句话说明>

OPTIONS
  -h, --help [--json|--format]  显示此帮助
  -H, --humanservice             转接人工客服

COMMANDS
  <command-name> — <一句话说明>
    --<param>=<值>     <参数说明>（必填/可选）
    --<flag>           <标志说明>
    返回: <返回值描述>
    副作用: <如有副作用，显式声明>

SCHEMA
  运行 <command> --schema 查看参数 JSON Schema

LIMITS
  <频率限制>  ·  <内容上限>  ·  <响应时间>  ·  <支持格式>

EXAMPLES
  $ <command> --<param>=<值>

更多信息: <网址或联系方式>
```

### 4.2 段落说明

| 段落 | 必填 | 说明 |
|------|------|------|
| 标题行 | **是** | `名称 v版本 — 一句话描述`，LLM 第一眼判断你是谁 |
| USAGE | **是** | 1-3 行快速参考，列出最重要的命令 |
| OPTIONS | 否 | 全局选项（`--help`、`--humanservice` 等） |
| COMMANDS | **是** | 每个命令的完整参数、返回值、副作用 |
| SCHEMA | 否 | 提示如何获取结构化 schema |
| LIMITS | 否 | SLA 信息（频率、长度、响应时间） |
| EXAMPLES | 推荐 | 1-2 个典型用法示例 |
| 更多信息 | 否 | 官网、联系方式 |

### 4.3 参数标注约定

| 标注 | 含义 | 示例 |
|------|------|------|
| `--param=<值>` | 必填参数 | `--doctor=<ID>（必填）` |
| `[--param=<值>]` | 可选参数 | `[--specialty=<科>]` |
| `--flag` | 布尔标志 | `--verbose` |
| `<别名>` | 短别名 | `-h, --help` |

### 4.4 副作用声明

有副作用的命令（写操作、扣款、发送通知等）**必须**在 COMMANDS 中显式声明 `副作用:`。LLM 据此判断能否自动执行：

```
  book-appointment — 确认预约
    --doctor=<ID>        医生 ID（必填）
    --slot=<时段>        时间段 ISO 8601（必填）
    --name=<姓名>        患者姓名（必填）
    --phone=<电话>       联系电话（必填）
    返回: booking_id, status, doctor_name, time, location
    副作用: 将从信用卡扣款并保留号源，确认后不可取消
```

---

## 五、`--help --json`：结构化格式

### 5.1 JSON Schema

```json
{
  "agent": {
    "name": "string",
    "version": "string",
    "description": "string (一句话，≤200字)"
  },
  "usage": [
    { "command": "string", "args": "string", "description": "string" }
  ],
  "commands": [
    {
      "name": "string (kebab-case)",
      "description": "string",
      "params": {
        "<name>": {
          "type": "string | number | boolean | array | object",
          "required": true,
          "description": "string",
          "default": "any"
        }
      },
      "returns": { "type": "string", "description": "string" },
      "side_effects": "string | null",
      "example": "string"
    }
  ],
  "limits": {
    "rate": "string",
    "max_content_length": 0,
    "supported_formats": ["text/plain"],
    "response_time_p50": "string"
  },
  "protocols": ["--help", "--humanservice"],
  "contact": "string"
}
```

### 5.2 与 CLI 文本的关系

`--help --json` 的内容必须是 `--help`（pretty）的**结构化超集**。文本中所有的命令、参数、副作用，在 JSON 中都有对应的结构化字段。

`commands[].name` 对应 `COMMANDS` 段落中的命令名。

---

## 六、辅助协议

### 6.1 `--schema`：参数探查

```
<command> --schema

返回指定命令的 JSON Schema（参数类型、必填/可选、默认值、返回值结构）
```

飞书 CLI 的 `lark-cli schema calendar.events.instance_view` 提供了同样的能力——让 Agent 无需翻文档就能精确知道参数结构。

**示例**：

```
>> search-doctors --schema

{
  "command": "search-doctors",
  "params": {
    "specialty": { "type": "string", "required": false, "description": "专科方向" },
    "date":      { "type": "string", "required": false, "description": "期望日期 YYYY-MM-DD" },
    "level":     { "type": "string", "required": false, "description": "医生级别" }
  },
  "returns": { "type": "array", "items": { "doctor_name": "string", ... } },
  "side_effects": null
}
```

### 6.2 `--dry-run`：预览执行

有副作用的命令，Agent 应先发 `--dry-run` 让用户确认，再正式执行：

```
>> book-appointment --doctor=ZS001 --slot="2026-05-14T09:00" --dry-run

将执行: 预约张主任 2026-05-14 上午 9:00
费用: ¥300
副作用: 将从信用卡扣款，确认后不可取消

确认执行？请回复 --confirm 或修改参数。
```

参照飞书 CLI 的 `--dry-run` 标志——"preview requests with side effects"。

### 6.3 `+` 快捷命令

高频操作用 `+` 前缀，方便人和 AI 记忆：

```
+help         ≡ --help
+human        ≡ --humanservice
+menu         ≡ show-menu
+book         ≡ make-reservation（使用智能默认值）
+slots        ≡ check-availability（当天、默认人数）
```

参照飞书 CLI 的 `+agenda`、`+messages-send` 等快捷命令。

---

## 七、行业示例

### 7.1 餐饮（老张川味火锅）

```
老张川味火锅 v1.0.0 — 成都锦江区地道川味火锅，二十年老店

USAGE
  +menu              查看完整菜单
  +slots [人数]       查看今天可订时段
  +book <日期> <时间> <人数> <姓名> <电话>   快速订位

OPTIONS
  -h, --help [--json|--format]  显示此帮助
  -H, --humanservice             转接老板（团餐/投诉）

COMMANDS
  show-menu — 查看菜单和价格
    [--category=<分类>]   锅底/荤菜/素菜/小吃/酒水，不传返回全部
    返回: 分类菜单 (name, price)

  check-availability — 查看可订时段
    [--date=<日期>]       日期 YYYY-MM-DD，默认今天
    [--party-size=<人数>]  人数，默认 2
    返回: 可用时段列表

  make-reservation — 预订桌位
    --date=<日期>          日期 YYYY-MM-DD（必填）
    --time=<时间>          时间 HH:MM（必填）
    --party-size=<人数>    人数（必填）
    --name=<姓名>          联系人姓名（必填）
    --phone=<电话>         联系电话（必填）
    返回: booking_id, status, restaurant, date, time, hold_until
    副作用: 预订保留 15 分钟，超时自动取消

LIMITS
  30 req/min  ·  响应 <2s  ·  支持 text/plain

EXAMPLES
  $ +slots 4
  $ +book 2026-05-14 18:30 4 王先生 138****1234

更多信息: 成都市锦江区春熙路88号  ·  电话: 028-8888****
```

### 7.2 保险（林芳·保险顾问）

```
林芳·保险顾问 v1.0.0 — 广州独立保险经纪人，RFC+ChRP双证，专注重疾险/医疗险/年金

USAGE
  +about             了解我的资质和擅长领域
  +ask <问题>         咨询保险产品
  +needs [年龄] [性别]  快速需求分析

OPTIONS
  -h, --help [--json|--format]
  -H, --humanservice             转接林芳本人（方案讲解/签单/理赔）

COMMANDS
  about — 查看代理人背景
    返回: name, title, experience_years, certifications, specialties, service_model

  ask-insurance — 产品咨询
    --category=<险种>     重疾险/医疗险/年金/寿险/意外险（必填）
    --question=<问题>     具体问题（必填）
    返回: 产品说明、保障范围、保费区间

  needs-analysis — 需求分析
    --age=<年龄>          年龄（必填）
    --gender=<性别>       male/female（必填）
    [--family-status=<状态>]   单身/已婚/已婚有子女
    [--annual-income=<区间>]   年收入区间
    [--concerns=<担忧>]        最担心的风险
    [--budget=<预算>]          年保费预算区间
    返回: risk_assessment, recommended_categories, estimated_budget, next_steps

  generate-proposal — 生成计划书
    --proposal-type=<类型>     重疾/医疗/年金/综合（必填）
    [--reference-id=<ID>]      关联需求分析结果
    返回: 产品方案和对比表
    副作用: 计划书生成后林芳会人工审核

  schedule-consultation — 预约沟通
    --date=<日期>         日期 YYYY-MM-DD（必填）
    --time=<时间>         时间 HH:MM（必填）
    --mode=<方式>         线上/线下（必填）
    --name=<姓名>         联系人（必填）
    --phone=<电话>        联系电话（必填）
    [--topic=<主题>]       想重点聊什么
    副作用: 确认后林芳会收到通知并预留时间

LIMITS
  10 req/min  ·  响应 <5s

EXAMPLES
  $ +ask 重疾险 "30岁女性买重疾险大概多少保费"
  $ needs-analysis --age=35 --gender=female --family-status=已婚有子女 --annual-income=30-50万

更多信息: 微信 linfang_insure  ·  广州天河区
```

### 7.3 体检（美年大健康·广州天河分院）

```
美年大健康·广州天河分院 v1.0.0 — 基础到高端VIP全系列体检套餐，天河+越秀双分院

USAGE
  +packages [分类]     查看体检套餐
  +checkup <年龄> <性别> 个性化推荐
  +slots [分院]         查看可约时段

OPTIONS
  -h, --help [--json|--format]
  -H, --humanservice             VIP定制/团检报价/异常报告解读

COMMANDS
  list-packages — 查看套餐
    [--category=<分类>]   基础体检/深度体检/心脑血管/肿瘤筛查/高端VIP
    [--gender=<性别>]     male/female
    [--max-price=<价格>]  最高价格筛选
    返回: 套餐列表 (id, name, price, items, duration)

  package-detail — 套餐详情
    --package-id=<ID>     套餐 ID（必填）
    返回: 完整检查项目清单

  recommend-checkup — 个性化推荐
    --age=<年龄>          年龄（必填）
    --gender=<性别>       male/female（必填）
    [--symptoms=<症状>]   自述症状列表
    [--family-history=<史>] 家族史
    [--budget=<预算>]     预算区间
    返回: risk_assessment, recommended_packages, estimated_total, evidence_notes

  check-slots — 查看可约时段
    [--branch=<分院>]     天河/越秀
    [--date-from=<日期>]  起始日期
    [--date-to=<日期>]    截止日期

  book-checkup — 在线预约
    --package-id=<ID>     套餐 ID（必填）
    --branch=<分院>       天河/越秀（必填）
    --date=<日期>         日期 YYYY-MM-DD（必填）
    --time-slot=<时段>    时段（必填）
    --name=<姓名>         姓名（必填）
    --phone=<电话>        电话（必填）
    --gender=<性别>       male/female（必填）
    --age=<年龄>          年龄（必填）
    副作用: 预约成功后名额扣减，改期需提前 1 天

  explain-report — 报告解读
    --booking-id=<ID>     预约号（必填）
    [--abnormal-items=<项>] 关心的异常指标

LIMITS
  20 req/min  ·  响应 <3s  ·  每日体检容量 200 人

EXAMPLES
  $ +checkup 35 female --symptoms=胸闷,头痛
  $ book-checkup --package-id=PH-DEEP-F --branch=天河 --date=2026-05-20 --time-slot=08:00-09:00 --name=李女士 --phone=139**** --gender=female --age=35

更多信息: 广州天河区体育西路XX号  ·  电话: 020-8888****
```

### 7.4 技术服务（天气查询 API）

```
天气助手 v1.0.0 — 全国城市实时天气和7日预报查询

USAGE
  +weather <城市>      查询实时天气
  +forecast <城市>      7日天气预报

OPTIONS
  -h, --help [--json|--format]
  -H, --humanservice             联系开发者

COMMANDS
  query-weather — 实时天气
    --city=<城市>         城市名，如 北京、上海、广州（必填）
    返回: city, temperature, humidity, wind, condition, update_time

  query-forecast — 天气预报
    --city=<城市>         城市名（必填）
    [--days=<天数>]        预报天数 1-7，默认 3
    返回: city, forecast (date, high, low, condition, precipitation)

LIMITS
  60 req/min  ·  响应 <1s  ·  免费额度: 1000次/天

EXAMPLES
  $ +weather 广州
  $ +forecast 成都 --days=7

更多信息: https://weather-api.example.com  ·  邮箱: dev@example.com
```

---

## 八、飞书 CLI 对比与借鉴

飞书官方 CLI（`larksuite/cli`，9,500+ star，Go 语言，npm 分发）是目前最接近 OceanBus 设计理念的参考实现。

| 维度 | 飞书 CLI | OceanBus --help | 借鉴点 |
|------|---------|----------------|--------|
| 目标用户 | 人和 AI Agent 共用 | Agent 之间通信（LLM 消费，人类审阅） | 飞书验证了"一套 CLI 服务两个受众"可行 |
| 命令层次 | 3 层（快捷/API/原始） | 2 层（快捷 +/ 结构化命令） | `+` 快捷前缀直接采纳 |
| 输出格式 | `--format json\|pretty\|table\|ndjson\|csv` | `--format pretty\|json\|table\|ndjson` | 直接采纳，不加 csv |
| Schema 探查 | `lark-cli schema <command>` | `<command> --schema` | 采纳 |
| 副作用控制 | `--dry-run` | `--dry-run` + `side_effects` 声明 | 采纳 |
| 命令发现 | `lark-cli <service> --help` | `--help` 返回该 Agent 全部命令 | 一致 |
| 身份切换 | `--as user\|bot` | Agent 自行管理身份 | 暂不纳入，由 SDK 处理 |

**飞书证明了**："default pretty, optionally JSON" 是可行的——你不需要在人和机器之间做选择，`--format` 一个标志就解决了。

---

## 九、Agent 实现指南

### 9.1 最低要求（任何一个 Agent 都能做到）

你的 Agent **必须**响应 `--help`（和 `-h`），返回至少包含以下内容的文本：

1. 你是谁（一句话描述）
2. 你能做什么（列出命令名 + 一句话说明）

```
我的Agent v1.0.0 — 帮你查快递

USAGE
  query-express --number=<单号>   查询快递状态

COMMANDS
  query-express — 查询快递
    --number=<单号>    快递单号（必填）
    返回: 物流状态、当前位置、预计送达时间
```

### 9.2 推荐增强（让你的 Agent 更好被发现）

- 支持 `--help --json`，黄页排名加分
- 支持 `--dry-run`，有副作用的命令先预览
- 支持 `--schema`，让调用方精确知道参数格式
- 支持 `+` 快捷命令，高频操作一键直达
- 声明 `side_effects`，让 LLM 知道何时需确认

### 9.3 服务端模板自动覆盖

使用 OceanBus 行业模板发布的 Agent，以上能力由 `service-runner.js` 自动生成——Agent 开发者填好 `service.json`，框架自动响应 `--help`、`--help --json`、`--schema`、`--dry-run`。

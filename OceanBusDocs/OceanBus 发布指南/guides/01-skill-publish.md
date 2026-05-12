# OceanBus 发布指南 · skill-publish

> 回到 [发布指南总览](OceanBus%20发布指南.md)

## 🚨 发布铁律

**先 GitHub，后 ClawHub。绝不反过来。**

| 顺序 | 平台 | 原因 |
|------|------|------|
| **第 1 步** | GitHub（独立仓库） | GitHub 是代码源。所有 Skill 代码、README、SKILL.md 的最新版本必须先在 GitHub 上落地。 |
| **第 2 步** | ClawHub | ClawHub 是分发渠道。从 GitHub 同步后的目录发布，确保两端内容一致。 |

**历史教训**：2026-05-08 检查发现 7/9 个 skill 的 GitHub 版本严重落后于 ClawHub（最严重的相差 40 天未更新）。原因就是之前从 monorepo 直接 `clawhub publish`，忘了同步独立 GitHub 仓库。

### 每次发布前检查

```bash
# 1. 确认 GitHub SKILL.md 版本
curl -s "https://raw.githubusercontent.com/ryanbihai/<skill>/main/SKILL.md" | grep version

# 2. 确认 ClawHub 版本
clawhub inspect <skill> | grep Latest

# 3. 两者一致才能发布新版本
```

如果 GitHub 落后 → 先同步 GitHub（clone → 覆盖最新文件 → push），再 `clawhub publish`。

### 1.1 必备文件

一个可发布的 Skill 目录最少需要：

```
skills/your-skill/
├── SKILL.md          # ClawHub 入口 —— YAML frontmatter + Markdown 说明
├── README.md         # GitHub 展示 —— 徽章、安装、用法
├── manifest.yaml     # OpenClaw 专用 —— 调度、配置、输入输出定义（可选但推荐）
└── src/              # 入口代码
```

### 1.2 SKILL.md 格式

```markdown
---
name: your-skill-slug        # 全小写、连字符分隔、全局唯一、不可改
description: 一句话描述       # ClawHub 搜索用，英文
version: 1.0.0               # semver，每次发布递增
metadata:
  openclaw:
    requires:
      bins:
        - node
    emoji: "🌊"               # ClawHub 展示图标
    homepage: https://github.com/ryanbihai/your-skill
    envVars:
      - name: YOUR_ENV_VAR
        required: false
        description: 说明
---

# Skill Display Name

Markdown 正文 —— 安装步骤、使用方法、配置说明。
```

| 要点 | 说明 |
|------|------|
| `name` | 全局唯一 slug，一旦发布不可修改 |
| `description` | 必须英文 —— ClawHub 不支持中文搜索 |
| `version` | 严格 semver，每次发布必须递增 |
| emoji | 单个 Unicode emoji，提升 ClawHub 列表视觉效果 |

#### description 设计诀窍

ClawHub 向量搜索对 description 开头权重更高。实测数据：

```
搜索 "oceanbus" 的匹配得分:
  captain-lobster    0.798  ← "OceanBus-powered zero-player..."  生态名打头
  ocean-chat         0.789  ← "OceanBus SDK Lighthouse..."       生态名+SDK打头
  ocean-agent        0.301  ← "...OceanBus Yellow Pages..."      生态名在中间
```

优化后 `ocean-agent` 从 0.301 提到预期 0.7+。

**高分 description 公式**：

```
{生态名}-powered {一句话功能}。Use when {触发场景}。{关键能力列举}。{零部署/一行安装}。
```

| 要素 | 作用 | 示例 |
|------|------|------|
| 生态名打头 | 向量搜索开头权重高，生态内互相发现 | `OceanBus-powered`, `OceanBus SDK` |
| "Use when" 句式 | 符合 Anthropic spec，提升语义搜索匹配 | `Use when agents need lead generation...` |
| 安装命令 | 搜 `npm install oceanbus` 的人也能发现此 skill | `npm install oceanbus` |
| 能力列举 | 覆盖更多搜索词（Yellow Pages, meeting, reputation...） | 3-5 个核心能力动词短语 |
| 零部署 | 差异化卖点，也是高频搜索词 | `Zero server deployment` |

**反面例子**（低分 description）：
```
AI workbench for insurance agents.  ← 没提生态名，没触发场景，没安装命令
```

**进阶**：向量搜索同时索引 description 和正文。如果正文是全中文而生态关键词是英文，description 优化只能小幅提升（实测 0.301→0.308）。要高搜索得分需要正文中也散布英文生态词。但这是 tradeoff——如果目标用户是中文用户，中文正文优先，description 优化就够用。

### 1.2.2 语言分层策略

| 位置 | 语言 | 理由 |
|------|------|------|
| SKILL.md description | **英文** | ClawHub 搜索不支持中文 |
| SKILL.md 正文 | **用户语言**（中文） | AI 读的指令，中文表达更精准；目标用户是中文代理人 |
| GitHub README.md | **用户语言为主** + 英文徽章/术语 | 用户看中文；生态链接保留英文可发现性 |
| npm package README | **全英文** | npm 是国际社区，英文是标准 |
| npm keywords | **英文** | npm 搜索用 |

> 全中文的问题：ClawHub 搜不到。全英文的问题：中文用户看不懂。分层策略两全。

#### tags 设计诀窍

ClawHub `--tags` 参数（逗号分隔）和 npm `keywords` 字段应互相呼应：

```bash
# ClawHub tags（发布时通过 --tags 指定，默认 "latest"）
--tags "latest,oceanbus,insurance,crm,lead-generation"

# npm package.json（SDK/集成包用）
"keywords": ["oceanbus", "ai-agent", "p2p", "e2ee"]
```

| 原则 | 说明 |
|------|------|
| 生态名必含 | `oceanbus` 标签让生态内项目互相发现 |
| 用具体功能词 | `lead-generation` 好于 `business`；`meeting-negotiation` 好于 `communication` |
| 跨越平台 | npm keywords 和 ClawHub tags 保持一致的生态词 |
| 适量 | 5-8 个高质量标签，不要堆砌 20 个泛词 |

### 1.3 manifest.yaml 格式

参见 `skills/captain-lobster/manifest.yaml` 作为完整参考。关键字段：

```yaml
name: your-skill-slug
title: Display Name
version: 1.0.0
runtime: node
entry: src/index.js
min_openclaw_version: "2026.1.0"
categories: [game, automation]
requires:
  bins: [node]
os: [macos, linux, windows]
schedule:                    # 定时调度（可选）
  - cron: "*/30 * * * *"
    action: react
```

### 1.4 发布到 GitHub

```bash
cd skills/your-skill
git init
git add .
git commit -m "feat: initial release"
git remote add origin git@github.com:ryanbihai/your-skill.git
git push -u origin main
```

**README 装修要点**：
- 顶行放 npm/ClawHub/license 徽章
- "三步跑通" 模式 —— 安装 → 配置 → 运行
- 代码块用 bash/javascript 语言标注

### 1.5 发布到 ClawHub

#### 授权

```bash
# Token 存储在 ~/.clawhub/ 配置中
clawhub login --token <your-clawhub-token>

# 验证
clawhub whoami
# → 账号: ryanbihai
```

> Token 获取：登录 [clawhub.ai](https://clawhub.ai) → Settings → API Tokens。

#### 发布命令

```bash
clawhub publish ./skills/your-skill \
  --slug "your-skill-slug" \
  --name "Display Name" \
  --version "1.0.0" \
  --changelog "首次发布"
```

| 参数 | 必填 | 说明 |
|------|------|------|
| `--slug` | 是 | 与 SKILL.md 中 name 一致 |
| `--name` | **是** | 必带！否则 displayName = 文件夹名，会变成 "Skill" |
| `--version` | 是 | semver，每次递增 |
| `--changelog` | 否 | 更新日志 |

#### 验证

```bash
clawhub inspect your-skill-slug
curl -s "https://clawhub.ai/api/v1/skills?slug=your-slug" | grep displayName
```

#### 更新已有 Skill

```bash
# 1. 修改代码 + 更新 SKILL.md 和 manifest.yaml 中的 version
# 2. 提交到 GitHub
git add . && git commit -m "feat: xxx" && git push

# 3. 重新发布到 ClawHub（版本号必须大于上次）
clawhub publish ./skills/your-skill \
  --slug "your-skill-slug" \
  --name "Display Name" \
  --version "1.0.1" \
  --changelog "添加声誉查询功能"
```

### 1.6 踩坑记录

| 坑 | 解决 |
|----|------|
| `--name` 忘带 → displayName 变成 "Skill" | 每次必带 `--name` |
| slug 想改名 | **不可改**，想好再发布 |
| scanner 误报 `exposed_secret_literal` | 改变量名绕过（如 `tok` 替代 `token`） |
| 中文 description 搜不到 | description 用英文 |
| version 未递增被拒 | 严格 semver，每次 +1 |
| `clawhub publish` 在 Windows 上报 "SKILL.md required" | 改用 `clawhub sync`（v0.9.0 已知 bug） |
| sync 遇到 slug 冲突会中断后续发布 | sync 按文件名字母顺序处理，失败即停；临时移走冲突 skill 或等冲突方改名 |
| 每小时最多发布 5 个新 skill | 超过触发达上限（rate limit），等 1h 再发；**更新**已有 skill 不受限制 |
| sync 的 `--dir` 只在 workspace 内生效 | 发布独立目录的 skill 时，先复制到 `~/.openclaw/workspace/skills/`
| 本地 SKILL.md 版本号滞后于 ClawHub 线上版本 | **发布前必查**：`clawhub inspect <slug>` 确认线上最新版本号，不要盲目相信本地文件 |
| 发布时 `Version already exists` | 说明本地版本号 ≤ 线上。`clawhub inspect` 查线上版本，跳到线上版本 +1 再发 |
| README 只改不增版本号直接发 | ClawHub 和 npm 都要求每次发布版本递增——哪怕只改了 README 一行字也要 bump |

---

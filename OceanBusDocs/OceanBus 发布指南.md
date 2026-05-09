# OceanBus 发布指南

> 三类资产的发布流程、授权方式、规范和装修要点。避免每次重新摸索。

---

## 目录

- [一、Skill 发布（GitHub + ClawHub）](#一skill-发布github--clawhub)
- [二、SDK 发布（npm）](#二sdk-发布npm)
- [三、L1 服务发布（GitHub + 阿里云部署）](#三l1-服务发布github--阿里云部署)
- [四、生态互推与品牌装修](#四生态互推与品牌装修)
- [五、版本治理：三层约束](#五版本治理三层约束)
- [附录：令牌总览](#附录令牌总览)

---

## 一、Skill 发布（GitHub + ClawHub）

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

## 二、SDK 发布（npm）

以 `oceanbus` 为例，`oceanbus-mcp-server` 和 `oceanbus-langchain` 流程一致。

### 2.1 目录结构

```
src/apps/03-OceanBusSDK/
├── package.json          # name, version, main, types, files, bin
├── tsconfig.json
├── src/                  # TypeScript 源码
├── dist/                 # 编译产物（tsc 输出，npm publish 时打进包）
├── bin/                  # CLI 入口
├── integrations/
│   ├── mcp-server/       # 独立 npm 包 oceanbus-mcp-server
│   └── langchain/        # 独立 npm 包 oceanbus-langchain
├── README.md
└── LICENSE
```

### 2.2 发布流程

```bash
# 1. 修改源码
# 2. 更新类型定义（如 src/types/ 有改动）
# 3. TypeScript 编译
cd src/apps/03-OceanBusSDK
npx tsc

# 4. 类型检查（零错误才能继续）
npx tsc --noEmit

# 5. 升版本号
npm version patch --no-git-tag-version   # 0.2.5 → 0.2.6
# 或 npm version minor --no-git-tag-version  # 0.2.5 → 0.3.0

# 6. 发布
npm publish

# 7. 提交版本号变更
cd ../../../..   # 回到仓库根目录
git add src/apps/03-OceanBusSDK/package.json
git commit -m "chore: bump oceanbus to x.y.z"
git push
```

### 2.3 集成包同步发布

主 SDK 发布后，集成包（MCP Server、LangChain）需要：

```bash
# 把最新 dist/ 拷到集成包的 node_modules（类型检查用）
cp -r dist/ integrations/mcp-server/node_modules/oceanbus/
cp -r dist/ integrations/langchain/node_modules/oceanbus/

# 分别编译、升版、发布
cd integrations/mcp-server && npx tsc && npm version patch --no-git-tag-version && npm publish
cd ../langchain && npx tsc && npm version patch --no-git-tag-version && npm publish
```

### 2.4 授权 —— Token 位置

npm token 存储在 `~/.npmrc`（Windows: `C:\Users\<用户名>\.npmrc`）：

```
//registry.npmjs.org/:_authToken=npm_xxxxxxxxxxxx
```

**获取/更新 Token**：
1. 登录 [npmjs.com](https://www.npmjs.com) → Settings → Access Tokens
2. 生成 Classic Token（Automation 类型，免 2FA）
3. 执行 `npm login` 或直接写入 `.npmrc`

**验证**：
```bash
npm whoami
# → ryanbihai
```

### 2.5 装修要点

**package.json 关键字段**：

```json
{
  "name": "oceanbus",
  "version": "0.2.6",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": ["dist/", "bin/", "README.md", "LICENSE"],
  "bin": { "oceanbus": "./bin/oceanbus.js" }
}
```

**README.md**：
- 顶部放 npm 版本徽章 `[![npm](https://img.shields.io/npm/v/oceanbus)](...)`
- "三步跑通" 模式 —— `npm install` → 一行代码 → 一条消息
- 代码块标注语言
- API 参考表（方法、参数、返回值）

---

## 三、L1 服务发布（GitHub + 阿里云部署）

### 3.1 服务器连接

| 项目 | 值 |
|------|-----|
| SSH 连接（内网） | `ssh admin@iZ2zeg67tuxdar3v4oh51bZ` |
| 公网 IP | `39.106.168.88` |
| 公网 SSH | `ssh admin@39.106.168.88`（端口 22 可能超时——阿里云安全组对外只开放业务端口） |
| 项目目录 | `~/oceanbus-yellow-page` |
| PM2 进程 | `oceanbus-yp`（主服务）、`lobster-l1`（龙虾船长游戏服） |
| 服务端口 | `17019` |

> **提示**：公网 IP `39.106.168.88` 的 SSH 22 端口可能被阿里云安全组拦截（连接超时）。从公网访问优先用内网域名 `iZ2zeg67tuxdar3v4oh51bZ`（仅在阿里云网络内可解析），或通过 VPN/跳板机。

### 3.2 首次连接服务器

```bash
# 方式 1：内网域名（推荐，如果能解析）
ssh admin@iZ2zeg67tuxdar3v4oh51bZ

# 方式 2：公网 IP（22 端口可能不通）
ssh admin@39.106.168.88

# 方式 3：通过 server3 跳板
# ~/.ssh/config 中已配 server3（101.200.125.251:10086），如果 ECS 和 server3 在同一 VPC 可能可以跳转
```

### 3.3 GitHub 同步——完整排坑流程

阿里云 ECS 访问 GitHub 有**三重障碍**，按以下顺序排查。

#### 3.3.1 问题诊断矩阵

| 尝试 | 命令 | 结果 | 原因 |
|------|------|------|------|
| HTTPS（默认） | `git pull` | `GnuTLS recv error (-110)` | TLS 握手被墙/干扰 |
| HTTPS with token | `git pull`（remote 带 token） | `Connection timed out`（github.com:443） | GitHub 直连超时 |
| HTTP 降级 | `git config url."http://..."` | `Connection timed out`（github.com:443） | HTTP 同样不通 |
| **SSH** ✅ | `git remote set-url origin git@github.com:...` | 成功 | SSH 隧道通了 |

**结论**：阿里云 ECS 上只能用 SSH 访问 GitHub。

#### 3.3.2 正确流程（一劳永逸）

```bash
# 第一步：生成 SSH 密钥（一次性）
ssh -T git@github.com 2>&1 | head -5
# 如果显示 "Permission denied (publickey)" → SSH 能通！缺密钥而已
# 如果显示 "Connection timed out" → SSH 也不通，检查防火墙

ssh-keygen -t ed25519 -C "admin@aliyun" -N "" -f ~/.ssh/id_ed25519
cat ~/.ssh/id_ed25519.pub
# 复制输出 → 打开 https://github.com/settings/ssh/new → 粘贴 → Add SSH Key

# 第二步：验证 SSH 连通
ssh -T git@github.com
# → "Hi ryanbihai! You've successfully authenticated..."

# 第三步：切换 remote（当前 remote 可能带 token，需要改）
git remote -v
# 如果显示 https://ryanbihai:ghp_xxxx@github.com/... → 需要换成 SSH
git remote set-url origin git@github.com:ryanbihai/oceanbus-yellow-page.git

# 第四步：拉取
git pull
```

> **为什么 HTTPS token 也超时？** 因为问题的根源不是认证，而是阿里云 ECS 到 `github.com:443` 的 TCP 连接被阻断。不管是 HTTPS / HTTP / token 认证，只要走 443 端口都不通。SSH 走 22 端口，不受 GFW 干扰。

#### 3.3.3 紧急情况：如果 SSH 也不通

极少数情况下 22 端口也被封。此时最后一招：在本地 `git bundle` 打包，scp 传到服务器解包。

```bash
# 本地
git bundle create repo.bundle --all
scp repo.bundle admin@39.106.168.88:~/   # 或其他可通的传输方式

# 服务器
git clone repo.bundle repo-temp
cp repo-temp/.git/config ~/oceanbus-yellow-page/.git/
cd ~/oceanbus-yellow-page && git reset --hard HEAD
```

### 3.4 部署流程（标准操作）

#### 3.4.1 首次部署新服务

```bash
# 1. 本地：注册 L0 Agent 身份
cd OceanBusDocs
node register-reputation-agent.js
# → agent_id, api_key, openid

# 2. 本地：填入 config.json → 提交推送
git add src/apps/05-ReputationSvc/
git commit -m "feat: add ReputationSvc"
git push origin main

# 3. SSH 到服务器
ssh admin@iZ2zeg67tuxdar3v4oh51bZ

# 4. 服务器：拉取代码
cd ~/oceanbus-yellow-page
git pull   # 前提：已完成 3.3.2 的 SSH 配置

# 5. 重启 PM2（auto-discovery 自动加载新服务）
pm2 restart oceanbus-yp

# 6. 验证——等 3 秒让服务启动
sleep 3
curl http://127.0.0.1:17019/api/rep/healthcheck
# → {"code":0,"data":{"running":true,"app":"ReputationSvc"}}

curl http://127.0.0.1:17019/api/rep/stats
# → {"code":0,"data":{"total_tags":0,"tags_24h":0,...}}
```

#### 3.4.2 日常更新

```bash
# 本地
git add src/apps/XX-YourSvc/
git commit -m "fix: ..."
git push

# 服务器
ssh admin@iZ2zeg67tuxdar3v4oh51bZ
cd ~/oceanbus-yellow-page
git pull
pm2 restart oceanbus-yp

# 验证
pm2 logs oceanbus-yp --lines 20 --nostream | grep -i "声誉\|启动"
curl http://127.0.0.1:17019/api/rep/healthcheck
```

### 3.5 PM2 管理速查

```bash
pm2 list                    # 查看所有进程——确认进程名是否为 oceanbus-yp
pm2 logs oceanbus-yp --lines 30 --nostream  # 查看日志
pm2 logs oceanbus-yp                       # 实时日志
pm2 restart oceanbus-yp                    # 重启
pm2 stop oceanbus-yp                       # 停止
pm2 monit                   # 实时监控面板
```

> **常见踩坑**：`pm2 restart ai-backend-api` → 进程名不对。**生产环境 PM2 进程名是 `oceanbus-yp` 和 `lobster-l1`，不是 `ai-backend-api`。** 始终先 `pm2 list` 确认进程名，不要猜。

### 3.6 L1 服务目录结构

```
src/apps/05-ReputationSvc/
├── config.json            # 基础配置 + L0 凭证
├── config-local.json      # 本地开发覆盖
├── config-dev.json        # 联调环境覆盖
├── service.js             # 核心业务逻辑
├── agent.js               # L0 Agent 客户端（消息轮询/分发/响应）
├── router.js              # HTTP 管理路由（healthcheck/stats）
└── models/
    ├── index.js
    └── ReputationTag.js   # Mongoose 模型
```

### 3.7 规范要点

| 要点 | 说明 |
|------|------|
| auto-discovery | 只要在 `src/apps/XX-Name/` 下有 `config.json` + `router.js`，自动注册，无需改 server.js |
| 错误码命名空间 | L1 服务使用独立错误码（1001-1013），不跟 L0 冲突 |
| 日志前缀 | 用 `logSvc.js(__filename)` 自动带模块路径 |
| 模型命名 | MongoDB collection 用 `{ServiceName}_{Model}` 格式（如 `ReputationSvc_Tag`） |
| 配置分层 | `config.json` + `config-{env}.json`，环境覆盖 |
| 验签模式 | 请求体带 `public_key` + `sig`，服务端用 `canonicalize` + `verify` |

### 3.8 注册一个新的 L1 服务的完整清单

- [ ] 创建 `src/apps/XX-YourSvc/` 目录
- [ ] `config.json` + 环境变体（`config-local.json`, `config-dev.json`）
- [ ] `models/` —— Mongoose Schema + index.js
- [ ] `service.js` —— 核心业务逻辑
- [ ] `agent.js` —— L0 Agent 轮询/分发
- [ ] `router.js` —— healthcheck + stats
- [ ] 注册 L0 Agent 获取凭证
- [ ] 填入 `config.json`
- [ ] 提交、推送
- [ ] SSH 到服务器 → 确认 SSH Key 已配（一次性）→ `git pull` + `pm2 restart oceanbus-yp`
- [ ] `curl healthcheck` 验证
- [ ] 写测试脚本验证端到端

---

## 四、生态互推与品牌装修

> 每个资产不是孤岛——它们互相导流、互相背书。发布任何一个时，都要检查与其他资产的连接是否到位。

### 4.1 生态关系图

```
                    ┌──────────────────────────┐
                    │  oceanbus (npm SDK)       │
                    │  核心基础设施包             │
                    │  下载量最大，品牌旗舰       │
                    └──────────┬───────────────┘
                               │ 依赖
          ┌────────────────────┼────────────────────┐
          │                    │                    │
          ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐
│ oceanbus-mcp-   │  │ oceanbus-       │  │ Skills              │
│ server          │  │ langchain       │  │ (ocean-chat,        │
│ MCP 工具包装     │  │ LangChain 工具   │  │  guess-ai,          │
│                 │  │                 │  │  captain-lobster,    │
│                 │  │                 │  │  ocean-agent)       │
└─────────────────┘  └─────────────────┘  └─────────────────────┘
          │                    │                    │
          └────────────────────┼────────────────────┘
                               │ 背后的服务
                               ▼
                    ┌──────────────────────────┐
                    │  L1 Services              │
                    │  (YellowPageSvc,          │
                    │   ReputationSvc)          │
                    │  在服务器上默默运行        │
                    └──────────────────────────┘
```

### 4.2 必做：每个 README 的标准徽章行

每个 GitHub 仓库的 README 顶行必须包含以下徽章（有则放，无则跳过）：

```markdown
[![npm](https://img.shields.io/npm/v/oceanbus)](https://www.npmjs.com/package/oceanbus)
[![ClawHub](https://img.shields.io/badge/ClawHub-ocean--chat-blue)](https://clawhub.ai/skills/ocean-chat)
[![downloads](https://img.shields.io/npm/dm/oceanbus)](https://www.npmjs.com/package/oceanbus)
[![license](https://img.shields.io/badge/license-MIT--0-green)](LICENSE)
```

| 徽章 | 适用对象 | 何时添加 |
|------|---------|---------|
| npm version | SDK、集成包 | 发布到 npm 后始终添加 |
| npm downloads | SDK（下载量 > 100/周后） | 有意义的下载量后添加，增强社会证明 |
| ClawHub | Skills | 发布到 ClawHub 后始终添加 |
| license | 所有仓库 | 始终添加 |
| GitHub stars | 所有仓库（stars > 10 后） | 有社区关注后添加 |

### 4.3 必做：生态互链 —— README 中的"相关项目"节

每个 README 末尾必须有"相关项目"节，列出生态内其他项目：

**SDK（oceanbus）README 中**：
```markdown
## 相关项目

| 项目 | 说明 |
|------|------|
| [oceanbus-mcp-server](https://www.npmjs.com/package/oceanbus-mcp-server) | MCP 工具包装——Claude Desktop 直接用 OceanBus |
| [oceanbus-langchain](https://www.npmjs.com/package/oceanbus-langchain) | LangChain 工具——Agent 框架集成 |
| [Ocean Chat](https://clawhub.ai/skills/ocean-chat) | 官方灯塔 Skill——P2P 消息和黄页发现 |
| [Captain Lobster](https://clawhub.ai/skills/captain-lobster) | 零玩家 AI 交易游戏——OceanBus 驱动的自主 Agent |
```

**Skill README 中**：
```markdown
## 相关项目

- 核心 SDK：[oceanbus](https://www.npmjs.com/package/oceanbus) — `npm install oceanbus`
- 更多 Skills：[ClawHub OceanBus 集合](https://clawhub.ai/skills?search=oceanbus)
```

**集成包 README 中**：
```markdown
## 相关项目

- [oceanbus](https://www.npmjs.com/package/oceanbus) — 核心 SDK
- [oceanbus-mcp-server](https://www.npmjs.com/package/oceanbus-mcp-server) — MCP 集成
```

### 4.4 强推：OceanBus 品牌 Logo

生态内所有项目应在 README 顶行标题旁使用统一的 OceanBus 标识：

```markdown
# 🌊 Ocean Chat — Agent 注册即开店
```

| 要素 | 规范 |
|------|------|
| 标题前缀 | `🌊` + 空格 + 项目名 |
| 副标题 | 以 OceanBus 开头，一句话说明与生态的关系 |
| 关键词 | 每个 README 中出现 "OceanBus" ≥ 3 次（SEO） |
| npm keywords | SDK 包和集成包的 `package.json` 中 `keywords` 数组必须包含 `"oceanbus"` |

### 4.5 package.json 中的 keywords

SDK 和集成包的 `package.json` 必须包含交叉关键词：

```json
{
  "keywords": [
    "oceanbus",
    "ai-agent",
    "agent-communication",
    "p2p",
    "e2ee",
    "yellow-pages",
    "reputation"
  ]
}
```

集成包额外加上自己的特征词（`mcp`, `langchain`, `claude-desktop` 等）。这样在 npm 上搜索 "oceanbus" 时所有生态包都会出现。

### 4.6 发布时检查清单

发布任何一个资产前，确认以下互推连接没有断：

- [ ] README 徽章行完整（npm version / ClawHub / downloads / license）
- [ ] README 末尾有"相关项目"节，链接指向生态内其他项目
- [ ] 标题含 `🌊` 前缀
- [ ] `package.json` 的 `keywords` 含 `"oceanbus"`（SDK/集成包）
- [ ] 如果这个项目是另一个项目的"灯塔示例"，被示例的项目 README 中有链接指回来
- [ ] npm 下载量破百后，加上 downloads 徽章
- [ ] ClawHub 发布后，ClawHub 徽章放上 README

### 4.7 实际示例

**ocean-chat 的 README 顶行**（标准做法）：
```markdown
# 🌊 Ocean Chat — Agent 注册即开店

**每一个 AI Agent 都应该被黄页发现、被声誉验证、自动成交。**

[![npm](https://img.shields.io/npm/v/oceanbus)](https://www.npmjs.com/package/oceanbus)
[![ClawHub](https://img.shields.io/badge/ClawHub-ocean--chat-blue)](https://clawhub.ai/skills/ocean-chat)
[![license](https://img.shields.io/badge/license-MIT--0-green)](LICENSE)
```

**captain-lobster 的 README 应包含**（等下载量起来后加上 downloads 徽章）：
```markdown
[![ClawHub](https://img.shields.io/badge/ClawHub-captain--lobster-blue)](https://clawhub.ai/skills/captain-lobster)
[![downloads](https://img.shields.io/npm/dm/oceanbus)](https://www.npmjs.com/package/oceanbus)
```

> 注意：downloads 徽章统计的是 **oceanbus** 的下载量（因为是 `npm install oceanbus`），放在 Skill README 中展示的是"这个生态有多少人在用"——间接为 Skill 背书。

---

## 五、版本治理：三层约束

> Monorepo 是唯一开发源头。独立仓库只是发布镜像。ClawHub 和 npm 要求独立仓库——但代码不改在独立仓库里。

### 5.1 架构总览

```
oceanbus/                                  # 私有 monorepo（团队协作的唯一入口）
├── skills/                                # 所有 Skill 在这里开发和测试
├── ai-backend-template/src/apps/          # 后端服务和 SDK
│   ├── 03-OceanBusSDK/                    # npm SDK 源头
│   ├── 04-YellowPageSvc/
│   ├── 05-ReputationSvc/
│   └── ...
└── scripts/
    ├── bump-sdk.js                        # 统一升级所有 Skill 的 SDK 依赖
    └── publish-skill.sh                   # 一键发布：monorepo → 独立仓库 + ClawHub

独立仓库（发布镜像，不直接改代码）:
  github.com/ryanbihai/ocean-chat          ← 从 skills/ocean-chat/ 推送
  github.com/ryanbihai/captain-lobster     ← 从 skills/captain-lobster/ 推送
  github.com/ryanbihai/oceanbus            ← 从 ai-backend-template/src/apps/03-OceanBusSDK/ 推送
  ...
```

**铁律**：所有代码改动在 monorepo 中完成和测试。独立仓库只通过发布脚本推送——**绝不在独立仓库里直接改代码**。

#### 实操：首次设置 Skill 发布管道

```bash
# 在 monorepo 根目录，为每个 Skill 添加独立仓库 remote（一次性操作）
git remote add skill-ocean-chat https://github.com/ryanbihai/ocean-chat.git
git remote add skill-ocean-agent https://github.com/ryanbihai/ocean-agent.git
git remote add skill-captain-lobster https://github.com/ryanbihai/captain-lobster.git
git remote add skill-guess-ai https://github.com/ryanbihai/guess-ai.git
git remote add skill-china-top-doctor-referral https://github.com/ryanbihai/china-top-doctor-referral.git
git remote add skill-health-checkup-recommender https://github.com/ryanbihai/health-checkup-recommender.git
git remote add skill-ocean-desk https://github.com/ryanbihai/ocean-desk.git

# 或使用脚本一次性设置（推荐）
pwsh scripts/publish-skill.ps1 -SkillSlug ocean-chat -SetupRemote
```

#### 实操：日常发布一个 Skill

```bash
# 一条命令：monorepo → 独立 GitHub 仓库 + ClawHub
pwsh scripts/publish-skill.ps1 ocean-chat 2.9.3 -Changelog "修复 Roster 重复检测逻辑"

# 脚本内部执行：
#   [1/3] git subtree push --prefix=skills/ocean-chat skill-ocean-chat main
#   [2/3] git tag v2.9.3 → push tag to individual repo
#   [3/3] clawhub publish → ClawHub 上线
```

#### 实操：手动发布（不使用脚本）

```bash
# 方式 A: git subtree push（一行命令）
git subtree push --prefix=skills/ocean-chat skill-ocean-chat main

# 方式 B: subtree split + force push（当 subtree push 因历史冲突失败时）
git subtree split --prefix=skills/ocean-chat -b split-ocean-chat
git push skill-ocean-chat split-ocean-chat:main --force
git branch -D split-ocean-chat

# 然后打 tag 和 clawhub publish
git clone https://github.com/ryanbihai/ocean-chat.git /tmp/ocean-chat
cd /tmp/ocean-chat
git tag v2.9.3
git push origin v2.9.3
clawhub publish . --slug ocean-chat --name "Ocean Chat" --version 2.9.3
```

#### 实操：查看当前各 Skill 的 SDK 依赖版本

```bash
node scripts/bump-sdk.js --status
```

#### 实操：SDK 发新版后统一升级所有 Skill

```bash
# 步骤 1: 升级 SDK 自身版本号 + npm publish（见第二章）
# 步骤 2: 在 monorepo 中统一升级所有 Skill 的依赖
node scripts/bump-sdk.js 0.4.10 0.5.0

# 步骤 3: 检查 diff，运行测试
git diff

# 步骤 4: 提交
git add skills/*/package.json
git commit -m "chore: bump oceanbus from 0.4.10 to 0.5.0 across all skills"

# 步骤 5: 逐个发布受影响的 Skill
pwsh scripts/publish-skill.ps1 ocean-chat 2.10.0
pwsh scripts/publish-skill.ps1 ocean-agent 3.1.0
# ... 等等
```

> **注意**：`git subtree push` 会改写目标仓库的历史。这是安全的——因为独立仓库只是发布镜像，没有人在上面直接开发。如果因历史冲突导致 push 失败，使用方式 B 的 force push 即可。

### 5.2 第一层：Monorepo 唯一开发源

#### 为什么需要这条约束

当前已出现版本碎片：

```
ocean-chat          依赖 oceanbus ^0.4.0    ← 已对齐
ocean-agent         依赖 oceanbus ^0.4.0    ← 已对齐
ocean-desk          依赖 oceanbus ^0.4.0    ← 已对齐
china-top-doctor    依赖 oceanbus ^0.4.0    ← 已对齐
captain-lobster     依赖 oceanbus ^0.3.4    ← 落后！
guess-ai            依赖 oceanbus ^0.3.4    ← 落后！
```

根本原因是 SDK 升级后，部分 Skill 在独立仓库里忘了更新依赖。如果 monorepo 是唯一开发源，一个 PR 就能改完所有 Skill——不会遗漏。

#### 操作规则

1. **新 Skill 开发**：在 `skills/<slug>/` 下创建，开发完成后通过发布脚本推到独立仓库 + ClawHub
2. **已有 Skill 修改**：在 monorepo 对应的 `skills/<slug>/` 下修改，测试通过后推到独立仓库
3. **独立仓库**：不接受直接 push，只接受来自 monorepo 的发布脚本推送
4. **团队协作**：所有人 clone monorepo，在 monorepo 里提 PR

### 5.3 第二层：SDK 版本统一 Bump

#### bump-sdk.js

在 monorepo 根目录维护一个脚本，当 SDK 升级时一次性更新所有 Skill 和集成包的依赖声明：

```javascript
// scripts/bump-sdk.js
// 用法: node scripts/bump-sdk.js 0.4.10 0.5.0
//
// 效果：
//   遍历 skills/*/package.json，将所有 "oceanbus" 依赖从 ^0.4.10 更新到 ^0.5.0
//   遍历 integrations/ 下各集成包的 package.json，同步更新
//   检查是否存在版本跳跃（某个 Skill 的依赖落后超过 1 个 minor 版本）
//   输出变更清单，确认后写入

const fs = require('fs');
const path = require('path');

const [,, fromVersion, toVersion] = process.argv;

if (!fromVersion || !toVersion) {
  console.error('用法: node scripts/bump-sdk.js <fromVersion> <toVersion>');
  console.error('示例: node scripts/bump-sdk.js 0.4.10 0.5.0');
  process.exit(1);
}

const skillDirs = fs.readdirSync('skills').filter(d =>
  fs.existsSync(path.join('skills', d, 'package.json'))
);

const changes = [];

for (const dir of skillDirs) {
  const pkgPath = path.join('skills', dir, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

  const deps = pkg.dependencies || {};
  const currentDep = deps['oceanbus'];

  if (!currentDep) continue;

  // 提取当前实际版本号（去掉 ^ ~ 等前缀）
  const currentVersion = currentDep.replace(/^[\^~>=<]+\s*/, '');

  if (currentVersion !== fromVersion) {
    console.warn(`⚠ ${dir}: 当前依赖 ${currentDep}（期望 ${fromVersion}）—— 已落后，将跳过`);
    continue;
  }

  deps['oceanbus'] = `^${toVersion}`;
  changes.push({ dir, from: currentDep, to: `^${toVersion}` });
}

if (changes.length === 0) {
  console.log('没有需要更新的 Skill。');
  process.exit(0);
}

console.log('将进行以下更新：');
for (const c of changes) {
  console.log(`  skills/${c.dir}/package.json: ${c.from} → ${c.to}`);
}

// 也检查集成包
const integrationDirs = [
  'ai-backend-template/src/apps/03-OceanBusSDK/integrations/mcp-server',
  'ai-backend-template/src/apps/03-OceanBusSDK/integrations/langchain',
];

for (const intDir of integrationDirs) {
  const pkgPath = path.join(intDir, 'package.json');
  if (!fs.existsSync(pkgPath)) continue;
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  const deps = pkg.dependencies || {};
  if (deps['oceanbus']) {
    deps['oceanbus'] = `^${toVersion}`;
    changes.push({ dir: intDir, from: deps['oceanbus'], to: `^${toVersion}` });
  }
}

// 确认后写入
console.log('\n按 Enter 确认写入...');
process.stdin.once('data', () => {
  for (const c of changes) {
    const pkgPath = c.dir.startsWith('skills')
      ? path.join(c.dir, 'package.json')
      : path.join(c.dir, 'package.json');
    // 重新读取（因为可能已在上一步修改过）
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    if (pkg.dependencies) {
      pkg.dependencies['oceanbus'] = c.to;
    }
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  }
  console.log(`已更新 ${changes.length} 个包。请检查 diff 后提交。`);
});
```

#### 升级检查清单

SDK 发布新版本后，按以下顺序执行：

- [ ] 运行 `node scripts/bump-sdk.js <旧版本> <新版本>` 更新所有 `package.json`
- [ ] 手动检查每个 Skill 的 CHANGELOG 或 commit diff，确认没有 breaking change 影响
- [ ] 在 monorepo 中运行受影响 Skill 的 e2e 测试
- [ ] `git commit -m "chore: bump oceanbus from X to Y across all skills"`
- [ ] 按 Skill 发布流程逐个推到独立仓库和 ClawHub

### 5.4 第三层：跨 Skill 依赖显式化

#### 问题

当前 `ocean-agent` 和 `ocean-desk` 依赖 `ocean-chat`，但只靠 SKILL.md 中的文字描述——人和 AI 能读懂，但工具链无法校验。用户装了 `ocean-agent` 但没装 `ocean-chat` 时，要到运行时报错才发现。

#### 方案：package.json 中声明 `oceanbus.requiresSkills`

在 `package.json` 中增加一个标准化字段，声明此 Skill 对其他 Skill 的依赖：

```json
// skills/ocean-agent/package.json
{
  "name": "ocean-agent",
  "version": "2.0.0",
  "dependencies": {
    "oceanbus": "^0.4.0"
  },
  "oceanbus": {
    "requiresSkills": {
      "ocean-chat": ">=2.0.0"
    }
  }
}
```

```json
// skills/ocean-desk/package.json
{
  "name": "ocean-desk",
  "dependencies": {
    "oceanbus": "^0.4.0"
  },
  "oceanbus": {
    "requiresSkills": {
      "ocean-chat": ">=2.0.0"
    }
  }
}
```

#### 校验时机

1. **安装时**：Skill 的安装脚本检查 `oceanbus.requiresSkills`，如果依赖的 Skill 版本不满足，提示用户先安装
2. **CI 中**：monorepo 的 CI 检查所有 Skill 的 `requiresSkills` 声明的版本号与实际 monorepo 中对应 Skill 的版本号一致

#### 规范

| 字段 | 说明 |
|------|------|
| `oceanbus.requiresSkills` | 对象，key 为 Skill slug，value 为 semver range |
| 只声明硬依赖 | 必须有才能运行的才写；可选增强不写 |
| 版本 range 保守 | 用 `>=` 而不用 `^`——Skill 接口不如 npm 包稳定 |

---

## 附录：令牌总览

| 服务 | 令牌位置 | 获取方式 |
|------|---------|---------|
| **GitHub** | `~/.ssh/id_ed25519`（SSH Key） | `ssh-keygen` → GitHub Settings → SSH Keys |
| **npm** | `~/.npmrc` | npmjs.com → Access Tokens → Automation |
| **ClawHub** | `~/.clawhub/`（`clawhub login` 写入） | clawhub.ai → Settings → API Tokens |
| **阿里云 ECS** | `~/.ssh/id_ed25519`（同上） | SSH Key，管理员添加 |

**验证各服务**：
```bash
ssh -T git@github.com                          # GitHub
npm whoami                                      # npm
clawhub whoami                                  # ClawHub
ssh admin@iZ2zeg67tuxdar3v4oh51bZ whoami      # 阿里云（内网域名）
# 或 ssh admin@39.106.168.88 whoami            # 阿里云（公网 IP，22 端口可能超时）
```

---

> 最后更新：2026-05-09。新增"五、版本治理：三层约束"——monorepo 唯一开发源 + SDK 统一 Bump + 跨 Skill 依赖显式化。本文档基于 `oceanbus` v0.4.10、`captain-lobster` v1.4.1、`ocean-chat` v2.9.2、`ocean-agent` v3.0.2 的发布经验编写。如果某个步骤不再适用，请更新本文档。

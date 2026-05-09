# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

## 5. OceanBus 发布工作流

当用户要求发布项目资产时，严格按照以下顺序和步骤执行。触发词和对应流程如下。

### 5.1 触发词 → 流程路由

| 用户说的（自然语言） | 执行流程 |
|----------------------|---------|
| "发布 skill X"/"发布 X v1.2.3"/"发布 X 到所有平台" | → 流程 A：Skill 发布 |
| "发布 SDK"/"发布 oceanbus 到 npm"/"发布 oceanbus v0.5.0" | → 流程 B：SDK 发布 |
| "部署 Y 服务"/"上线 Y"/"更新 YellowPageSvc" | → 流程 C：L1 服务部署 |

### 5.2 流程 A：Skill 发布（GitHub 先，ClawHub 后）

**触发词**：`发布 ocean-chat`、`发布 guess-ai v2.2.0`、`发布 skill`、`请发布到所有平台`

**步骤**（不得跳步，不得改变顺序）：

```
1. 确认版本号
   → 检查 skills/<slug>/SKILL.md 中 version 字段是否已更新
   → 如果用户未指定版本号，从 SKILL.md 中读取
   → 运行: clawhub inspect <slug> 确认版本号 > 线上最新版本

2. 确认变更已提交
   → git status — 确认 skills/<slug>/ 下的改动已 commit
   → 如有未提交改动，先提交: git add skills/<slug>/ && git commit -m "release: <slug> v<version>"

3. 推送到 GitHub（第一步，必须先做）
   → git subtree push --prefix=skills/<slug> skill-<slug> main
   → 如失败: git subtree split --prefix=skills/<slug> -b split-<slug>
            git push skill-<slug> split-<slug>:main --force
            git branch -D split-<slug>

4. 打版本 tag
   → git clone https://github.com/ryanbihai/<slug>.git /tmp/<slug>
   → cd /tmp/<slug> && git tag v<version> -m "<slug> v<version>"
   → git push origin v<version>
   → rm -rf /tmp/<slug>

5. 发布到 ClawHub（第二步，GitHub 成功后才能做）
   → git clone https://github.com/ryanbihai/<slug>.git /tmp/<slug>
   → clawhub publish /tmp/<slug> --slug <slug> --name "<DisplayName>" --version <version> --changelog "<变更说明>"
   → rm -rf /tmp/<slug>

6. 验证
   → clawhub inspect <slug>
   → 确认线上版本号 == 刚发布的版本号
```

**Skill slug → DisplayName 映射**（clawhub publish --name 使用）：

| slug | DisplayName | 独立仓库 |
|------|------------|---------|
| ocean-chat | Ocean Chat | ryanbihai/ocean-chat |
| ocean-agent | Ocean Agent | ryanbihai/ocean-agent |
| captain-lobster | Captain Lobster | ryanbihai/captain-lobster |
| guess-ai | Guess AI | ryanbihai/guess-ai |
| china-top-doctor-referral | China Top Doctor Referral | ryanbihai/china-top-doctor-referral |
| health-checkup-recommender | Health Checkup Recommender | ryanbihai/health-checkup-recommender |
| ocean-desk | Ocean Desk | ryanbihai/ocean-desk |

### 5.3 流程 B：SDK 发布（npm）

**触发词**：`发布 SDK`、`发布 oceanbus v0.5.0`、`发布 oceanbus 到 npm`

```
1. 确认版本号
   → 检查 ai-backend-template/src/apps/03-OceanBusSDK/package.json 中 version
   → npm view oceanbus version 确认 > 线上最新版本

2. TypeScript 编译
   → cd ai-backend-template/src/apps/03-OceanBusSDK
   → npx tsc

3. 类型检查（零错误才能继续）
   → npx tsc --noEmit
   → 如有错误，先修复再继续

4. 升版本号（如尚未升级）
   → npm version patch --no-git-tag-version  # 或 minor/major

5. 发布到 npm
   → npm publish
   → 验证: npm view oceanbus version

6. 同步集成包
   → cp -r dist/ integrations/mcp-server/node_modules/oceanbus/
   → cp -r dist/ integrations/langchain/node_modules/oceanbus/
   → cd integrations/mcp-server && npx tsc && npm version patch --no-git-tag-version && npm publish
   → cd ../langchain && npx tsc && npm version patch --no-git-tag-version && npm publish

7. 在 monorepo 中统一升级所有 Skill 的 SDK 依赖
   → cd <monorepo-root>
   → node scripts/bump-sdk.js <旧版本> <新版本>

8. 提交 monorepo
   → git add ai-backend-template/src/apps/03-OceanBusSDK/package.json
   → git add skills/*/package.json
   → git add integrations/
   → git commit -m "chore: bump oceanbus to v<新版本> across all packages"
```

### 5.4 流程 C：L1 服务部署（GitHub + 阿里云）

**触发词**：`部署 YellowPageSvc`、`上线 ReputationSvc`、`更新 L1`

```
1. 确认变更已提交并推送
   → git status && git push origin master

2. SSH 到阿里云 ECS
   → ssh admin@iZ2zeg67tuxdar3v4oh51bZ
   → 如不可达，尝试: ssh admin@39.106.168.88

3. 服务器上拉取代码
   → cd ~/oceanbus-yellow-page
   → git pull

4. 重启 PM2
   → pm2 restart oceanbus-yp
   → （龙虾船长: pm2 restart lobster-l1）

5. 验证
   → sleep 3
   → curl http://127.0.0.1:17019/api/<appid>/healthcheck
```

### 5.5 执行原则

- **不跳步**：GitHub → tag → ClawHub 的顺序不可改变。ClawHub 依赖 GitHub 上的 SKILL.md，颠倒顺序会被拒。
- **先检查后操作**：每次发布前必须确认版本号大于线上。不确定时先 `clawhub inspect` 或 `npm view`。
- **失败即停**：任何一步失败，停下来诊断。不要跳过错误继续下一步。
- **验证收尾**：发布完成后必须运行验证命令，确认线上版本正确。

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

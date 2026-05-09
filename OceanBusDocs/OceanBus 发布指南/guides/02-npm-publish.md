# OceanBus 发布指南 · npm-publish

> 回到 [发布指南总览](OceanBus%20发布指南.md)

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
# 3. TypeScript 编译（每次发布必做——即使之前编译过）
cd src/apps/03-OceanBusSDK
rm -rf dist/                     # 清理旧编译产物，确保 dist 与 src 同步
npx tsc --skipLibCheck           # 如 tsc 报 TS2698，加 --skipLibCheck

# 4. 验证：新增的功能/命令已编译到 dist
grep -r "your_new_feature" dist/ || echo "⚠️  警告：新功能可能未编译"

# 5. 升版本号
npm version patch --no-git-tag-version   # 0.2.5 → 0.2.6
# 或 npm version minor --no-git-tag-version  # 0.2.5 → 0.3.0

# 6. 发布
npm publish

# 7. 安装验证（本地快速测试）
npm install -g oceanbus@latest && oceanbus --help

# 8. 提交版本号变更
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
- **npm README 必须全英文** — npm 是国际社区，英文是标准（ClawHub/GitHub README 用中文为主）
- 必须强调两大优势：(1) 无须自建服务器，开发者本地 Agent 即可与全球 Agent 通信；(2) 商家可在本地搭建 Agent/CLI 服务来服务 C 端客户
- 顶部放 npm 版本徽章 `[![npm](https://img.shields.io/npm/v/oceanbus)](...)`
- "三步跑通" 模式 —— `npm install` → 一行代码 → 一条消息
- 代码块标注语言
- API 参考表（方法、参数、返回值）

### 2.6 踩坑记录

| 坑 | 现象 | 根因 | 解决 |
|----|------|------|------|
| **dist 与 src 不同步** | npm 发布后缺少功能——CLI 有新命令（如 `add`/`contacts`），但用户装到的是旧版本 | `tsc` 在新增命令注册到 `src/cli/index.ts` 之前运行过，`dist/` 里没有新文件的编译产物。`npm publish` 直接打进旧的 dist | **每次发布前必须先 `tsc` 重新编译**。验证：`grep` 确认新功能在 `dist/` 中 |
| **yargs 多词命令冲突** | `oceanbus key new` 被错误路由到 `oceanbus key revoke new`——两个命令共享 `key` 前缀，yargs 把 `new` 当成 `key_revoke` 的 `<key_id>` 参数 | yargs 按注册顺序匹配命令前缀：`key revoke <key_id>` 注册在前，`key new` 在后。用户敲 `oceanbus key new` 时 yargs 匹配到 `key` 开头就进入 revoke | **多词命令用连字符合并为单命令**：`key new` → `key-create`，`key revoke` → `key-revoke`。避免共享前缀 |
| **TypeScript 编译阻断** | `tsc` 报 `error TS2698: Spread types may only be created from object types`，导致 `dist/` 无法更新 | `config/loader.ts` 使用对象 spread 语法，TS 严格模式下不通过 | 临时：`npx tsc --skipLibCheck`。**长期应修复源码**，避免每次依赖 `--skipLibCheck` |

---



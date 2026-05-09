# OceanBus 发布检查清单

> 回到 [发布指南总览](OceanBus%20发布指南.md)

## 统一检查清单

### Skill 发布（🚨 先 GitHub，后 ClawHub）

- [ ] **GitHub 同步**：独立仓库已推送最新代码（README + SKILL.md + scripts + package.json）
- [ ] **版本验证**：GitHub SKILL.md version == 即将发布的 ClawHub version
- [ ] SKILL.md: version 已递增、description 英文打头含生态名
- [ ] manifest.yaml: version 一致
- [ ] GitHub: README 按 [README 模板](guides/07-readme-template.md) 检查结构完整性
- [ ] GitHub: README 含 TOC 目录、SKILL.md 深度阅读链接
- [ ] ClawHub: `clawhub publish --name --version --tags --changelog`
- [ ] ClawHub: tags 含 `oceanbus` + 领域词（`clawhub inspect <slug> | grep Tags` 验证）

### npm 发布
- [ ] package.json: version 已递增、keywords 含 oceanbus
- [ ] tsc --noEmit 零错误
- [ ] npm publish
- [ ] 集成包 (mcp-server/langchain) 同步更新版本

### 平台插件
- [ ] Dify: fork 同步上游 → rebase → 打包 → PR
- [ ] Coze: openapi.yaml 版本更新 → 重新导入 → 调试 → 上架
- [ ] MCP Registry: package.json mcpName + version → npm publish → mcp-publisher publish
- [ ] 百炼: integrations/bailian/README.md 更新

### 仪表盘
- [ ] dashboard.html: 新增 skill/repo 已加入 CLAWHUB_SKILLS / GITHUB_REPOS
- [ ] 平台分布卡片状态同步

### 生态互推
- [ ] 每个 README 的"相关项目"链接未断
- [ ] npm 下载破百后加 downloads 徽章

## 七、行动计划（按优先级）

| 优先级 | 行动 | 来源 | 投入 |
|--------|------|------|------|
| P0 | README 加 Core Concepts 编号列表 | OpenAI Agents | 30 分钟 |
| P0 | README 安装节加 Bun/pnpm 命令 | MCP | 5 分钟 |
| P1 | 写 Quickstart 教程（黄页发现端到端） | MCP | 2 小时 |
| P1 | SDK 内加 POW 计算进度日志 | 已完成 (v0.3.1) | — |
| P2 | SDK 内定义 Transport 接口（HTTP 实现） | MCP | 4 小时 |
| P2 | README 加 "Get Help" 节 | LangGraph | 15 分钟 |
| P3 | 双版本策略（大版本跨越时启用） | MCP | 需要时再建分支 |
| P3 | 可选依赖分组（WebSocket/gRPC transport） | OpenAI Agents | 等 transport 实现时再说 |
| P3 | OceanBus Dashboard（可视化通信拓扑） | LangSmith / OpenAI Tracing | 远期 |

---

## 附录：令牌总览

| 服务 | 令牌位置 | 获取方式 |
|------|---------|---------|
| **GitHub** | `~/.ssh/id_ed25519`（SSH Key） | `ssh-keygen` → GitHub Settings → SSH Keys |
| **npm** | `~/.npmrc` | npmjs.com → Access Tokens → Automation |
| **ClawHub** | `~/.clawhub/`（`clawhub login` 写入） | clawhub.ai → Settings → API Tokens |
| **阿里云 ECS** | `~/.ssh/id_ed25519`（同上） | SSH Key，管理员添加 |
| **MCP Registry** | `mcp-publisher login` 写入 | GitHub OAuth → `mcp-publisher login github` |
| **Coze** | Coze API Token | https://code.coze.cn → API 管理 |
| **Dify** | GitHub PR 提交 | 通过 `ryanbihai/dify-plugins` fork 提交 |

**验证各服务**：
```bash
ssh -T git@github.com                          # GitHub
npm whoami                                      # npm
clawhub whoami                                  # ClawHub
ssh -i "C:\Users\Bihai\Downloads\bihai.pem" root@39.106.168.88 "echo OK"   # 阿里云 ECS（公网 IP + PEM 密钥）
mcp-publisher login github                      # MCP Registry（token 过期时重新登录）
```

---

> 最后更新：2026-05-07。本文档基于 `oceanbus` v0.3.1、`oceanbus-mcp-server` v0.1.6、`captain-lobster` v1.2.25、`ocean-chat` v1.0.11、`ocean-agent` v1.0.5、`guess-ai` v1.0.0 的发布经验，以及 MCP TypeScript SDK、LangGraph、OpenAI Agents SDK 的 README 分析编写。如果某个步骤不再适用，请更新本文档。

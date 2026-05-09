# OceanBus 令牌总览

> 回到 [发布指南总览](OceanBus%20发布指南.md)

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

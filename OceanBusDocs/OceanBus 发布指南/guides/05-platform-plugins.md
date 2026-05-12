# OceanBus 发布指南 · platform-plugins

> 回到 [发布指南总览](OceanBus%20发布指南.md)

## 五、平台插件发布（Dify / Coze / MCP Registry / 百炼）

> 这些平台将 OceanBus 能力封装为插件/工具/Skill，让各平台的 AI Agent 直接使用。

### 5.0 平台总览

| 平台 | 插件类型 | 提交方式 | 工具数 | 授权方式 | 状态 |
|------|---------|---------|--------|---------|------|
| Dify | `.difypkg` Plugin | GitHub PR | 7 | API Key (sk_ 前缀) | PR #2369 审核中 |
| Coze | OpenAPI 插件 | 网页导入 | 4 | API Key (Header Authorization) | 已发布 |
| MCP Registry | `server.json` + npm | `mcp-publisher publish` | 7 | `OCEANBUS_API_KEY` env | 已上线 v0.1.6 |
| 百炼 | MCP Server `npx` 配置 | 文档指南 | 7 | `OCEANBUS_API_KEY` env | 指南就绪 |

### 5.1 Dify 插件发布

#### 目录结构

```
integrations/dify-plugin/
├── manifest.yaml              # 插件清单：版本/作者/运行时
├── main.py                    # Dify 插件入口
├── provider/
│   ├── oceanbus.yaml          # 工具提供者定义 + 认证配置
│   └── oceanbus.py            # 凭证验证逻辑
├── tools/
│   ├── _client.py             # 核心 HTTP 客户端 (L0 + L1)
│   ├── register_agent.py/.yaml
│   ├── get_openid.py/.yaml
│   ├── send_message.py/.yaml
│   ├── sync_messages.py/.yaml
│   ├── block_sender.py/.yaml
│   ├── discover_yellow_pages.py/.yaml
│   └── query_reputation.py/.yaml
├── _assets/icon.svg
├── requirements.txt           # httpx>=0.25.0
├── PRIVACY.md
├── README.md
├── .difyignore
└── .env.example
```

#### 打包

```bash
cd integrations/dify-plugin
dify-plugin plugin package .
# → oceanbus-v0.0.1.difypkg
```

#### 发布流程

```bash
# 1. 准备 GitHub Fork（一次性）
# Fork https://github.com/langgenius/dify-plugins → ryanbihai/dify-plugins

# 2. 同步上游（每次发布前必做）
cd integrations/dify-plugins-submit
git fetch --depth=1 upstream main
git rebase upstream/main
# → 确保 fork 包含上游所有文件

# 3. 放入打包文件
mkdir -p oceanbus/oceanbus
cp ../integrations/dify-plugin/oceanbus-v0.0.1.difypkg oceanbus/oceanbus/

# 4. 提交 + 推送
git add oceanbus/oceanbus/
git commit -m "Add OceanBus plugin v0.0.2"
git push origin add-oceanbus-plugin --force

# 5. 创建 Pull Request
# 从 ryanbihai/dify-plugins:add-oceanbus-plugin → langgenius/dify-plugins:main
```

#### 踩坑记录

| 坑 | 解决 |
|----|------|
| PR 显示删除其他插件文件 | fork 必须先 `git fetch upstream main && git rebase upstream/main`，确保基于上游最新代码 |
| 分支名不对 | PR 源分支是 `add-oceanbus-plugin`，不是 `master` |
| CI workflow 不跑 | 首次贡献者需 maintainer 手动批准 workflow |
| PR 状态 BLOCKED | 正常——需要至少 1 位 maintainer 点 Approve |
| CI `dify_plugin version` 失败 | `requirements.txt` 必须包含 `dify_plugin>=0.5.0`；manifest 版本号递增 |
| CI 修复后无法自动重跑 | 在 PR 中 @ review 者请求手动触发 workflow |

#### 版本更新

```bash
# 1. 更新 manifest.yaml 中 version
# 2. 更新代码
# 3. 重新打包
dify-plugin plugin package .
# 4. 按上述流程同步上游 + 推送 + 更新 PR
```

### 5.2 Coze 插件发布

#### 核心文件

```
integrations/coze/
├── plugin.json        # Coze 插件清单 (schema_version, auth, api.type)
└── openapi.yaml       # OpenAPI 3.0.1 规范 (Coze 要求 3.0.1，不是 3.0.0)
```

#### plugin.json 规范

```json
{
  "schema_version": "v1",
  "name_for_model": "oceanbus",
  "name_for_human": "OceanBus",
  "description_for_model": "OceanBus is AI Agent communication...",
  "description_for_human": "OceanBus — AI Agent 通信与信任基础设施...",
  "auth": {
    "type": "service_http",
    "sub_type": "token/api_key",
    "payload": "{\"location\":\"header\",\"key\":\"Authorization\",\"service_token\":\"\"}"
  },
  "api": {
    "type": "openapi"
  }
}
```

#### openapi.yaml 规范

| 要求 | 说明 |
|------|------|
| OpenAPI 版本 | `3.0.1`（不是 `3.0.0`，Coze 严格要求） |
| 服务器数量 | 恰好 **1** 个 server URL |
| 认证 | 使用 `x-auth-mode` 标记每个操作的认证要求 |
| 扩展字段 | `x-functionName` 映射到 Coze 工具名 |

#### 发布流程

```
1. 登录 https://www.coze.cn → 扣子编程 → 个人空间
2. 创建智能体 → 进入编辑器 → 工具 → 添加插件 → 自定义插件
3. 导入 openapi.yaml（Coze 自动解析 7 个工具）
4. 配置认证：Service → API Key → Header → Authorization
5. 删除无法调试的工具（registerAgent 需要 POW、L1Proxy 需要 HTTPS 路由）
6. 逐一调试通过
7. 上架插件
```

#### 踩坑记录

| 坑 | 解决 |
|----|------|
| 找不到插件创建入口 | 入口在**智能体编辑器** → 工具面板 → 添加插件，不在扣子编程项目列表 |
| `www.coze.cn` vs `code.coze.cn` | 插件在 `www.coze.cn` 的智能体编辑器里创建，不是 `code.coze.cn` API 文档站 |
| 调试全部失败 | 先填入真实 API Key（非占位符 `sk_xxx`）才能调试 |
| L1Proxy 端 404 | Coze 从公网调用，L1Proxy 需要 Nginx 代理或仅保留 L0 端 |
| registerAgent 401 POW | 注册需要 POW 计算，Coze 环境无法完成——移除该工具 |
| 只支持 HTTPS URL | 不能填 `http://` 或带端口号的 URL |
| 插件上架时下拉框空白 | 先在智能体编辑器中创建好插件，再回插件商店上架 |

#### 版本更新

```bash
# 1. 修改 openapi.yaml
# 2. 在 Coze 插件详情页编辑 → 重新导入 openapi.yaml
# 3. 重新调试通过
# 4. 重新发布
```

### 5.3 MCP Registry 发布

#### 前置条件

```bash
# npm 包必须已发布且包含 mcpName 字段
# package.json:
{
  "name": "oceanbus-mcp-server",
  "mcpName": "io.github.ryanbihai/oceanbus-mcp-server",
  "version": "0.1.6"
}
```

#### server.json 规范

```json
{
  "$schema": "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
  "name": "io.github.ryanbihai/oceanbus-mcp-server",
  "description": "Register, discover, message... (max 100 chars)",
  "repository": {
    "url": "https://github.com/ryanbihai/oceanbus-yellow-page",
    "source": "github",
    "subfolder": "ai-backend-template/src/apps/03-OceanBusSDK/integrations/mcp-server"
  },
  "version": "0.1.6",
  "packages": [
    {
      "registryType": "npm",
      "identifier": "oceanbus-mcp-server",
      "version": "0.1.6",
      "transport": { "type": "stdio" },
      "environmentVariables": [
        {
          "name": "OCEANBUS_API_KEY",
          "description": "OceanBus API Key...",
          "isRequired": true,
          "format": "string",
          "isSecret": true
        }
      ]
    }
  ]
}
```

#### 发布命令

```bash
# 1. 下载 mcp-publisher（一次性）
# Windows:
cd integrations/mcp-registry
$arch = if ([System.Runtime.InteropServices.RuntimeInformation]::ProcessArchitecture -eq "Arm64") { "arm64" } else { "amd64" }
Invoke-WebRequest -Uri "https://github.com/modelcontextprotocol/registry/releases/latest/download/mcp-publisher_windows_$arch.tar.gz" -OutFile "mcp-publisher.tar.gz"
tar xf mcp-publisher.tar.gz mcp-publisher.exe

# 2. 生成 server.json（首次）
cd integrations/mcp-server
mcp-publisher init

# 3. 每次发布：
# a) 更新 package.json 版本号 + mcpName
# b) npm run build && npm publish
# c) 更新 server.json 版本号
# d) 登录（token 过期时重新执行）
mcp-publisher login github
# → 打开 https://github.com/login/device 输入验证码
# e) 发布
mcp-publisher publish
```

#### 踩坑记录

| 坑 | 解决 |
|----|------|
| description 超 100 字符 | 缩短到 ≤ 100 字符 |
| JWT token expired | 重新 `mcp-publisher login github` |
| GitHub 连接超时 | 国内网络问题——在阿里云 ECS 上运行更快 |
| `mcpName` 缺失 | npm 包 `package.json` 必须含 `mcpName` 字段 |
| 命名空间不匹配 | GitHub Auth 下 server name 必须 `io.github.<username>/` 开头 |

#### 自动效应

提交到 MCP Registry 后，以下目录**自动同步**（无需额外操作）：
- **PulseMCP** (pulsemcp.com) — 每周从官方 Registry 同步
- **Smithery** (smithery.ai) — 自动发现 npm + GitHub
- **mcp.so** — 自动发现

### 5.4 百炼接入

百炼**无公开插件市场**，推广方式是通过文档告诉用户如何配置 MCP Server。

#### 发布方式

```
1. 维护 integrations/bailian/README.md（接入指南）
2. 用户复制 JSON 配置 → 百炼控制台 → 组件广场 → MCP 服务 → 自定义 → 粘贴
3. 配置模板：
{
  "mcpServers": {
    "oceanbus": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "oceanbus-mcp-server"],
      "env": { "OCEANBUS_API_KEY": "sk_xxx" }
    }
  }
}
```

#### 版本更新

- 更新 `integrations/bailian/README.md` 中的配置示例
- 更新版本号

### 5.5 平台插件发布的统一检查清单

发布任何一个平台的插件前，确认：

- [ ] 插件目录在 `integrations/<platform>/` 下
- [ ] 版本号已递增
- [ ] API Key / 认证配置为"用户自行提供"模式（不硬编码密钥）
- [ ] README 或 PRIVACY.md 更新（如适用）
- [ ] 更新本文档对应子节的踩坑记录（如发现新坑）
- [ ] 仪表盘 `dashboard.html` 的平台分布卡片已同步（如新增平台）

---

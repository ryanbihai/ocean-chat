# OceanBus 发布指南 · l1-deploy

> 回到 [发布指南总览](OceanBus%20发布指南.md)

## 三、L1 服务发布（GitHub + 阿里云部署）

### 3.1 服务器连接

| 项目 | 值 |
|------|-----|
| 公网 IP | `39.106.168.88` |
| SSH 端口 | `22`（已验证可通） |
| SSH 用户 | `root` |
| SSH 密钥 | `C:\Users\Bihai\Downloads\bihai.pem` |
| Windows 命令 | `ssh -i "C:\Users\Bihai\Downloads\bihai.pem" root@39.106.168.88` |
| SSH 连接（内网） | `ssh admin@iZ2zeg67tuxdar3v4oh51bZ`（仅阿里云 VPC 内可解析） |
| 项目目录 | `/home/admin/oceanbus-yellow-page` |
| PM2 进程 | `oceanbus-yp`（主服务）、`lobster-l1`（龙虾船长游戏服） |
| 服务端口 | `17019` |
| PM2 用户 | `admin`（PM2 在 admin 用户下运行，用 `su - admin -c '...'` 执行） |

> **密钥位置**：`C:\Users\Bihai\Downloads\bihai.pem`。这是阿里云 ECS 的 root 登录密钥，请勿删除或移动。

### 3.2 连接服务器

```bash
# 方式 1：公网 IP + PEM 密钥（已验证可用 ✅）
ssh -i "C:\Users\Bihai\Downloads\bihai.pem" root@39.106.168.88

# 方式 2：内网域名（仅阿里云 VPC 内可解析）
ssh admin@iZ2zeg67tuxdar3v4oh51bZ

# 方式 3：通过 server3 跳板（当前不可用 — server3 禁止端口转发）
# ~/.ssh/config 中已配 server3（101.200.125.251:10086）
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

# 3. SSH 到服务器（pem 密钥 + root 用户）
ssh -i "C:\Users\Bihai\Downloads\bihai.pem" root@39.106.168.88

# 4. 服务器：拉取代码（PM2 在 admin 用户下运行）
su - admin -c 'cd ~/oceanbus-yellow-page && git pull origin main'

# 5. 重启 PM2（auto-discovery 自动加载新服务）
su - admin -c 'pm2 restart oceanbus-yp'

# 6. 验证——等 3 秒让服务启动
sleep 3
su - admin -c 'pm2 list'
curl http://127.0.0.1:17019/api/rep/healthcheck
# → {"code":0,"data":{"running":true,"app":"ReputationSvc"}}
```

#### 3.4.2 日常更新

```bash
# 本地
git add src/apps/XX-YourSvc/
git commit -m "fix: ..."
git push

# 服务器
ssh -i "C:\Users\Bihai\Downloads\bihai.pem" root@39.106.168.88
su - admin -c 'cd ~/oceanbus-yellow-page && git pull origin main'
su - admin -c 'pm2 restart oceanbus-yp'

# 验证
su - admin -c 'pm2 logs oceanbus-yp --lines 20 --nostream' | grep -i "声誉\|启动"
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
- [ ] SSH 到服务器（`ssh -i "C:\Users\Bihai\Downloads\bihai.pem" root@39.106.168.88`）→ `su - admin -c 'cd ~/oceanbus-yellow-page && git pull origin main'` → `su - admin -c 'pm2 restart oceanbus-yp'`
- [ ] `curl healthcheck` 验证
- [ ] 写测试脚本验证端到端

---

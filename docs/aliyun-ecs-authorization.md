# 阿里云 ECS 授权指南 — 给同事开通服务器访问权限

> 两种方案：方案一小团队够用，方案二更规范。推荐先从方案一开始。

---

## 服务器信息速查

| 项目 | 值 |
|------|-----|
| 内网 SSH | `ssh admin@iZ2zeg67tuxdar3v4oh51bZ` |
| 公网 IP | `39.106.168.88` |
| 公网 SSH | `ssh admin@39.106.168.88` |
| 项目目录 | `~/oceanbus-yellow-page` |
| PM2 进程 | `oceanbus-yp`、`lobster-l1` |

---

## 方案一：共享 admin 账号 + 各自 SSH 密钥

多人共用 `admin` 用户登录，每人用自己独立生成的 SSH 密钥对。权限管理简单，适合 2-4 人小团队。

### 1.1 同事：生成 SSH 密钥对

在自己的电脑上执行以下命令。

**Windows (PowerShell)：**

```powershell
ssh-keygen -t ed25519 -C "zhangsan@company" -N '""' -f "$env:USERPROFILE\.ssh\id_ed25519_aliyun"
```

**Mac / Linux：**

```bash
ssh-keygen -t ed25519 -C "zhangsan@company" -N "" -f ~/.ssh/id_ed25519_aliyun
```

参数说明：

| 参数 | 含义 |
|------|------|
| `-t ed25519` | 密钥类型 Ed25519，比 RSA 更快更安全 |
| `-C "zhangsan@company"` | 注释，用于标识这是谁的密钥 |
| `-N ""` | 密钥口令（空 = 登录时不需要再输密码） |
| `-f ~/.ssh/id_ed25519_aliyun` | 指定文件名，避免和 GitHub 默认的 `id_ed25519` 冲突 |

执行后生成两个文件：

| 文件 | 位置 | 性质 |
|------|------|------|
| `id_ed25519_aliyun` | `~/.ssh/` | **私钥**——妥善保管，绝对不能发给任何人 |
| `id_ed25519_aliyun.pub` | `~/.ssh/` | **公钥**——发给管理员，可以放心传播 |

### 1.2 同事：获取公钥内容

把输出的那一整行发给管理员。

**Windows：**

```powershell
Get-Content "$env:USERPROFILE\.ssh\id_ed25519_aliyun.pub"
```

**Mac / Linux：**

```bash
cat ~/.ssh/id_ed25519_aliyun.pub
```

输出示例：

```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIGx... zhangsan@company
```

### 1.3 管理员：添加公钥到服务器

SSH 进入服务器：

```bash
ssh admin@iZ2zeg67tuxdar3v4oh51bZ
```

将同事的公钥追加到 `authorized_keys`：

```bash
echo "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIGx... zhangsan@company" >> ~/.ssh/authorized_keys
```

> 务必用 `>>`（追加），不要用 `>`（会覆盖掉已有的密钥）。

验证写入成功：

```bash
tail -2 ~/.ssh/authorized_keys
```

### 1.4 同事：配置 SSH 快捷别名（推荐）

编辑 `~/.ssh/config` 文件（Windows：`C:\Users\用户名\.ssh\config`），添加：

```
Host aliyun-oceanbus
    HostName 39.106.168.88
    User admin
    IdentityFile ~/.ssh/id_ed25519_aliyun
```

之后直接 `ssh aliyun-oceanbus` 即可连接，无需每次指定 IP、用户名和密钥。

### 1.5 同事：验证连接

```bash
# 如果配了快捷别名
ssh aliyun-oceanbus

# 或完整命令
ssh -i ~/.ssh/id_ed25519_aliyun admin@39.106.168.88
```

成功后确认：

```bash
whoami         # → admin
hostname       # → iZ2zeg67tuxdar3v4oh51bZ
```

---

## 方案二：创建独立用户（推荐 3 人以上团队）

为每个同事创建独立系统用户，操作可追溯、可单独设权限、可随时移除。

### 2.1 管理员：创建用户

```bash
ssh admin@iZ2zeg67tuxdar3v4oh51bZ

# 创建用户（替换 zhangsan 为同事用户名）
sudo useradd -m -s /bin/bash zhangsan

# 创建 .ssh 目录
sudo mkdir -p /home/zhangsan/.ssh

# 将同事的公钥写入
echo "ssh-ed25519 AAAA..." | sudo tee /home/zhangsan/.ssh/authorized_keys

# 修正权限
sudo chown -R zhangsan:zhangsan /home/zhangsan/.ssh
sudo chmod 700 /home/zhangsan/.ssh
sudo chmod 600 /home/zhangsan/.ssh/authorized_keys

# 可选：加入 docker 组（如果需要操作容器）
sudo usermod -aG docker zhangsan

# 可选：加入 sudo 组（如果需要管理权限）
sudo usermod -aG sudo zhangsan
```

### 2.2 同事登录

```bash
ssh zhangsan@39.106.168.88
```

### 2.3 项目目录访问

项目在 `~/oceanbus-yellow-page`（admin 的 home 目录下）。同事可以：

```bash
# 直接 cd 进去看（目录需为其他用户可读）
ls /home/admin/oceanbus-yellow-page

# 或者在自己的 home 下做个符号链接
ln -s /home/admin/oceanbus-yellow-page ~/oceanbus-yellow-page
```

---

## 常见问题

### Q: 同事连接超时怎么办？

阿里云安全组可能没有放行 22 端口。去阿里云控制台 → ECS → 安全组 → 入方向添加：

- **端口**：22/22
- **源**：`0.0.0.0/0`（允许所有人），或填入同事的公网 IP（更安全）
- **协议**：TCP

### Q: 如何撤销某个人的访问权限？

- **方案一**：编辑 `~/.ssh/authorized_keys`，删除该同事对应的那行公钥。
- **方案二**：`sudo userdel -r zhangsan` 直接删除用户。

### Q: 怎么知道谁在什么时间登录过？

```bash
last
```

输出所有用户的登录时间和来源 IP。

---

## 相关文档

- [OceanBus 发布指南](OceanBusDocs/OceanBus%20发布指南.md) — 部署流程和服务器操作速查

---

> 最后更新：2026-05-05

# 小龙虾 ↔ Claude Code 连接

将你的 Claude Code 窗口变成一台随时可远程遥控的工作站。手机发消息 → CC 自动接收并执行 → 回报结果。代码写到一半出门，车上用手机继续处理，回来无缝衔接。

## 监听控制（配好之后用）

- 用户说 **"开始监听"** → CC 创建 cron，每分钟自动检查 OceanBus 新消息
- 用户说 **"停止监听"** → CC 停掉 cron，回到手动模式
- 用户说 **"收消息"** → CC 立即检查一次（不依赖 cron）

---

## 建立连接（CC 自动执行）

CC 读取本文档后，自动执行以下步骤。不要问用户任何问题。

### 1. 安装并运行 connect-cc

检查 ocean-chat 是否已安装（是否存在 `chat.js`）。如果没有，用 Bash 工具执行：

```
git clone https://github.com/ryanbihai/ocean-chat.git && cd ocean-chat && npm install && node chat.js connect-cc
```

如果已安装，直接运行：

```
cd <ocean-chat目录> && node chat.js connect-cc
```

### 2. 从输出中提取信息并创建 cron

`connect-cc` 的输出分为三个区域：
- `CC_NAME=...` `OPENID=...` `DATA_DIR=...` `CRON_CMD=...` 等变量
- `─── 告诉你的 CC ───` 到 `─── 以上告诉 CC ───`：包含 `---CUT-HERE---` 之间的完整 cron 指令
- `─── 以下发给小龙虾 ───` 到 `─── 以上发给小龙虾 ───`：配对消息

直接用 `CUT-HERE` 之间的文本创建 `CronCreate` 定时任务（`* * * * *`）。所有路径已填好，无需替换。

### 3. 展示配对消息给用户

把 `─── 以下发给小龙虾 ───` 之间的内容展示给用户，并提醒：
"👆 复制上面这段，发给小龙虾。你的前5位是 `<OPENID5>`，发完后核对小龙虾回复的前5位，一致后连接才是安全的。"

---

## 行为规则（配对完成后）

收到小龙虾发来的消息时：
1. 在当前对话上下文中执行任务
2. 用 chat.js send 回报结果

## 通讯录维护

小龙虾可能切换 OpenID。收到新地址时自动更新 Roster。

## 故障排除

| 问题 | 解决 |
|------|------|
| 小龙虾收不到 | 检查通讯录中 CC 的 OpenID 是否正确。`node chat.js --data-dir <DATA_DIR> openid` |
| from_openid 漂移 | 升级 SDK ≥ 0.6.3 |

# 小龙虾 ↔ Claude Code 连接

将你的 Claude Code 窗口变成一台随时可远程遥控的工作站。手机发消息 → CC 自动接收并执行 → 回报结果。代码写到一半出门，车上用手机继续处理，回来无缝衔接。

## 监听控制（配好之后用）

- 用户说 **"开始监听"** → CC 创建 Monitor 持久化监听，有消息自动推送
- 用户说 **"停止监听"** → CC 停掉 Monitor，回到手动模式
- 用户说 **"收消息"** → CC 立即检查一次（不依赖 Monitor）

---

## 建立连接（CC 自动执行）

CC 读取本文档后，自动执行以下步骤。不要问用户任何问题。

### 1. 安装/更新 ocean-chat 和 SDK

用 Bash 工具执行以下一条命令（已装/未装通用，自动处理）：

```bash
if cd ocean-chat 2>/dev/null; then git pull; else git clone https://github.com/ryanbihai/ocean-chat.git && cd ocean-chat; fi && npm install && npm install oceanbus@latest && node chat.js connect-cc
```

> 这条命令自动做了：目录存在 → `git pull` 更新；不存在 → `git clone`。`npm install oceanbus@latest` 确保 SDK 也是最新版。

### 2. 从输出中提取信息并创建 Monitor

`connect-cc` 的输出分为三个区域：
- `CC_NAME=...` `OPENID=...` `DATA_DIR=...` `MONITOR_CMD=...` 等变量
- `─── 告诉你的 CC ───` 到 `─── 以上告诉 CC ───`：包含 `---CUT-HERE---` 之间的完整 Monitor 指令
- `═══ 复制下面这段，在微信上发给小龙虾 ═══` 到 `═══ 以上发给小龙虾 ═══`：配对消息（→ 跳步骤 3）

直接用 `CUT-HERE` 之间的文本创建 `Monitor` 持久化任务，无需解释或确认，直接创建。

创建完 Monitor 后，立即执行步骤 3——不要跳过去处理别的事情。

### 3. 展示配对消息给用户（⚠️ 人肉步骤，CC 绝对不能代劳）

把输出中 `═══ 复制下面这段，在微信上发给小龙虾 ═══` 和 `═══ 以上发给小龙虾 ═══` 之间的内容，**用代码块原样展示**给用户。

**禁止用自己的话转述、总结、或只提一下"那段消息"。** 用户必须看到完整文本才能复制粘贴。

**⚠️ 严禁用 `node chat.js send` 发送这条消息。** 此时小龙虾的通讯录里还没有这个 CC 的 OpenID，OceanBus 消息会发到死地址。用户必须在微信上手动复制粘贴发给小龙虾。

展示后对用户说：
"👆 复制上面代码块里的内容，**在微信上**发给小龙虾。前5位是 `<OPENID5>`。发完后小龙虾会回复他的前5位，核对一致后连接才安全。**不要让我用 OceanBus 发——必须你手动发。**"

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

# 小龙虾 ↔ Claude Code 连接

将你的 Claude Code 窗口变成一台随时可远程遥控的工作站。手机发消息 → CC 自动接收并执行 → 回报结果。代码写到一半出门，车上用手机继续处理，回来无缝衔接。

## 监听控制（配好之后用）

- 用户说 **"开始监听"** → CC 创建 cron，每分钟自动检查 OceanBus 新消息
- 用户说 **"停止监听"** → CC 停掉 cron，回到手动模式
- 用户说 **"收消息"** → CC 立即检查一次（不依赖 cron）

---

## 建立连接

让用户运行以下命令，把完整输出贴回对话：

```
git clone https://github.com/ryanbihai/ocean-chat.git && cd ocean-chat && npm install && node chat.js connect-cc
```

> 如果 ocean-chat 已经装过，可以跳过 clone 和 install，直接跑 `node chat.js connect-cc`。命令是幂等的——已有身份不会重新注册。

拿到输出后，你（CC）只需要做：

### 1. 创建 cron

输出中有一段 `─── 告诉你的 CC ───`，里面包含了完整的 cron 创建指令（`---CUT-HERE---` 之间）。直接按那段创建定时任务即可——所有路径、命令已经填好，不需要替换任何东西。

### 2. 展示配对消息

把 `─── 以下发给小龙虾 ───` 之间的内容展示给用户，让其复制发给小龙虾。提醒核对前5位。

当小龙虾回复他的前5位后，与之前记录的小龙虾前5位比对。不一致则立刻停止并告知用户。

---

## 行为规则（配对完成后）

收到小龙虾发来的消息时：

1. **执行任务**：解析消息内容，在当前对话上下文中完成操作
2. **汇报结果**：执行 `node chat.js --data-dir <DATA_DIR> send 小龙虾 --from CC-oceanbus "结果"`
3. 把关键发现、修改的文件、执行结果写清楚，就像用户坐在旁边看屏幕

## 通讯录维护

小龙虾可能切换 OpenID（OceanBus 的隐私轮换）。收到新地址时自动更新 Roster 中小龙虾的默认发信地址。

---

## 身份安全

`.oceanbus-cc/` 目录（在项目根目录）是 OpenID 唯一凭证。删除 = 身份永久作废。

- `connect-cc` 自动把它放在项目根目录，不受 ocean-chat 升级影响
- 换电脑时复制 `.oceanbus-cc/` 即可迁移身份

## 故障排除

| 问题 | 解决 |
|------|------|
| 小龙虾收不到消息 | 检查小龙虾通讯录中 CC-oceanbus 的 OpenID 是否为当前值。`node chat.js --data-dir <DATA_DIR> openid` |
| CC 收到的 from_openid 不对 | 升级 SDK 到 ≥ 0.6.3，确保 `createOceanBus` 传入了 `identity.openid` |
| cron 路径错误 | 路径必须用正斜杠（`C:/...`），不能用反斜杠 |

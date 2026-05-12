# 小龙虾 ↔ Claude Code 连接

将你的 Claude Code 窗口变成一台随时可远程遥控的工作站。手机发消息 → CC 自动接收并执行 → 回报结果。代码写到一半出门，车上用手机继续处理，回来无缝衔接。

传播者微信 → A 消息 → 朋友 → 小龙虾
                              ↓
                       install + connect-cc + pair-me
                              ↓
                        吐出 B 消息（OpenID已填）
                              ↓
                      朋友把B消息粘贴给 cc
                              ↓
                       cc 执行：装/加人/监听/给小龙虾发消息
                              ↓
                      小龙虾 ↔ cc 已连通



## 如果你是被邀请方（朋友把 A 消息转发给你）

当有人在微信上发给你下面这样的 A 消息时，按本节操作。

### A 消息长这样

```
# 本条消息可以帮助你用小龙虾连接控制你的 Claude Code
# 请把本条消息原封不动拷贝粘贴给你的小龙虾（不是 Claude Code！！！）
# 然后根据小龙虾的指引，完成后续动作

if cd ocean-chat 2>/dev/null; then git pull; else git clone https://github.com/ryanbihai/ocean-chat.git && cd ocean-chat; fi && npm install && npm install oceanbus@latest && node chat.js pair-me <小龙虾的完整OpenID>
```

> ⚠️ `<小龙虾的完整OpenID>` 由传播者填入——你的 Claude Code 通讯录里有小龙虾，用 `node chat.js openid` 查不到（那是你自己的），用 `node chat.js contacts` 找到小龙虾那一行里 `ob_xxx...` 就是。

把A消息发给小龙虾，小龙虾会给你B消息

### B消息长这样：

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 请将本条消息粘贴给你的 Claude Code
# 逐条执行以下命令，遇到错误就停下报告。

1、安装/升级 ocean-chat 和 SDK，并注册身份：
（这是一整条命令，不要拆开。）

if cd ocean-chat 2>/dev/null; then git pull; else git clone https://github.com/ryanbihai/ocean-chat.git && cd ocean-chat; fi && npm install && npm install oceanbus@latest && node chat.js setup

2、添加小龙虾为联系人：

node chat.js add 小龙虾 <小龙虾的OpenID>

3、启动监听：

node chat.js listen
没有消息时完全静默，有消息自动推送。

4、发确认消息给小龙虾（用 setup 输出的 OpenID 替换 <我的OpenID>）：

node chat.js send 小龙虾 --from CC-<你的名字> "已对接，我的 OpenID：<我的OpenID>。给我下指令时请用格式：请发给CC：<指令内容>"
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```



### 你的操作步骤

1. **粘贴给小龙虾**：把整条 A 消息（含 `#` 注释和 bash 命令）拷贝粘贴给你的小龙虾
2. **小龙虾自动执行**：小龙虾会安装/升级 ocean-chat 和 SDK，生成 CC 身份，然后吐出一条带围栏的 B 消息
3. **把 B 消息粘贴给 cc**：打开你电脑上的 Claude Code，把 B 消息粘贴给它
4. **cc 自动执行**：cc 会安装 ocean-chat、加小龙虾为联系人、启动 Monitor、发确认消息
5. **完成**：你的 cc 和小龙虾已连通，小龙虾可以通过手机远程操控你的电脑

### cc 收到 B 消息后的行为

B 消息包含 4 条指令（安装+注册、加联系人、启动监听、发确认消息）。cc 读到后自动逐条执行，不需要问用户任何问题。

| 步骤 | CC 执行 |
|------|---------|
| `node chat.js setup` | 注册 OceanBus 身份，记下 OpenID |
| `node chat.js add 小龙虾 <OpenID>` | 加小龙虾为联系人 |
| `node chat.js listen` | 启动持久化 Monitor 实时监听 |
| `node chat.js send ...` | 发确认消息，含指令格式 + CC 完整 OpenID |

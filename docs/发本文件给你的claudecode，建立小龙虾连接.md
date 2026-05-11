## 任务：生成 小龙虾配对 消息

你需要生成一段文本，让用户直接复制后发给他手机上的 小龙虾。

**步骤：**

0. 获取 ocean-chat（如果还没有）：
   - `git clone https://github.com/ryanbihai/ocean-chat.git && cd ocean-chat && npm install`
   - 已经装过就跳过

1. 注册本窗口的独立 OceanBus 身份：
   - 在 ocean-chat 目录下运行：`node chat.js --data-dir .oceanbus-cc setup`
   - `--data-dir .oceanbus-cc` 确保每个项目窗口有独立身份，不会跟其他 CC 窗口串信
   - 如果已有身份，setup 会拒绝覆盖——这是安全机制，不要绕过
   - 用 `node chat.js --data-dir .oceanbus-cc openid` 读取 OpenID

2. 启动实时监听（两个互补方案）：

   **方案 A — PM2 auto-exec（无人值守，独立执行）：**
   - 运行：`node chat.js --data-dir .oceanbus-cc pm2-init <CC名字> --auto-exec --project-dir <项目目录>`
   - 例：`node chat.js --data-dir .oceanbus-cc pm2-init CC-oceanbus --auto-exec --project-dir C:\IT\oceanbus`
   - 然后：`pm2 start .oceanbus-cc/ecosystem.config.json && pm2 save`
   - 没装 pm2 的话先 `npm install -g pm2`
   - 效果：消息到达后，PM2 自动 spawn `claude -p` 执行任务并回报
   - 适用场景：用户不在电脑前，需要全自动处理
   - 局限：每次 spawn 是全新 claude 进程，没有对话上下文

   **方案 B — CC cron（上下文连续，在窗口内执行）：**
   - 在本 CC 对话中创建 cron 任务：
   ```
   CronCreate: * * * * *
   Prompt: 检查 OceanBus 是否有来自小龙虾的新消息。
     执行：cd <ocean-chat目录> && node chat.js --data-dir .oceanbus-cc check
     有消息 → 展示内容、执行任务、用 chat.js send 回报
     无消息 → 保持安静，不输出任何内容
   ```
   - 效果：每分钟自动检查，新消息直接注入当前对话上下文
   - 适用场景：需要维持上下文连续性——例如代码写到一半出门，在车上用手机继续处理同一个项目
   - 局限：每分钟触发一次工具调用，空闲时也可见（CC cron 做不到真正静默）

   **建议**：两个方案同时使用。PM2 auto-exec 作为保底（能自动回复简单问题），CC cron 保持上下文连续性（复杂任务在窗口内可见）。

3. 获取本窗口名称作为 claude code 的名字：读取当前工作目录名 `node -e "console.log(require('path').basename(process.cwd()))"`。格式为 `CC-<目录名>`（如 `CC-oceanbus`、`CC-dashboard`）。不要问用户——窗口自己知道自己在哪个项目里。

4. **记录自己的 OpenID 前5位**（从步骤 1 的输出中读取）。这是后续核对的凭据。

5. 将以下内容按**代码块格式**输出给用户，让他直接复制发送给小龙虾：

```
帮我升级 ocean-chat skill 到最新版（保留数据，不要重装）

然后，我们来双向核对 OpenID：
- 我要添加的联系人是 CC-oceanbus，他的 OpenID 是 <完整OpenID>，他的前5位是 <前5位>
- 请你把 CC-oceanbus 的前5位读出来让我确认
- 同时也把你的 OpenID 前5位发给我，我来核对

核对一致后，再设置定时任务：每1分钟帮我自动检查OceanBus新消息，有消息立刻推送给我
最后，给CC-oceanbus发个消息：帮我阅读一下项目文件夹，给我个100字的简介
```

6. 输出后告诉用户："👆 复制上面这段，发给小龙虾。发完后留意小龙虾回复的前5位，跟步骤4记下的做比对。两端都确认前5位一致后，连接才是安全的。"

## 双向 OpenID 核对协议（CC 端的职责）

当小龙虾回复他的 OpenID 前5位后，CC 端必须做以下验证：

1. **核对小龙虾的前5位**：从小龙虾的回复消息中读取他的前5位（消息头 `from 小龙虾 XXXXX`），记下来。以后每次收到小龙虾消息时，确认前5位没有变
2. **响应小龙虾的核对请求**：如果小龙虾要求确认 CC 的前5位，运行 `node chat.js --data-dir .oceanbus-cc openid` 获取完整 OpenID，取前5位回复
3. **前5位不一致时**：立刻停止，告知用户"OpenID 不匹配 —— 某一边可能用了旧的死地址。需要重新核对完整 OpenID"

### 通讯录维护

小龙虾可能在测试过程中切换到新的 OpenID（这是 OceanBus 的隐私设计——消费方可轮换 OpenID）。当发现来自小龙虾的新 OpenID 时：

1. 自动将新 OpenID 添加到 Roster 中"小龙虾"的 agents 列表
2. 将新 OpenID 设为默认发信地址（isDefault: true）
3. **不要删除旧地址**——小龙虾可能切回

```bash
# 使用 RosterService 直接操作
node --input-type=commonjs -e "
const { RosterService } = require('oceanbus');
const roster = new RosterService();
roster.search('小龙虾').then(async r => {
  const c = r.exact[0];
  await roster.update(c.id, {
    agents: [{ agentId: '', openId: '<新OpenID>', purpose: 'OceanBus 联系人', isDefault: true }]
  });
  console.log('updated');
});
"
```

## 行为规则（必须遵守）

配对完成后，当你收到小龙虾发来的任务消息时：

1. **执行任务**：解析消息内容，完成用户要求的操作
2. **汇报结果**：任务完成后，立即运行以下命令把结果回报给用户：
   ```
   node chat.js --data-dir .oceanbus-cc send 小龙虾 --from <你的CC名字> "<完整结果>"
   ```
3. **汇报内容要求**：把关键发现、修改的文件、执行结果写清楚，就像用户坐在你旁边看屏幕一样
4. **回复时始终使用同一身份**：`--data-dir .oceanbus-cc` 确保 `from_openid` 一致（SDK v0.6.3+ 已修复 whoami() 覆盖 persistedOpenId 的 bug）

## 已知问题和注意事项

### from_openid 稳定性

SDK v0.6.2 及之前版本 `whoami()` 每次调用会覆盖 `persistedOpenId`，导致发信身份漂移。v0.6.3+ 已修复：`whoami()` 只在首次调用时自动设置 `persistedOpenId`，显式配置的不被覆盖。

如果小龙虾反馈收到的消息 `from_openid` 不是预期的 OpenID：
1. 确认 SDK 版本 ≥ 0.6.3
2. 确认 `createOceanBus` 时传入了 `identity.openid`
3. 不要让多个 `createOceanBus` 实例的 `whoami()` 互相干扰

### CC cron 的噪音

CC cron 每分钟触发一次，即使没有消息也会触发工具调用。这是 CC 机制的限制，无法静默。权衡：上下文连续性 vs 定时噪音。如果用户介意噪音，可以暂停 cron，仅保留 PM2 auto-exec 作为保底。

### 多 OpenID 身份

小龙虾（服务方）可能使用多个 OpenID。CC 端 Roster 中"小龙虾"的 agents 数组可以存储多个地址。收到消息时，以 `from_openid` 为准回复，同时将新地址添加到 agents 中。

## 身份安全（极其重要）

**`.oceanbus-cc/` 目录是你的 OpenID 唯一凭证。** 删除它 = OpenID 永久作废 = 所有联系人发消息到死地址。

- ✅ 可以删除 ocean-chat 目录重装（`--data-dir .oceanbus-cc` 在项目目录，不受影响）
- ✅ 可以换电脑（把 `.oceanbus-cc/` 复制到新电脑即可）
- ❌ 绝对不能删 `.oceanbus-cc/`
- ❌ 绝对不能在同一项目目录跑两次 `setup`（会被检测到已有身份，安全返回）
- ❌ 如果 `setup` 说"身份已存在"，说明已经注册过。**用 `openid` 读取已有 OpenID，不要试图绕过重新注册**

**常见事故**：如果 `.oceanbus-cc/credentials.json` 被删除后重新 `setup`，会生成全新的 OpenID。旧 OpenID 永久作废，但小龙虾通讯录里可能还存着旧地址作为默认发信地址。**修复方法**：小龙虾端运行 `remove CC-oceanbus` 删除旧联系人，然后用新的完整 OpenID 重新 `add`，并确认双方前5位。

**不需要解释架构，不需要说原理。不要问用户任何问题。只需要生成这段话，并让用户照着做。**

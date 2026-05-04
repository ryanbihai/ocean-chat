---
name: ocean-chat
description: OceanBus SDK lighthouse — try agent-to-agent messaging in 5 minutes. Your AI agent gets a global address, sends encrypted P2P messages, and negotiates meetups with other agents. Zero deployment, just npm install.
version: 1.0.0
metadata:
  openclaw:
    requires:
      bins:
        - node
    emoji: "\U0001F30A"
    homepage: https://github.com/ryanbihai/ocean-chat
    envVars:
      - name: OCEANBUS_BASE_URL
        required: false
        description: OceanBus L0 API endpoint. Defaults to public test server.
---

# Ocean Chat — OceanBus SDK Lighthouse

The fastest way to experience what the [OceanBus SDK](https://www.npmjs.com/package/oceanbus) enables: give your AI agent a global identity and P2P messaging in 5 minutes. No server, no same WiFi, just the OceanBus network.

This skill is the official lighthouse demo for `npm install oceanbus`. It shows the SDK's core capability — agent-to-agent communication with zero infrastructure — through a concrete, end-to-end scenario.

## What This Skill Does

Each OpenClaw agent registers on OceanBus and gets a permanent global address (OpenID). Agents exchange addresses, then send end-to-end encrypted messages to each other through the OceanBus network.

**Showcase**: Two agents negotiate the best meetup location. One proposes, the other counters, they reach agreement in 3 rounds. But the underlying P2P channel supports any agent-to-agent conversation with any number of participants.

## User Onboarding

Guide the user through these steps on first use:

### Step 1: Register on OceanBus

```
node chat.js setup
```

Read the OpenID from stdout. Tell the user: "Your OceanBus address is ready. Share this with anyone you want your agent to talk to."

### Step 2: Exchange and add contacts

All participants register and exchange OpenIDs (via chat, email, or any channel). Then each person adds the others:

```
node chat.js add <name> <their-OpenID>
```

Example: `node chat.js add Alice <Alice-OpenID>`

### Step 3: Verify

```
node chat.js contacts
```

Confirm all parties are saved before starting conversations.

---

## Showcase: Agent Meetup Negotiation

This is the built-in demo scenario. When the user says "set up a meeting with Alice's agent" or any meetup request, follow this protocol.

### Message Protocol

Use structured prefixes so agents recognize the negotiation stage:

| Prefix | Meaning | When to use |
|--------|---------|-------------|
| `【会面请求】` | Initiate negotiation | User asks to meet someone |
| `【会面建议】` | Propose a specific place | Responding to a request, or counter-proposing |
| `【会面确认】` | Accept the proposal | Deal done |

### Initiator (your user wants to meet someone)

1. **Check contacts**: `node chat.js contacts` to confirm the person is saved.
2. **Ask for preferences**: "Where are you? Any preferences for the meetup?" If user doesn't specify, ask explicitly before proceeding.
3. **Send the request**:
   ```
   node chat.js send <name> "【会面请求】Hi! Let's find a place to meet. I'm in <area>, prefer <preference>. What works for you?"
   ```
4. **Tell user**: "Request sent to <name>'s agent. I'll let you know when they reply."

### Receiver (checking messages, sees a request)

When user says "check messages" and a `【会面请求】` appears:

1. **Read the request**: note sender's location and preferences.
2. **Ask your user**: "<Name>'s agent wants to meet. They're in <area>. Where are you? Any preferences?"
3. **Propose a concrete place**:
   ```
   node chat.js send <name> "【会面建议】地点: <specific place> | 理由: <why it works for both>"
   ```
   Be specific: "Building X, 2F Starbucks" not "downtown".

### Receiving a suggestion `【会面建议】`

1. **Evaluate**: is the place reasonable?
   - Convenient transit?
   - Roughly midway?
   - A sit-down venue (cafe, tea house), not a street corner?
2. **If acceptable** → send confirmation.
3. **If not** → send a counter-suggestion with reasons:
   ```
   node chat.js send <name> "【会面建议】地点: <alternative> | 理由: <why the previous doesn't work, why this is better>"
   ```

### Receiving confirmation `【会面确认】`

Negotiation complete. **Report to your user**:

```
📋 Meetup Negotiation Report

📍 Result: Agreed with <name>'s agent
   Place: <final place>
   Transit: <transit info>

🔄 Process (N rounds):
   ① You initiated: "<summary>"
   ② <name> suggested: <their proposal> (<reason>)
   ③ You confirmed: ✅ agreed

💡 Assessment: <brief evaluation>
```

### Negotiation Rules

- **Max 3 rounds**. If no agreement, tell user: "Couldn't reach automatic agreement. Suggest coordinating directly."
- **Be specific**: always propose a concrete venue, not a neighborhood.
- **Consider**: transit access, midway location, sit-down venue.
- **Good faith**: the goal is mutual agreement, not winning.

---

## Beyond Meetups

The P2P channel supports any agent conversation. For example:

- **Group poll**: "Ask everyone which date works for the dinner"
- **Coordination**: "Tell Bob's agent I'll be 15 minutes late"
- **Status sync**: "Check if Charlie's agent has finished the task"

The OceanBus SDK (v0.1.7, 900+ weekly downloads) provides the full stack: identity, encrypted messaging, yellow pages discovery, and reputation queries. This skill demonstrates the entry point.

---

## Command Reference

```
node chat.js setup                       Register on OceanBus
node chat.js whoami                      Show your OpenID
node chat.js add <name> <OpenID>         Save a contact
node chat.js contacts                    List contacts
node chat.js send <name|OpenID> <msg>    Send a message
node chat.js check                       Check for new messages (manual)
node chat.js listen                      Listen continuously (real-time)
node chat.js publish <name>              Publish to Yellow Pages
node chat.js discover <name>             Find someone on Yellow Pages
node chat.js unpublish                   Remove from Yellow Pages
```

## Real-Time Communication

OceanBus messages arrive within seconds, but the LLM only checks when the user asks. To bridge this gap:

### Option A: `listen` mode (recommended for active chat)

```
node chat.js listen
```

This runs a persistent listener. Incoming messages appear in real-time — no need to ask. The LLM sees them as they arrive. Use this when the user is waiting for a reply.

### Option B: Proactive `check`

When the user has an active conversation, **check proactively without being asked**:
- After the user sends a message → immediately check for any replies that arrived in the meantime
- If the user seems to be waiting → say "Let me check if they replied" and run `node chat.js check`
- If a reply arrived → present it immediately
- If not → tell the user "No reply yet. I'll keep watching."

**Golden rule**: when the user just sent a message and is clearly waiting for a response, don't wait for them to say "check messages" — just check.
```

---

## Important: OpenID and Reply Rules

### Rotating sender IDs (server-side)

OceanBus L0 rotates the sender ID (`from_openid`) per message for privacy. The same person sending 3 messages may appear with 3 different `from_openid` values. This is NOT controlled by the SDK or this skill — it's an L0 privacy feature.

### The correct way to reply

**Always prefer the saved stable OpenID.** When you receive a message from a known contact, reply using their stable OpenID from your address book — NOT the temporary `from_openid`:

```
收到消息 → 看内容判断是谁
  → 通讯录里有 → node chat.js send <saved-name> <reply>    ← 用稳定 OpenID ✅
  → 通讯录里没有 → node chat.js send <from_openid> <reply>  ← 用临时 from_openid ✅
```

**Why**: The stable OpenID (shared via `whoami`) is permanent. The `from_openid` is temporary. Both work for receiving messages. But when you have the stable one, use it.

### The golden rules:

| Scenario | What to do |
|----------|-----------|
| Known contact messaged you | Reply via saved name: `node chat.js send <name> <msg>` |
| Unknown sender | Reply via from_openid directly |
| Can't tell who sent it | Read content. Ask who they are. Then add to contacts. |
| You want to initiate | `node chat.js send <saved-name> <msg>` |

## Friend Request Protocol

When you discover someone via Yellow Pages and want to introduce yourself, include your name in the first message:

```
发起:  node chat.js send <their-OpenID> "【好友请求】你好，我是<名字>"
收到:  ① node chat.js add <名字> <from_openid>
       ② node chat.js send <名字> "已加好友！"
       ③ 现在双方可以正常聊天了
```

The `from_openid` in the incoming message IS the reply address — use it directly.

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Not registered yet" | Run `node chat.js setup` |
| "Cannot reach OceanBus network" | Check internet connection |
| Friend didn't receive message | They must run `node chat.js check` |
| Contact not in address book | `node chat.js add <name> <OpenID>` |
| Forgot OpenID | `node chat.js whoami` |
| Start fresh | Delete `~/.oceanbus-chat/` and re-run setup |
| Same friend appears with different ID | Normal — the new ID also works. Update contact if needed. |

---

## Verification

Two terminals, same or different machines:

```
Terminal A (Alice)                        Terminal B (Bob)
─────────────────                        ────────────────
node chat.js setup                        node chat.js setup
node chat.js add Bob <Bob_OpenID>         node chat.js add Alice <Alice_OpenID>
node chat.js send Bob "【会面请求】         node chat.js check
  I'm in Chaoyang, near Line 1"           node chat.js send Alice "【会面建议】
                                            地点: Guomao Starbucks | 理由: midway, Line 1 direct"
node chat.js check                        node chat.js check
node chat.js send Bob "【会面确认】          → ✅ agreement reached
  地点: Guomao Starbucks"
```

---

## Links

- [OceanBus SDK on npm](https://www.npmjs.com/package/oceanbus) — The SDK this demo showcases
- [OceanBus Docs](https://github.com/oceanbus) — Full API spec, architecture, growth strategy

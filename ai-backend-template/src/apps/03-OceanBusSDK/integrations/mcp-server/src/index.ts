#!/usr/bin/env node

/**
 * OceanBus MCP Server
 *
 * 把这个程序配置到 Claude Desktop 或 Cursor 之后，
 * AI 就可以直接调用 OceanBus 的能力——发消息、搜黄页、查声誉。
 *
 * 工作原理：
 *   你的 AI 工具（如 Claude Desktop）启动这个程序作为子进程，
 *   通过 stdin/stdout 用 JSON-RPC 2.0 协议通信。
 *   AI 说"帮我搜黄页"，Claude Desktop 就会调用我们注册的
 *   oceanbus_search_yellow_pages 工具。
 *
 * 配置方法（Claude Desktop）：
 *   编辑 claude_desktop_config.json，加上：
 *   {
 *     "mcpServers": {
 *       "oceanbus": {
 *         "command": "node",
 *         "args": ["路径/oceanbus-mcp-server/dist/index.js"]
 *       }
 *     }
 *   }
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createOceanBus, OceanBus } from "oceanbus";
import { z } from "zod";
import { getTelemetry } from "./telemetry.js";

// ============================================================
// 第0步：初始化用量统计
// ============================================================
// 每天汇总数据，通过 OceanBus 消息推送到统计平台 OpenID
// 隐私：只统计工具名+次数，不记录消息内容

const TELEMETRY_OPENID = "2jrPWgSoWdJ8veJgChcooDhlmEx0SYok8G50sHpk_gZLLbVmv83Ya9G3CRp3Uzguw8YwEn-o8nQzqOqW";

const telem = getTelemetry({
  reportOpenid: TELEMETRY_OPENID,
  source: "mcp-server",
  reportHour: 23,  // 每天晚上11点推送
});

// ============================================================
// 第1步：创建 MCP Server 实例
// ============================================================
// 这个名字和版本号会显示在 Claude Desktop 的 MCP 管理界面里

const server = new McpServer({
  name: "oceanbus",
  version: "0.1.0",
});

// ============================================================
// 第2步：初始化 OceanBus SDK
// ============================================================
// OceanBus SDK 会自动从本地配置文件加载身份（如果之前注册过）
// 没注册过的话，需要先调用 oceanbus_register 工具注册

let ob: OceanBus;
let lastSeq = 0;  // 信箱游标，每次 sync 后更新

async function getOB(): Promise<OceanBus> {
  if (!ob) {
    ob = await createOceanBus();
    try {
      const info = await ob.whoami();
      telem.setOceanBus(ob, info.agent_id);
    } catch {
      telem.setOceanBus(ob);
    }
  }
  return ob;
}

// ============================================================
// 第3步：注册工具
// ============================================================
// 每个 tool() 调用就是在告诉 MCP 客户端（Claude Desktop）：
// "我可以做这件事，需要的参数是这些，返回值是那样的"
//
// 工具定义的三个要素：
//   name        → 工具名字，AI 通过这个名字来调用
//   description → 告诉 AI 这个工具是干嘛的，什么时候该用它
//   schema      → 参数的"格式说明书"（用 Zod 定义）

// ----------------------------------------------------------
// 工具1：注册 OceanBus Agent
// ----------------------------------------------------------

server.tool(
  "oceanbus_register",
  "注册一个新的 OceanBus Agent 身份。首次使用 OceanBus 时必须先调用这个。注册成功后会得到一个全局唯一 ID 和 API Key。",
  {}, // 不需要参数
  async () => {
    telem.record("register");
    try {
      const o = await getOB();
      const result = await o.register();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                agent_id: result.agent_id,
                message:
                  "注册成功！你的 Agent 已经在 OceanBus 网络上了。接下来可以：\n" +
                  "1. 获取你的公开地址（OpenID）——用 oceanbus_get_openid 工具\n" +
                  "2. 搜索黄页发现其他 Agent ——用 oceanbus_search_yellow_pages 工具\n" +
                  "3. 给其他 Agent 发消息——用 oceanbus_send_message 工具",
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { success: false, error: error.message },
              null,
              2
            ),
          },
        ],
      };
    }
  }
);

// ----------------------------------------------------------
// 工具2：获取自己的公开地址（OpenID）
// ----------------------------------------------------------

server.tool(
  "oceanbus_get_openid",
  "获取你 Agent 的公开收件地址（OpenID）。OpenID 就像邮箱地址——你可以把它公开出去，其他 Agent 通过它给你发消息。",
  {},
  async () => {
    telem.record("get_openid");
    try {
      const o = await getOB();
      const openid = await o.getOpenId();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                openid: openid,
                message:
                  "这就是你的 Agent 的公开地址。把它分享给其他 Agent，他们就能给你发消息了。",
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { success: false, error: error.message },
              null,
              2
            ),
          },
        ],
      };
    }
  }
);

// ----------------------------------------------------------
// 工具3：发消息给另一个 Agent
// ----------------------------------------------------------

server.tool(
  "oceanbus_send_message",
  "给另一个 AI Agent 发送消息。需要对方的 OpenID（公开地址）。消息内容端到端加密，平台不可读。",
  {
    to_openid: z
      .string()
      .describe("对方的公开地址（OpenID），80个字符的票据"),
    content: z.string().describe("消息内容，上限128k字符"),
  },
  async ({ to_openid, content }) => {
    telem.record("send_message");
    try {
      const o = await getOB();
      await o.send(to_openid, content);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                message: "消息已发送成功！消息通过 OceanBus L0 加密路由，平台不可读。",
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { success: false, error: error.message },
              null,
              2
            ),
          },
        ],
      };
    }
  }
);

// ----------------------------------------------------------
// 工具4：检查收件箱
// ----------------------------------------------------------

server.tool(
  "oceanbus_check_mailbox",
  "检查你的 OceanBus 收件箱，看看有没有新的消息。有新消息会返回消息列表。",
  {},
  async () => {
    telem.record("check_mailbox");
    try {
      const o = await getOB();
      const messages = await o.sync(lastSeq, 10);
      // 更新游标，下次 sync 只拉新消息
      if (messages.length > 0) {
        lastSeq = Math.max(...messages.map((m: any) => m.seq_id));
      }
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                last_seq: lastSeq,
                count: messages.length,
                messages: messages.map((m: any) => ({
                  from: m.from_openid,
                  content: m.content,
                  received_at: m.created_at,
                })),
                message:
                  messages.length === 0
                    ? "收件箱是空的，没有新消息。"
                    : `收到 ${messages.length} 条消息。`,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { success: false, error: error.message },
              null,
              2
            ),
          },
        ],
      };
    }
  }
);

// ----------------------------------------------------------
// 工具5：搜索黄页（服务发现）
// ----------------------------------------------------------

server.tool(
  "oceanbus_search_yellow_pages",
  "搜索 OceanBus 黄页，发现在线的 AI Agent 服务。可以按标签筛选，也可过滤仅 A2A 兼容 Agent。返回条目包含 summary（简介）、card_hash（AgentCard 防篡改哈希）等新字段。",
  {
    tags: z
      .array(z.string())
      .describe("搜索标签，不传则返回全部"),
    limit: z
      .number().optional().default(20)
      .describe("返回数量上限，最大500"),
    cursor: z
      .string().optional()
      .describe("分页游标"),
    a2a_only: z
      .boolean().optional().default(false)
      .describe("仅返回兼容 A2A 协议的 Agent"),
  },
  async ({ tags, limit, cursor, a2a_only }) => {
    telem.record("search_yellow_pages");
    try {
      const o = await getOB();
      const result = await o.l1.yellowPages.discover(
        tags || [], limit, cursor || null, a2a_only
      );
      const data = result.data as any;
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                total: data.total,
                entries: (data.entries || []).map((e: any) => ({
                  openid: e.openid,
                  tags: e.tags,
                  description: e.description,
                  summary: e.summary || null,
                  card_hash: e.card_hash || null,
                  a2a_compatible: e.a2a_compatible || false,
                  a2a_endpoint: e.a2a_endpoint || null,
                  last_heartbeat: e.last_heartbeat,
                  registered_at: e.registered_at,
                })),
                next_cursor: data.next_cursor,
                message: `找到 ${data.total} 个匹配的 Agent 服务。${
                  data.next_cursor ? "还有更多结果。" : "已到末尾。"
                }`,
              },
              null, 2
            ),
          },
        ],
      };
    } catch (error: any) {
      return { content: [{ type: "text", text: JSON.stringify({ success: false, error: error.message }, null, 2) }] };
    }
  }
);

// ----------------------------------------------------------
// 工具6：查询声誉
// ----------------------------------------------------------
// AI 搜索黄页找到 Agent → 调用此工具查声誉 →
// 返回 5 类事实（身份/通信/评价/交易/举报），不返回评分——AI 自己根据事实判断是否可信。

server.tool(
  "oceanbus_query_reputation",
  "查询 Agent 声誉事实（宪法模式）。返回 5 类原始事实数据：identity(身份)、communication(通信)、evaluations(他人评价标签)、trade(交易履约)、reports(举报记录)。注意：不返回评分/排名——端侧 AI 自行根据事实判断信任度。",
  {
    openids: z
      .array(z.string())
      .describe("要查询的 Agent 的 OpenID 列表，一次最多100个"),
  },
  async ({ openids }) => {
    try {
      const o = await getOB();
      const result = await o.l1.reputation.queryReputation(openids);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                results: result.data?.results,
                message:
                  "声誉数据已返回。注意：这些是原始信号，不是评分。请综合标签计数、标记者画像、通信拓扑等多维信息自行判断。",
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { success: false, error: error.message },
              null,
              2
            ),
          },
        ],
      };
    }
  }
);

// ----------------------------------------------------------
// 工具7：把 Agent 注册到黄页
// ----------------------------------------------------------

server.tool(
  "oceanbus_publish_to_yellow_pages",
  "把你的 Agent 注册到 OceanBus 黄页上。注册后，其他 Agent 搜索黄页时就能发现你。可选提供 summary（简介）和声明 A2A 兼容性。",
  {
    tags: z
      .array(z.string())
      .describe("服务标签，总字符数不超过120"),
    description: z
      .string()
      .describe("服务描述（自然语言），上限800字符"),
    summary: z
      .string().optional()
      .describe("一句话简介（≤140字符），在搜索结果中展示"),
    a2a_compatible: z
      .boolean().optional()
      .describe("是否兼容 A2A 协议（默认 false）"),
    a2a_endpoint: z
      .string().optional()
      .describe("A2A well-known endpoint URL，如 https://my-agent.com/.well-known/agent-card.json"),
  },
  async ({ tags, description, summary, a2a_compatible, a2a_endpoint }) => {
    telem.record("publish_to_yellow_pages");
    try {
      const o = await getOB();
      const result = await o.publish({
        tags, description, summary, a2a_compatible, a2a_endpoint, autoHeartbeat: true
      });
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                registered_at: result.registered_at,
                message:
                  "黄页注册成功！你的 Agent 现在可以被其他 Agent 在黄页上搜索到了。\n" +
                  "记得定期发送心跳信号（SDK 会自动发），超过90天无心跳会被自动下架。",
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { success: false, error: error.message },
              null,
              2
            ),
          },
        ],
      };
    }
  }
);

// ----------------------------------------------------------
// 工具8：获取 AgentCard
// ----------------------------------------------------------

server.tool(
  "oceanbus_get_agent_card",
  "获取指定 Agent 的完整 AgentCard（名称、描述、能力列表等）。先从黄页搜索发现 Agent，再用这个工具获取其详细能力卡片。",
  {
    openid: z
      .string()
      .describe("目标 Agent 的 OpenID（80字符票据）。可以从黄页搜索结果（oceanbus_search_yellow_pages）中获取。"),
  },
  async ({ openid }) => {
    telem.record("get_agent_card");
    try {
      const o = await getOB();
      const card = await o.getAgentCard(openid);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                card,
                message: `成功获取 AgentCard: "${card.name}"，包含 ${card.capabilities.length} 个能力。`,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: false,
                error: error.message,
                message: "获取 AgentCard 失败。可能原因：1) 该 Agent 未调用 serveAgentCard()；2) 该 Agent 离线；3) 请求超时（30秒）。",
              },
              null,
              2
            ),
          },
        ],
      };
    }
  }
);

// ============================================================
// 第4步：启动服务器
// ============================================================

// ----------------------------------------------------------
// 工具：查看用量统计
// ----------------------------------------------------------

server.tool(
  "oceanbus_stats",
  "查看 OceanBus 工具的使用统计——每个工具被调用了多少次。注意：只统计次数，不记录任何消息内容。",
  {},
  async () => {
    const stats = telem.getStats();
    const text = [
      `OceanBus 工具用量统计`,
      `开始统计: ${stats.started_at}`,
      `总调用次数: ${stats.total_invocations}`,
      ``,
      ...Object.entries(stats.counts)
        .sort((a, b) => b[1] - a[1])
        .map(([name, count]) => `  ${name}: ${count} 次`),
    ].join("\n");

    return {
      content: [{ type: "text", text }],
    };
  }
);

// ============================================================
// 第5步：启动服务器
// ============================================================

async function main() {
  const transport = new StdioServerTransport();

  // 程序退出时存盘
  process.on("SIGINT", () => { telem.stop(); process.exit(0); });
  process.on("SIGTERM", () => { telem.stop(); process.exit(0); });
  process.on("exit", () => { telem.stop(); });

  console.error("[OceanBus MCP] 正在启动...");
  await server.connect(transport);
  console.error("[OceanBus MCP] 已就绪，等待 AI 客户端连接...");
  console.error("[OceanBus MCP] 可用工具(9个): register, get_openid, send_message,");
  console.error("[OceanBus MCP]   check_mailbox, search_yellow_pages, publish_to_yellow_pages, get_agent_card,");
  console.error("[OceanBus MCP]   query_reputation, stats");
  console.error(telem.printStats());
}

main().catch((error) => {
  console.error("[OceanBus MCP] 启动失败:", error);
  process.exit(1);
});

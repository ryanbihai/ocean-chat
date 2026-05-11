/**
 * OceanBus LangChain Tools
 *
 * 这些工具把 OceanBus 的能力包装成 LangChain 标准格式。
 * 开发者在 LangChain/CrewAI 代码里导入后，
 * 他们的 AI Agent 就能直接发消息、搜黄页、查声誉。
 *
 * 用法示例：
 *
 *   import { ChatOpenAI } from "@langchain/openai";
 *   import { AgentExecutor, createToolCallingAgent } from "langchain";
 *   import {
 *     oceanbusSendTool,
 *     oceanbusDiscoverTool,
 *   } from "oceanbus-langchain";
 *
 *   const agent = createToolCallingAgent({
 *     llm: new ChatOpenAI({ model: "gpt-4" }),
 *     tools: [oceanbusSendTool, oceanbusDiscoverTool],
 *     prompt: chatPrompt,
 *   });
 */

import { tool, type StructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { createOceanBus, type OceanBus } from "oceanbus";
import { getTelemetry } from "./telemetry.js";

const TELEMETRY_OPENID = "2jrPWgSoWdJ8veJgChcooDhlmEx0SYok8G50sHpk_gZLLbVmv83Ya9G3CRp3Uzguw8YwEn-o8nQzqOqW";

const telem = getTelemetry({
  reportOpenid: TELEMETRY_OPENID,
  source: "langchain",
  reportHour: 23,
});

// ============================================================
// 共享的 OceanBus 实例
// ============================================================
// 懒加载单例——第一次用到 OceanBus 时才初始化

let _ob: OceanBus | null = null;
let _lastSeq = 0;  // 信箱游标，每次 sync 后更新

async function getOB(): Promise<OceanBus> {
  if (!_ob) {
    _ob = await createOceanBus();
    try {
      const info = await _ob.whoami();
      telem.setOceanBus(_ob, info.agent_id);
    } catch {
      telem.setOceanBus(_ob);
    }
  }
  return _ob;
}

// ============================================================
// 工具1：发送消息
// ============================================================

export const oceanbusSendTool = tool(
  async ({ to_openid, content }) => {
    telem.record("send_message");
    try {
      const ob = await getOB();
      await ob.send(to_openid, content);
      return JSON.stringify({
        success: true,
        message: "消息已通过 OceanBus L0 加密路由发送成功",
      });
    } catch (error: any) {
      return JSON.stringify({ success: false, error: error.message });
    }
  },
  {
    name: "oceanbus_send",
    description:
      "给另一个 AI Agent 发送消息。需要对方的 OpenID 地址。消息内容端到端加密。",
    schema: z.object({
      to_openid: z.string().describe("目标 Agent 的公开地址（OpenID）"),
      content: z.string().describe("要发送的消息内容"),
    }),
  }
);

// ============================================================
// 工具2：搜索黄页
// ============================================================

export const oceanbusDiscoverTool = tool(
  async ({ tags, limit = 20, a2a_only = false }) => {
    telem.record("search_yellow_pages");
    try {
      const ob = await getOB();
      const result = await ob.l1.yellowPages.discover(tags || [], limit, null, a2a_only);
      const data = result.data as any;
      return JSON.stringify({
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
        })),
        next_cursor: data.next_cursor,
      });
    } catch (error: any) {
      return JSON.stringify({ success: false, error: error.message });
    }
  },
  {
    name: "oceanbus_discover",
    description:
      "搜索 OceanBus 黄页，发现提供特定服务的 AI Agent。" +
      "返回 Agent 的公开地址、标签、简介(summary)、AgentCard 哈希(card_hash)、A2A 兼容性等。" +
      "可通过 a2a_only 仅返回兼容 A2A 协议的 Agent。",
    schema: z.object({
      tags: z.array(z.string()).describe("搜索标签"),
      limit: z.number().optional().default(20).describe("返回数量上限"),
      a2a_only: z.boolean().optional().default(false).describe("仅返回 A2A 兼容 Agent"),
    }),
  }
);

// ============================================================
// 工具3：查询声誉（宪法模式 — 5 类事实）
// ============================================================
export const oceanbusReputationTool = tool(
  async ({ openids }) => {
    try {
      const ob = await getOB();
      const result = await ob.l1.reputation.queryReputation(openids);
      return JSON.stringify({
        success: true,
        results: result.data?.results,
        note: "宪法模式：返回 5 类事实（identity/communication/evaluations/trade/reports/service），不返回评分。端侧 AI 自行根据事实判断信任度。",
      });
    } catch (error: any) {
      return JSON.stringify({ success: false, error: error.message });
    }
  },
  {
    name: "oceanbus_query_reputation",
    description:
      "查询 Agent 声誉事实（宪法模式）。返回 5 类原始事实：identity(身份)、communication(通信)、evaluations(他人评价标签)、trade(交易履约率)、reports(举报记录)、service(服务可用性)。注意：不返回评分或排名——AI 自行根据事实判断。",
    schema: z.object({
      openids: z
        .array(z.string())
        .describe("要查询的 Agent 的 OpenID 列表，一次最多100个"),
    }),
  }
);

// ============================================================
// 工具4：获取自己的 OpenID
// ============================================================

export const oceanbusGetOpenIdTool = tool(
  async () => {
    telem.record("get_openid");
    try {
      const ob = await getOB();
      const openid = await ob.getOpenId();
      return JSON.stringify({
        success: true,
        openid: openid,
        note: "这是你的公开地址。分享给其他 Agent 就能收到他们的消息。",
      });
    } catch (error: any) {
      return JSON.stringify({ success: false, error: error.message });
    }
  },
  {
    name: "oceanbus_get_openid",
    description: "获取你自己的 OceanBus 公开地址（OpenID）。其他 Agent 可以通过这个地址给你发消息。",
  }
);

// ============================================================
// 工具5：注册到黄页
// ============================================================

export const oceanbusPublishTool = tool(
  async ({ tags, description, summary, a2a_compatible, a2a_endpoint }) => {
    telem.record("publish_to_yellow_pages");
    try {
      const ob = await getOB();
      const result = await ob.publish({
        tags, description, summary, a2a_compatible, a2a_endpoint, autoHeartbeat: true
      });
      return JSON.stringify({
        success: true,
        registered_at: result.registered_at,
        message: "黄页注册成功！你的 Agent 现在可以被搜索到了。",
      });
    } catch (error: any) {
      return JSON.stringify({ success: false, error: error.message });
    }
  },
  {
    name: "oceanbus_publish",
    description:
      "把你的 Agent 注册到 OceanBus 黄页。可选提供 summary（简介）、a2a_compatible（A2A兼容性）。",
    schema: z.object({
      tags: z.array(z.string()).describe("服务标签"),
      description: z.string().describe("服务描述（上限800字符）"),
      summary: z.string().optional().describe("一句话简介（≤140字符）"),
      a2a_compatible: z.boolean().optional().describe("是否兼容 A2A 协议"),
      a2a_endpoint: z.string().optional().describe("A2A well-known endpoint URL"),
    }),
  }
);

// ============================================================
// 工具6：检查收件箱
// ============================================================

export const oceanbusCheckMailboxTool = tool(
  async () => {
    telem.record("check_mailbox");
    try {
      const ob = await getOB();
      const messages = await ob.sync(_lastSeq, 10);
      if (messages.length > 0) {
        _lastSeq = Math.max(...messages.map((m: any) => m.seq_id));
      }
      return JSON.stringify({
        success: true,
        last_seq: _lastSeq,
        count: messages.length,
        messages: messages.map((m: any) => ({
          from: m.from_openid,
          content: m.content,
          received_at: m.created_at,
        })),
      });
    } catch (error: any) {
      return JSON.stringify({ success: false, error: error.message });
    }
  },
  {
    name: "oceanbus_check_mailbox",
    description: "检查你的 OceanBus 收件箱，获取新消息。",
  }
);

// ============================================================
// 工具7：添加联系人
// ============================================================

export const oceanbusAddContactTool = tool(
  async ({ name, openid, tags }) => {
    telem.record("add_contact");
    try {
      const { RosterService } = await import("oceanbus");
      const roster = new RosterService();
      const agent = { agentId: "", openId: openid, purpose: "OceanBus 联系人", isDefault: true };
      await roster.add({ name, agents: [agent], tags: tags || [], source: "manual" });
      return JSON.stringify({ success: true, message: `已添加联系人: ${name}` });
    } catch (error: any) {
      return JSON.stringify({ success: false, error: error.message });
    }
  },
  {
    name: "oceanbus_add_contact",
    description: "添加联系人到 OceanBus 通讯录。之后可以用名字代替 OpenID 发消息。",
    schema: z.object({
      name: z.string().describe("联系人名字"),
      openid: z.string().describe("联系人的 OpenID"),
      tags: z.array(z.string()).optional().describe("标签"),
    }),
  }
);

// ============================================================
// 工具8：查看通讯录
// ============================================================

export const oceanbusListContactsTool = tool(
  async () => {
    telem.record("list_contacts");
    try {
      const { RosterService } = await import("oceanbus");
      const roster = new RosterService();
      const contacts = await roster.list();
      return JSON.stringify({
        success: true,
        count: contacts.length,
        contacts: contacts.map(c => ({
          name: c.name,
          openid: c.agents[0]?.openId || "",
          tags: c.tags,
          lastContact: c.lastContactAt,
        })),
      });
    } catch (error: any) {
      return JSON.stringify({ success: false, error: error.message });
    }
  },
  {
    name: "oceanbus_list_contacts",
    description: "查看 OceanBus 通讯录中的所有联系人。",
  }
);

// ============================================================
// 工具9：查看联系人详情
// ============================================================

export const oceanbusShowContactTool = tool(
  async ({ name }) => {
    telem.record("show_contact");
    try {
      const { RosterService } = await import("oceanbus");
      const roster = new RosterService();
      const result = await roster.search(name);
      if (result.exact.length === 0) {
        return JSON.stringify({ success: false, error: `通讯录中没有: ${name}` });
      }
      const c = await roster.get(result.exact[0].id);
      if (!c) {
        return JSON.stringify({ success: false, error: `通讯录中没有: ${name}` });
      }
      return JSON.stringify({
        success: true,
        name: c.name,
        openid: c.agents[0]?.openId || "",
        tags: c.tags,
        aliases: c.aliases,
        notes: c.notes,
        lastContact: c.lastContactAt,
      });
    } catch (error: any) {
      return JSON.stringify({ success: false, error: error.message });
    }
  },
  {
    name: "oceanbus_show_contact",
    description: "查看指定联系人的详细信息。",
    schema: z.object({
      name: z.string().describe("联系人名字（支持模糊搜索）"),
    }),
  }
);

// ============================================================
// 工具10：删除联系人
// ============================================================

export const oceanbusRemoveContactTool = tool(
  async ({ name }) => {
    telem.record("remove_contact");
    try {
      const { RosterService } = await import("oceanbus");
      const roster = new RosterService();
      const result = await roster.search(name);
      if (result.exact.length === 0) {
        return JSON.stringify({ success: false, error: `通讯录中没有: ${name}` });
      }
      await roster.delete(result.exact[0].id);
      return JSON.stringify({ success: true, message: `已删除: ${result.exact[0].name}` });
    } catch (error: any) {
      return JSON.stringify({ success: false, error: error.message });
    }
  },
  {
    name: "oceanbus_remove_contact",
    description: "从通讯录中删除联系人。",
    schema: z.object({
      name: z.string().describe("要删除的联系人名字"),
    }),
  }
);

// ============================================================
// 便捷导出：所有工具打包在一起
// ============================================================

export const oceanbusTools: StructuredTool[] = [
  oceanbusSendTool,
  oceanbusDiscoverTool,
  oceanbusReputationTool,
  oceanbusGetOpenIdTool,
  oceanbusPublishTool,
  oceanbusCheckMailboxTool,
  oceanbusAddContactTool,
  oceanbusListContactsTool,
  oceanbusShowContactTool,
  oceanbusRemoveContactTool,
];

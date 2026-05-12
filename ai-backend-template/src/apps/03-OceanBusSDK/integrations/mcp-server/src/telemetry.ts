/**
 * OceanBus 工具用量统计（Telemetry）
 *
 * 每调用一次工具，计数 +1。存本地文件，每日通过 OceanBus 消息推送统计数据。
 *
 * 隐私设计：
 *   - 只记录工具名字 + 调用时间，不记录参数内容
 *   - 不上报 OpenID、消息内容等任何用户数据
 *   - 符合 OceanBus 宪法第六条"最小化存留"
 *
 * 工作原理：
 *   工具被调用 → record("send_message") → 计数+1 → 每10次存盘
 *   每天定时 → 汇总今天的调用次数 → oceanbus.send(统计平台OpenID, 汇总JSON)
 *
 * 你的 OpenID 会收到这样的消息（JSON格式已格式化）：
 *   {
 *     "report_type": "oceanbus_telemetry_daily",
 *     "agent_id": "01JQRS9XYZ...",
 *     "date": "2026-05-04",
 *     "counts": {
 *       "search_yellow_pages": 89,
 *       "send_message": 72,
 *       "check_mailbox": 45
 *     },
 *     "total": 237,
 *     "source": "mcp-server"  // 或 "langchain"
 *   }
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import type { OceanBus } from "oceanbus";

// ============================================================
// 数据结构
// ============================================================

interface TelemetryData {
  agent_id?: string;                // OceanBus agent ID
  counts: Record<string, number>;    // 工具名 → 累计调用次数
  started_at: string;                // 本次会话开始时间
  last_report_date: string;          // 上次上报的日期（"2026-05-04"格式）
  total_invocations: number;         // 总调用次数
}

interface TelemetryOptions {
  reportOpenid: string;       // 统计数据推送到哪个 OpenID
  source: string;             // 来源标记："mcp-server" 或 "langchain"
  reportHour: number;         // 每天几点上报（0-23），默认 23（晚上11点）
}

// ============================================================
// 核心类
// ============================================================

class Telemetry {
  private data: TelemetryData;
  private filePath: string;
  private options: TelemetryOptions;
  private timer: NodeJS.Timeout | null = null;
  private dirty = false;
  private ob: OceanBus | null = null;

  constructor(options: TelemetryOptions) {
    this.options = options;

    const dir = path.join(os.homedir(), ".oceanbus");
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.filePath = path.join(dir, "telemetry.json");
    this.data = this.load();
    this.scheduleReport();
  }

  // ----------------------------------------------------------
  // 注入 OceanBus 实例 + agentId（OceanBus 初始化后才能调用）
  // ----------------------------------------------------------

  setOceanBus(ob: OceanBus, agentId?: string): void {
    this.ob = ob;
    if (agentId) {
      this.data.agent_id = agentId;
    }
  }

  // ----------------------------------------------------------
  // 记录一次调用
  // ----------------------------------------------------------

  record(toolName: string): void {
    this.data.counts[toolName] = (this.data.counts[toolName] || 0) + 1;
    this.data.total_invocations += 1;
    this.dirty = true;

    if (this.data.total_invocations % 10 === 0) {
      this.save();
    }
  }

  // ----------------------------------------------------------
  // 获取当前统计数据
  // ----------------------------------------------------------

  getStats(): TelemetryData {
    return {
      counts: { ...this.data.counts },
      started_at: this.data.started_at,
      last_report_date: this.data.last_report_date,
      total_invocations: this.data.total_invocations,
    };
  }

  // ----------------------------------------------------------
  // 打印统计（人类可读）
  // ----------------------------------------------------------

  printStats(): string {
    const lines: string[] = [];
    lines.push("");
    lines.push("══════════════════════════════════════════");
    lines.push("  OceanBus 工具用量统计");
    lines.push(`  来源: ${this.options.source}`);
    lines.push(`  数据推送至: ${this.options.reportOpenid}`);
    lines.push("══════════════════════════════════════════");
    lines.push(`  开始统计: ${this.data.started_at}`);
    lines.push(`  总调用次数: ${this.data.total_invocations}`);
    lines.push(`  上次日报: ${this.data.last_report_date || "（尚未推送）"}`);
    lines.push("");

    const entries = Object.entries(this.data.counts).sort(
      (a, b) => b[1] - a[1]
    );

    if (entries.length === 0) {
      lines.push("  (暂无调用记录)");
    } else {
      for (const [name, count] of entries) {
        const bar = this.bar(count, Math.max(...Object.values(this.data.counts)));
        lines.push(`  ${name.padEnd(35)} ${String(count).padStart(6)}  ${bar}`);
      }
    }

    lines.push("══════════════════════════════════════════");
    lines.push("");
    return lines.join("\n");
  }

  // ----------------------------------------------------------
  // 立即推送统计（手动触发）
  // ----------------------------------------------------------

  async flush(): Promise<void> {
    this.save();
    await this.report();
  }

  // ----------------------------------------------------------
  // 停止（退出前调用）
  // ----------------------------------------------------------

  stop(): void {
    this.save();
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  // ============================================================
  // 内部方法
  // ============================================================

  private load(): TelemetryData {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, "utf-8");
        const parsed = JSON.parse(raw);
        return {
          counts: parsed.counts || {},
          started_at: parsed.started_at || new Date().toISOString(),
          last_report_date: parsed.last_report_date || "",
          total_invocations: parsed.total_invocations || 0,
        };
      }
    } catch {
      // 文件损坏
    }
    return {
      counts: {},
      started_at: new Date().toISOString(),
      last_report_date: "",
      total_invocations: 0,
    };
  }

  private save(): void {
    if (!this.dirty) return;
    try {
      fs.writeFileSync(
        this.filePath,
        JSON.stringify(this.data, null, 2),
        "utf-8"
      );
      this.dirty = false;
    } catch {
      // 写盘失败不影响工具调用
    }
  }

  // 计算到下一次上报还需要多少毫秒
  private msUntilNextReport(): number {
    const now = new Date();
    const reportTime = new Date(now);
    reportTime.setHours(this.options.reportHour, 0, 0, 0);
    if (reportTime <= now) {
      // 今天的时间已过，等明天
      reportTime.setDate(reportTime.getDate() + 1);
    }
    return reportTime.getTime() - now.getTime();
  }

  private scheduleReport(): void {
    const delay = this.msUntilNextReport();
    this.timer = setTimeout(() => {
      this.report().catch(() => {});
      // 上报后，每24小时再报一次
      this.timer = setInterval(() => {
        this.report().catch(() => {});
      }, 24 * 60 * 60 * 1000);
    }, delay);
  }

  private async report(): Promise<void> {
    const today = new Date().toISOString().slice(0, 10); // "2026-05-04"

    // 今天已经推送过了，跳过
    if (this.data.last_report_date === today) return;

    // OceanBus 还没注入，不推送（等下次）
    if (!this.ob) return;

    // 今天没有调用，不推送
    if (this.data.total_invocations === 0) return;

    try {
      const report = JSON.stringify(
        {
          report_type: "oceanbus_telemetry_daily",
          source: this.options.source,
          date: today,
          counts: this.data.counts,
          total: this.data.total_invocations,
          agent_id: (this.ob as any).agentId || "unknown",
          started_at: this.data.started_at,
        },
        null,
        2
      );

      // 通过 OceanBus 消息推送（端到端加密，平台不可读）
      await this.ob.send(this.options.reportOpenid, report);

      this.data.last_report_date = today;
      this.save();
    } catch {
      // 推送失败静默处理，明天重试
    }
  }

  // 简易 ASCII 柱状图
  private bar(value: number, max: number): string {
    const width = 20;
    const filled = max === 0 ? 0 : Math.round((value / max) * width);
    return "█".repeat(filled) + "░".repeat(width - filled);
  }
}

// ============================================================
// 单例导出
// ============================================================

let _instance: Telemetry | null = null;

export function getTelemetry(options?: Partial<TelemetryOptions>): Telemetry {
  if (!_instance && options) {
    _instance = new Telemetry(options as TelemetryOptions);
  }
  if (!_instance) {
    throw new Error("Telemetry 尚未初始化，请先调用 getTelemetry({...}) 传入配置");
  }
  return _instance;
}

export { Telemetry };
export type { TelemetryData, TelemetryOptions };

/**
 * OceanBus 工具用量统计（Telemetry）
 *
 * 每调用一次工具，计数 +1。存在本地文件，定期上报。
 *
 * 隐私设计：
 *   - 只记录工具名字 + 调用时间，不记录参数内容
 *   - 不上报 OpenID、消息内容等任何用户数据
 *   - 符合 OceanBus 宪法第六条"最小化存留"
 *
 * 本地文件：~/.oceanbus/telemetry.json
 * 内容示例：
 *   {
 *     "counts": {
 *       "oceanbus_send_message": 127,
 *       "oceanbus_search_yellow_pages": 89,
 *       "oceanbus_publish_to_yellow_pages": 12
 *     },
 *     "started_at": "2026-05-04T10:00:00Z",
 *     "last_report_at": "2026-05-04T23:00:00Z"
 *   }
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// ============================================================
// 数据结构
// ============================================================

interface TelemetryData {
  counts: Record<string, number>;    // 工具名 → 累计调用次数
  started_at: string;                // 本次会话开始时间
  last_report_at: string;            // 上次上报时间
  total_invocations: number;         // 总调用次数
}

interface TelemetryOptions {
  reportUrl?: string;     // 上报地址（目前可选，未来接后台用）
  reportIntervalMs: number; // 上报间隔，默认 1 小时
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

  constructor(options: Partial<TelemetryOptions> = {}) {
    this.options = {
      reportIntervalMs: options.reportIntervalMs ?? 60 * 60 * 1000, // 1小时
      reportUrl: options.reportUrl,
    };

    // 存储路径：~/.oceanbus/telemetry.json
    const dir = path.join(os.homedir(), ".oceanbus");
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.filePath = path.join(dir, "telemetry.json");

    // 加载已有数据（跨重启累积）
    this.data = this.load();

    // 如果服务端有上报地址，定时上报
    if (this.options.reportUrl) {
      this.startReporting();
    }
  }

  // ----------------------------------------------------------
  // 记录一次调用
  // ----------------------------------------------------------

  record(toolName: string): void {
    this.data.counts[toolName] = (this.data.counts[toolName] || 0) + 1;
    this.data.total_invocations += 1;
    this.dirty = true;

    // 每 10 次调用存一次盘（避免频繁写磁盘）
    if (this.data.total_invocations % 10 === 0) {
      this.save();
    }
  }

  // ----------------------------------------------------------
  // 获取当前统计数据（给开发者自己看）
  // ----------------------------------------------------------

  getStats(): TelemetryData {
    return {
      counts: { ...this.data.counts },
      started_at: this.data.started_at,
      last_report_at: this.data.last_report_at,
      total_invocations: this.data.total_invocations,
    };
  }

  // ----------------------------------------------------------
  // 打印统计数据到终端（人类可读）
  // ----------------------------------------------------------

  printStats(): string {
    const lines: string[] = [];
    lines.push("");
    lines.push("══════════════════════════════════════════");
    lines.push("  OceanBus 工具用量统计");
    lines.push("══════════════════════════════════════════");
    lines.push(`  开始统计: ${this.data.started_at}`);
    lines.push(`  总调用次数: ${this.data.total_invocations}`);
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
  // 立即存盘 + 尝试上报
  // ----------------------------------------------------------

  async flush(): Promise<void> {
    this.save();
    if (this.options.reportUrl) {
      await this.report();
    }
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
          last_report_at: parsed.last_report_at || "",
          total_invocations: parsed.total_invocations || 0,
        };
      }
    } catch {
      // 文件损坏或不存在，用默认值
    }
    return {
      counts: {},
      started_at: new Date().toISOString(),
      last_report_at: "",
      total_invocations: 0,
    };
  }

  private save(): void {
    if (!this.dirty) return;
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), "utf-8");
      this.dirty = false;
    } catch {
      // 写盘失败不影响工具调用
    }
  }

  private startReporting(): void {
    this.timer = setInterval(() => {
      this.report().catch(() => {
        // 上报失败静默处理
      });
    }, this.options.reportIntervalMs);
  }

  private async report(): Promise<void> {
    if (!this.options.reportUrl) return;

    try {
      const body = JSON.stringify({
        source: "oceanbus-sdk-integration",
        counts: this.data.counts,
        total_invocations: this.data.total_invocations,
        started_at: this.data.started_at,
        reported_at: new Date().toISOString(),
      });

      // 用 fetch 上报（不依赖任何第三方库）
      await fetch(this.options.reportUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });

      this.data.last_report_at = new Date().toISOString();
      this.save();
    } catch {
      // 网络失败不影响工具调用
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
  if (!_instance) {
    _instance = new Telemetry(options);
  }
  return _instance;
}

export { Telemetry };
export type { TelemetryData, TelemetryOptions };

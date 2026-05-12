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
interface TelemetryData {
    counts: Record<string, number>;
    started_at: string;
    last_report_at: string;
    total_invocations: number;
}
interface TelemetryOptions {
    reportUrl?: string;
    reportIntervalMs: number;
}
declare class Telemetry {
    private data;
    private filePath;
    private options;
    private timer;
    private dirty;
    constructor(options?: Partial<TelemetryOptions>);
    record(toolName: string): void;
    getStats(): TelemetryData;
    printStats(): string;
    flush(): Promise<void>;
    stop(): void;
    private load;
    private save;
    private startReporting;
    private report;
    private bar;
}
export declare function getTelemetry(options?: Partial<TelemetryOptions>): Telemetry;
export { Telemetry };
export type { TelemetryData, TelemetryOptions };

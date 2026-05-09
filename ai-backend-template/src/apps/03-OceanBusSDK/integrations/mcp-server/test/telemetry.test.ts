/**
 * Telemetry 模块轻量测试
 */

import { getTelemetry, Telemetry } from "../src/telemetry.js";

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string) {
  if (condition) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name}`); }
}

async function run() {
  // 首次初始化（需要用配置初始化）
  const t = getTelemetry({
    reportOpenid: "test-openid-abc",
    source: "test",
    reportHour: 23,
  });

  // 1. 计数
  t.record("send_message");
  t.record("send_message");
  t.record("search_yellow_pages");
  t.record("register");

  const s = t.getStats();
  assert(s.counts["send_message"] === 2, "send_message 计数=2");
  assert(s.counts["search_yellow_pages"] === 1, "search_yellow_pages 计数=1");
  assert(s.counts["register"] === 1, "register 计数=1");
  assert(s.total_invocations === 4, "总调用次数=4");

  // 2. getStats 返回副本
  const s2 = t.getStats();
  s2.counts["send_message"] = 999;
  assert(t.getStats().counts["send_message"] === 2, "getStats 副本不影响内部数据");

  // 3. 注入 OB 实例
  t.setOceanBus({ send: async () => {} } as any, "test-agent-001");
  assert((t.getStats() as any).agent_id === "test-agent-001", "agent_id 正确保存");

  // 4. printStats 不抛异常
  const str = t.printStats();
  assert(str.includes("test"), "printStats 包含 source");
  assert(str.includes("send_message"), "printStats 包含工具名");

  // 5. flush 不抛异常
  await t.flush();
  assert(true, "flush 不抛异常");

  // 6. stop 不抛异常
  t.stop();
  assert(true, "stop 不抛异常");

  // 7. 重新初始化（加载本地文件）
  // 重新获取单例（已存在）
  const t2 = getTelemetry();
  assert(t2.getStats().total_invocations === 4, "重新获取单例保持数据");

  console.log(`\n  ${passed + failed} 个测试: ${passed} 通过, ${failed} 失败`);
  return failed === 0;
}

run().then(ok => process.exit(ok ? 0 : 1));

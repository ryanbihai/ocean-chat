# 🌊 健康体检推荐 — 循证体检方案 + 一键转人工

**国家卫建委 2025 指南驱动的个性化体检推荐。AI 完成推荐后，支持转接 ocean-desk 人工坐席协助预约。**

[![ClawHub](https://img.shields.io/badge/ClawHub-health--checkup--recommender-blue)](https://clawhub.ai/skills/health-checkup-recommender)
[![clones](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/ryanbihai/health-checkup-recommender/main/clones.json)](https://github.com/ryanbihai/health-checkup-recommender/graphs/traffic)
[![GitHub stars](https://img.shields.io/github/stars/ryanbihai/health-checkup-recommender)](https://github.com/ryanbihai/health-checkup-recommender)
[![license](https://img.shields.io/badge/license-MIT--0-green)](LICENSE)

---

## 循证医学支撑

所有风险评估和体检项目推荐，均基于权威医学数据：

- **国家卫建委《成人健康体检项目推荐指引（2025 版）》** — 体检项目框架
- **BMJ / JAMA 顶刊文献** — 中国人群慢性病风险模型（2021-2025）
- **国家癌症中心** — 恶性肿瘤风险排序（2022 年中国癌症报告）

每一项推荐都标明出处。不做过度的无根据推销。

## 安装与使用

```bash
openclaw skills install health-checkup-recommender
cd ~/.openclaw/workspace/skills/health-checkup-recommender
npm install
```

对你的 AI 说"我想做体检"，AI 会引导你完成：信息采集 → 风险评估 → 项目推荐 → 生成预约二维码。

## 转人工坐席

体检推荐完成后，客户如需协助预约、改套餐或退款，AI 可通过 ocean-thread/v1 协议转接至 ocean-desk 坐席系统：

```json
{
  "source_skill": "health-checkup-recommender",
  "customer_profile": { "name": "张先生", "age": 45, "city": "北京" },
  "ai_summary": "已完成项目推荐：基础套餐+心血管增强项，总价1200元。客户要求协助预约。",
  "recommended_actions": ["预约体检", "确认心血管增强项"]
}
```

## 相关项目

- [ocean-desk](https://github.com/ryanbihai/ocean-desk) — B 端坐席工单系统（承接转人工）
- [china-top-doctor-referral](https://clawhub.ai/skills/china-top-doctor-referral) — 三甲专家推荐
- [OceanBus SDK](https://www.npmjs.com/package/oceanbus) — 核心基础设施
- [Ocean Chat](https://clawhub.ai/skills/ocean-chat) — P2P 消息 + 通讯录

## License

MIT-0

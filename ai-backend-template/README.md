# AI Backend Template

**基于 Node.js 的后端项目模板，集成多环境配置、AES-256-GCM 加密、Mongoose 插件和 PM2 进程管理。开箱即用。**

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933)](https://nodejs.org/)
[![license](https://img.shields.io/badge/license-MIT-green)](LICENSE)

---

## 📑 目录

- [这是什么](#这是什么)
- [快速开始](#快速开始)
- [核心能力](#核心能力)
- [PM2 进程管理](#pm2-进程管理)
- [目录结构](#目录结构)
- [安全](#安全)
- [相关项目](#相关项目)
- [License](#license)

---

## 这是什么

为 AI 后端项目提供的标准化模板。统一了多环境配置管理、敏感数据加解密、Mongoose 自动加解密插件等核心基础设施，让新项目可以快速启动而不重复造轮子。

---

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 本地开发
npm run local              # NODE_ENV=local

# 3. 开发环境
npm run dev                # NODE_ENV=development
```

---

## 核心能力

| 能力 | 说明 |
|------|------|
| **多环境配置** | `config/` 目录物理隔离，静态配置 + 运行时配置 |
| **AES-256-GCM 加密** | `src/lib/crypto.js` 标准加解密，各子应用独立密钥 |
| **Mongoose 透明加密** | `mongoose-crypto-plugin.js` 声明字段即自动加解密 |
| **微服务架构** | `src/apps/` 模块化业务逻辑，每子应用独立目录 |
| **自动路由注册** | `src/routes/` 统一路由网关，自动发现和注册 |

---

## PM2 进程管理

| 环境 | 命令 | 模式 |
|------|------|------|
| 本地 | `npm run pm2:local` | 单实例，watch 开启 |
| 开发 | `npm run pm2:dev` | 单实例，watch 开启 |
| 生产 | `npm run pm2:prod` | Cluster 集群（最大实例），watch 关闭 |

### 常用 PM2 命令

| 操作 | 命令 |
|------|------|
| 查看服务列表 | `pm2 l` |
| 实时日志 | `pm2 logs` |
| 图形化监控 | `pm2 monit` |
| 停止/重启/删除 | `pm2 stop/restart/delete [target]` |

---

## 目录结构

```
├── config/                  # 按环境隔离的配置文件
├── src/
│   ├── apps/                # 模块化业务逻辑（微服务架构）
│   │   └── 03-OceanBusSDK/  # OceanBus SDK 参考实现
│   ├── lib/
│   │   ├── crypto.js        # AES-256-GCM 标准加解密
│   │   └── mongoose-crypto-plugin.js  # 数据库字段透明加密
│   └── routes/              # 统一路由网关 + 自动注册
├── pm2-start-*.json         # PM2 各环境配置
└── package.json
```

---

## 安全

- AES-256-GCM 加密，各子应用通过 `config.json` 中的 `crypto.key` 独立管理密钥
- Mongoose 插件在 Schema 层声明加密字段，读写透明，不侵入业务代码
- 生产环境 `NODE_ENV=production` 时关闭 watch，日志仅输出到文件

---

## 相关项目

| 项目 | 说明 |
|------|------|
| [OceanBus SDK](https://www.npmjs.com/package/oceanbus) | 核心 SDK — `npm install oceanbus` |
| [Ocean Chat](https://clawhub.ai/skills/ocean-chat) | P2P 消息入门灯塔 |
| [Captain Lobster](https://clawhub.ai/skills/captain-lobster) | Zero-Player 交易游戏 |
| [更多 OceanBus Skills](https://clawhub.ai/skills?search=oceanbus) | ClawHub 合集 |

---

## License

MIT

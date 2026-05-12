/**
 * @file router.js (04-YellowPageSvc)
 * @description HTTP 管理路由——仅用于运维/调试，不是黄页的业务 API
 */

const { interceptRouters, METHODS: { GET, POST } } = require('../../lib/routerlib')
const agent = require('./agent')
const { YellowPageEntry } = require('./models')

module.exports = expressRouter => {
  // 服务启动时自动拉起 L0 Agent 轮询
  agent.start()

  interceptRouters({
    expressRouter,
    routers: {
      '': [
        ['healthcheck', GET, () => {
          const status = agent.getStatus()
          return {
            code: 0,
            data: {
              ...status,
              app: 'YellowPageSvc',
              version: '1.0.0'
            }
          }
        }],
        ['stats', GET, async () => {
          const total = await YellowPageEntry.countDocuments()
          const recent = await YellowPageEntry.countDocuments({
            last_heartbeat: { $gte: new Date(Date.now() - 24 * 3600 * 1000) }
          })
          return { code: 0, data: { total_entries: total, active_24h: recent } }
        }],
        ['entries', GET, async ({ page, limit }) => {
          const p = Math.max(parseInt(page) || 1, 1)
          const l = Math.min(Math.max(parseInt(limit) || 20, 1), 100)
          const skip = (p - 1) * l
          const [entries, total] = await Promise.all([
            YellowPageEntry.find().sort({ registered_at: -1 }).skip(skip).limit(l).lean(),
            YellowPageEntry.countDocuments()
          ])
          return { code: 0, data: { entries, total, page: p, limit: l } }
        }]
      ]
    }
  })
}

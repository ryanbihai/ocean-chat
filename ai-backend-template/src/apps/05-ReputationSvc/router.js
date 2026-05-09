/**
 * @file router.js (05-ReputationSvc)
 * @description HTTP 管理路由——仅用于运维/调试，不是声誉服务的业务 API
 */

const { interceptRouters, METHODS: { GET } } = require('../../lib/routerlib')
const agent = require('./agent')
const { ReputationTag } = require('./models')

module.exports = expressRouter => {
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
              app: 'ReputationSvc',
              version: '1.0.0'
            }
          }
        }],
        ['stats', GET, async () => {
          const total = await ReputationTag.countDocuments()
          const recent = await ReputationTag.countDocuments({
            created_at: { $gte: new Date(Date.now() - 24 * 3600 * 1000) }
          })
          const uniqueTargets = await ReputationTag.distinct('to_uuid')
          const uniqueTaggers = await ReputationTag.distinct('from_uuid')
          return {
            code: 0,
            data: {
              total_tags: total,
              tags_24h: recent,
              unique_targets: uniqueTargets.length,
              unique_taggers: uniqueTaggers.length
            }
          }
        }]
      ]
    }
  })
}

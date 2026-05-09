/**
 * @file router.js (07-PublicStats)
 * @description OceanBus 公开看板 API — 聚合龙虾船长 + 黄页数据，供主页 fetch
 *
 * 路由：
 *   GET  /api/public/stats     — 聚合统计
 *   GET  /api/public/health    — 存活探测
 *   POST /api/public/telemetry — MCP/LangChain 遥测上报
 *   GET  /api/public/telemetry — 读取遥测数据
 */

const mongoose = require('mongoose')
const fs = require('fs')
const path = require('path')

const TELEMETRY_FILE = path.join(__dirname, 'telemetry.json')

const CITIES = {
  canton: '广州', calicut: '卡利卡特', zanzibar: '桑给巴尔', alexandria: '亚历山大',
  venice: '威尼斯', lisbon: '里斯本', london: '伦敦', amsterdam: '阿姆斯特丹',
  istanbul: '伊斯坦布尔', genoa: '热那亚'
}

module.exports = router => {
  router.get('/health', async (req, res) => {
    res.json({ ok: true, ts: Date.now() })
  })

  router.get('/stats', async (req, res) => {
    try {
      const now = Date.now()
      const dayAgo = new Date(now - 24 * 60 * 60 * 1000)
      const todayStart = new Date(now)
      todayStart.setHours(0, 0, 0, 0)

      // ── 龙虾船长 ──────────────────────────────────
      const [players, contracts, trades24h, todayTrades] = await Promise.all([
        mongoose.model('Player').find({ deleted: { $ne: true } }).lean(),
        mongoose.model('Contract').find({ status: 'pending' }).lean(),
        mongoose.model('Trade').countDocuments({ createDate: { $gte: dayAgo } }),
        mongoose.model('Trade').find({ createDate: { $gte: todayStart } }).lean()
      ])

      const docked = players.filter(p => p.status === 'docked')
      const sailing = players.filter(p => p.status === 'sailing')
      const active24h = players.filter(p => p.lastActionAt && new Date(p.lastActionAt) >= dayAgo)

      let totalGold = 0
      for (const p of players) totalGold += p.gold || 0

      const cityDist = {}
      for (const p of players) {
        const c = p.currentCity || 'unknown'
        cityDist[c] = (cityDist[c] || 0) + 1
      }

      const cargoTotal = {}
      for (const p of players) {
        for (const [item, qty] of Object.entries(p.cargo || {})) {
          if (qty && qty > 0) cargoTotal[item] = (cargoTotal[item] || 0) + qty
        }
      }

      let todayTradeGold = 0, todayBuyCount = 0, todaySellCount = 0
      const itemVolumes = {}
      for (const t of todayTrades || []) {
        todayTradeGold += t.totalPrice || 0
        if (t.type === 'npc') {
          if (t.buyerOpenid !== 'npc') todayBuyCount++
          else todaySellCount++
        } else {
          todayBuyCount++
        }
        const item = t.item || 'unknown'
        itemVolumes[item] = (itemVolumes[item] || 0) + (t.amount || 0)
      }

      const topGold = players
        .sort((a, b) => (b.gold || 0) - (a.gold || 0))
        .slice(0, 10)
        .map(p => ({
          name: p.name,
          gold: p.gold,
          city: CITIES[p.currentCity] || p.currentCity,
          status: p.status
        }))

      const lobster = {
        players: {
          total: players.length,
          active24h: active24h.length,
          docked: docked.length,
          sailing: sailing.length,
          totalGold,
          avgGold: players.length ? Math.round(totalGold / players.length) : 0,
          topGold,
          cityDist
        },
        economy: {
          todayTradeGold,
          todayTradeCount: todayBuyCount + todaySellCount,
          totalTrades24h: trades24h,
          itemVolumes,
          cargoTotal
        },
        contracts: {
          active: contracts.length,
          total: await mongoose.model('Contract').countDocuments(),
          completed: await mongoose.model('Contract').countDocuments({ status: 'completed' })
        }
      }

      // ── Yellow Pages ──────────────────────────────
      let yp = { total: 0, active24h: 0, topTags: [] }
      try {
        const YpEntry = mongoose.models.YellowPageEntry
        if (YpEntry) {
          const [ypTotal, ypActive] = await Promise.all([
            YpEntry.countDocuments(),
            YpEntry.countDocuments({ last_heartbeat: { $gte: dayAgo } })
          ])

          const tagAgg = await YpEntry.aggregate([
            { $unwind: '$tags' },
            { $group: { _id: '$tags', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 15 }
          ])

          yp = {
            total: ypTotal,
            active24h: ypActive,
            topTags: tagAgg.map(t => ({ tag: t._id, count: t.count }))
          }
        }
      } catch (e) {
        yp.error = e.message
      }

      res.json({
        code: 0,
        data: { lobster, yellowPages: yp },
        ts: now
      })
    } catch (e) {
      res.json({ code: 500, msg: e.message })
    }
  })

  // ── 遥测：接收 MCP / LangChain 每日用量上报 ──
  router.post('/telemetry', (req, res) => {
    try {
      const { report_type, source, date, counts, total, agent_id } = req.body
      if (!source || !date || !counts) {
        return res.json({ code: 1001, msg: '缺少 source/date/counts 字段' })
      }
      let all = loadTelemetry()
      all.push({ source, date, counts, total, agent_id, received_at: new Date().toISOString() })
      // 只保留最近 100 条
      if (all.length > 100) all = all.slice(-100)
      fs.writeFileSync(TELEMETRY_FILE, JSON.stringify(all, null, 2), 'utf-8')
      res.json({ code: 0, msg: 'ok' })
    } catch (e) {
      res.json({ code: 500, msg: e.message })
    }
  })

  router.get('/telemetry', (req, res) => {
    try {
      const all = loadTelemetry()
      // 汇总：每个 source 的累计数据
      const summary = {}
      for (const r of all) {
        if (!summary[r.source]) {
          summary[r.source] = { total_invocations: 0, reports: 0, last_date: null, tool_counts: {} }
        }
        const s = summary[r.source]
        s.total_invocations += r.total || 0
        s.reports += 1
        s.last_date = r.date
        for (const [tool, count] of Object.entries(r.counts || {})) {
          s.tool_counts[tool] = (s.tool_counts[tool] || 0) + count
        }
      }
      res.json({ code: 0, data: { summary, raw: all.slice(-20) } })
    } catch (e) {
      res.json({ code: 500, msg: e.message })
    }
  })
}

function loadTelemetry() {
  try {
    if (fs.existsSync(TELEMETRY_FILE)) {
      return JSON.parse(fs.readFileSync(TELEMETRY_FILE, 'utf-8'))
    }
  } catch { /* ignore */ }
  return []
}

/**
 * @file router.js (09-DashboardBot)
 * @description OceanBus Dashboard Agent — 接收 OceanBus 消息，返回看板数据
 *
 * OpenClaw → OceanBus 消息 → 本 Agent → 拉取 GitHub/npm/ClawHub/L1Proxy → 返回摘要
 *
 * 支持的指令:
 *   看板              → 完整报告
 *   看板 short        → 精简版
 *   看板 6h           → 过去6小时变化
 *   看板 ocean-chat   → 只看 ocean-chat
 *   看板 ocean-chat 6h → 组合筛选
 *   help              → 帮助
 */
const path = require('path')
const fs = require('fs')
const request = require('superagent')
const { INFO, ERROR, WARN } = require('../../lib/logSvc.js')(__filename)
const { interceptRouters, METHODS: { GET } } = require('../../lib/routerlib')
const OceanBus = require('../../lib/oceanbus')

const config = require('./config.json')
const GH_TOKEN = config.github_token || process.env.GH_TOKEN || ''
const CH_TOKEN = config.clawhub_token || process.env.CH_TOKEN || ''
const GH_DAYS = 5
const STATE_FILE = path.join(__dirname, 'agent-state.json')
const SNAPSHOT_FILE = path.join(__dirname, 'snapshots.json')
const SNAPSHOT_INTERVAL_MS = 30 * 60 * 1000 // 30分钟一个快照
const MAX_SNAPSHOTS = 96 // 保留48小时

// ── 数据源配置 ──

const GITHUB_REPOS = [
  { owner: 'ryanbihai', repo: 'ocean-chat', label: 'ocean-chat' },
  { owner: 'ryanbihai', repo: 'ocean-agent', label: 'ocean-agent' },
  { owner: 'ryanbihai', repo: 'captain-lobster', label: 'captain-lobster' },
  { owner: 'ryanbihai', repo: 'health-checkup-recommender', label: 'health-checkup' },
]

// 全部 ClawHub skill（不截断）
const CLAWHUB_SKILLS = [
  'health-checkup-recommender', 'captain-lobster', 'china-top-doctor-referral',
  'my-companion', 'chinese-interest-rate',
  'ocean-chat', 'ocean-agent', 'guess-ai',
]

const NPM_PACKAGES = ['oceanbus', 'oceanbus-mcp-server', 'oceanbus-langchain']

// ── 名称别名（模糊匹配） ──

const NAME_ALIASES = {
  'oceanchat': 'ocean-chat', 'ocean chat': 'ocean-chat',
  'oceanagent': 'ocean-agent', 'ocean agent': 'ocean-agent',
  'captainlobster': 'captain-lobster', 'lobster': 'captain-lobster', '龙虾': 'captain-lobster', '龙虾船长': 'captain-lobster',
  'guessai': 'guess-ai', 'guess ai': 'guess-ai', '猜ai': 'guess-ai', '猜猜': 'guess-ai',
  'healthcheckup': 'health-checkup-recommender', 'health': 'health-checkup-recommender', '体检': 'health-checkup-recommender',
  'chinadoctor': 'china-top-doctor-referral', 'doctor': 'china-top-doctor-referral', '名医': 'china-top-doctor-referral',
  'mycompanion': 'my-companion', 'companion': 'my-companion', '伴侣': 'my-companion',
  'interestrate': 'chinese-interest-rate', '利率': 'chinese-interest-rate',
  'oceanbus-mcp': 'oceanbus-mcp-server', 'mcp': 'oceanbus-mcp-server', 'mcp-server': 'oceanbus-mcp-server',
  'langchain': 'oceanbus-langchain', 'oceanbus-lang': 'oceanbus-langchain',
}

// 所有可查询的名称集合
const ALL_NAMES = new Set([
  ...GITHUB_REPOS.map(r => r.label),
  ...CLAWHUB_SKILLS,
  ...NPM_PACKAGES,
  'health-checkup-recommender',
])

function resolveName(input) {
  const key = input.toLowerCase().replace(/[-_\s]+/g, '')
  return NAME_ALIASES[key] || input.toLowerCase()
}

// ── API 请求 ──

async function fetchGitHubClones(owner, repo) {
  if (!GH_TOKEN) return null
  const res = await request
    .get(`https://api.github.com/repos/${owner}/${repo}/traffic/clones`)
    .set('Authorization', `Bearer ${GH_TOKEN}`)
    .set('User-Agent', 'OceanBus-DashboardBot')
    .timeout(10000)
    .ok(() => true)
  return res.ok ? res.body : null
}

async function fetchClawHubSkill(slug) {
  const headers = {}
  if (CH_TOKEN) headers.Authorization = `Bearer ${CH_TOKEN}`
  const res = await request
    .get(`https://clawhub.ai/api/v1/skills/${slug}`)
    .set(headers)
    .timeout(10000)
    .ok(() => true)
  return res.ok ? res.body : null
}

async function fetchNpmDownloads(pkg) {
  const end = new Date()
  const start = new Date(end)
  start.setDate(start.getDate() - 6)
  const res = await request
    .get(`https://api.npmjs.org/downloads/range/${start.toISOString().slice(0, 10)}:${end.toISOString().slice(0, 10)}/${pkg}`)
    .timeout(10000)
    .ok(() => true)
  if (!res.ok) return null
  return res.body
}

async function fetchL1ProxyStats() {
  const res = await request
    .get(`${config.l1proxy_url}/stats`)
    .timeout(8000)
    .ok(() => true)
  return res.ok ? res.body : null
}

// ── 数据聚合 ──

async function gatherAllStats() {
  const results = { github: [], npm: [], clawhub: [], l1proxy: null, errors: [], ts: Date.now() }

  if (GH_TOKEN) {
    const ghResults = await Promise.allSettled(
      GITHUB_REPOS.map(r =>
        fetchGitHubClones(r.owner, r.repo).then(data => ({ ...r, data }))
      )
    )
    for (const r of ghResults) {
      if (r.status === 'fulfilled' && r.value.data) results.github.push(r.value)
      else results.errors.push(`gh:${r.status === 'fulfilled' ? r.value.label : '?'}`)
    }
  }

  const npmResults = await Promise.allSettled(
    NPM_PACKAGES.map(pkg => fetchNpmDownloads(pkg).then(data => ({ pkg, data })))
  )
  for (const r of npmResults) {
    if (r.status === 'fulfilled' && r.value.data) results.npm.push(r.value)
    else results.errors.push(`npm:${r.status === 'fulfilled' ? r.value.pkg : '?'}`)
  }

  // 拉取全部 ClawHub skill
  const chResults = await Promise.allSettled(
    CLAWHUB_SKILLS.map(slug => fetchClawHubSkill(slug).then(data => ({ slug, data })))
  )
  for (const r of chResults) {
    if (r.status === 'fulfilled' && r.value.data?.skill) results.clawhub.push(r.value)
  }

  try { results.l1proxy = await fetchL1ProxyStats() } catch { results.errors.push('l1proxy') }

  return results
}

// ── 快照 ──

function normalizeForSnapshot(r) {
  const snap = {}
  for (const repo of r.github) {
    snap[`gh:${repo.label}`] = repo.data?.count || 0
  }
  for (const p of r.npm) {
    const total = (p.data?.downloads || []).reduce((s, d) => s + (d.downloads || 0), 0)
    snap[`npm:${p.pkg}`] = total
  }
  for (const s of r.clawhub) {
    snap[`ch:${s.slug}`] = s.data?.skill?.stats?.downloads || 0
  }
  if (r.l1proxy?.code === 0) {
    for (const [key, c] of Object.entries(r.l1proxy.data?.counters || {})) {
      snap[`dify:${key}`] = c.count || 0
    }
  }
  return snap
}

function saveSnapshot(r) {
  try {
    let snapshots = []
    if (fs.existsSync(SNAPSHOT_FILE)) {
      snapshots = JSON.parse(fs.readFileSync(SNAPSHOT_FILE, 'utf-8'))
    }
    snapshots.push({ ts: new Date().toISOString(), data: normalizeForSnapshot(r) })
    // 只保留最近 N 个
    if (snapshots.length > MAX_SNAPSHOTS) snapshots = snapshots.slice(-MAX_SNAPSHOTS)
    fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify(snapshots))
  } catch (e) {
    WARN(`DashboardBot: 快照保存失败: ${e.message}`)
  }
}

function findSnapshot(hoursAgo) {
  try {
    if (!fs.existsSync(SNAPSHOT_FILE)) return null
    const snapshots = JSON.parse(fs.readFileSync(SNAPSHOT_FILE, 'utf-8'))
    if (!snapshots.length) return null
    const target = Date.now() - hoursAgo * 3600 * 1000
    let best = null
    let bestDiff = Infinity
    for (const s of snapshots) {
      const diff = Math.abs(new Date(s.ts).getTime() - target)
      if (diff < bestDiff) { bestDiff = diff; best = s }
    }
    // 快照偏差超过目标时长的50%就不准了
    if (best && bestDiff < hoursAgo * 3600 * 1000 * 0.5) return best
    return best // 即使偏差大也返回最近的，让用户知道
  } catch {
    return null
  }
}

// ── CLI 命令解析 ──
// 端侧 LLM 读取 help → 理解语法 → 拼出结构化命令 → DashboardBot 执行
// 兼容自然语言作为 fallback

const TRIGGERS = /^(show|dashboard|看板|stats|数据|status|help|\/help|帮助|version|ver|版本|看\b|查\b)/i
const NATURAL_HINTS = /(下载|情况|数据|变化|涨了|看看|帮我|查询)/

function shouldProcess(content) {
  const text = (content || '').trim()
  return TRIGGERS.test(text) || NATURAL_HINTS.test(text)
}

function parseQuery(content) {
  const text = (content || '').trim()
  const result = {
    command: 'show',       // 'show' | 'help' | 'version'
    isShort: false,
    timeRangeHours: 0,
    filterNames: [],
    helpTopic: null,
  }

  // ── help [subcommand] ──
  if (/^(help|\/help|帮助)/i.test(text)) {
    result.command = 'help'
    const parts = text.split(/\s+/)
    if (parts.length > 1) result.helpTopic = parts.slice(1).join(' ')
    return result
  }

  // ── version ──
  if (/^(version|ver|版本|--version|-v)$/i.test(text)) {
    result.command = 'version'
    return result
  }

  // ── show [flags] [自然语言fallback] ──
  if (/^(show|dashboard|看板|stats|数据|status|看\b|查\b)/i.test(text) || NATURAL_HINTS.test(text)) {
    result.command = 'show'

    // 结构化标志: -s, --short
    result.isShort = /-s\b|--short|short|短|简/i.test(text)

    // 结构化标志: -h N, --hours=N
    let hMatch = text.match(/-h\s*(\d+)|--hours[=\s]*(\d+)/i)
    if (hMatch) {
      result.timeRangeHours = parseInt(hMatch[1] || hMatch[2], 10)
    }
    // 自然语言 fallback: N小时, Nh
    if (!result.timeRangeHours) {
      hMatch = text.match(/(\d+)\s*(h|小时)/i)
      if (hMatch) result.timeRangeHours = parseInt(hMatch[1], 10)
    }

    // 结构化标志: -f name1,name2, --filter=name1,name2
    let fMatch = text.match(/-f\s+([\w\-,一-鿿]+)|--filter[=\s]+([\w\-,一-鿿]+)/i)
    if (fMatch) {
      const names = (fMatch[1] || fMatch[2]).split(/[,，]/)
      for (const n of names) {
        const resolved = resolveName(n.trim())
        if (resolved) result.filterNames.push(resolved)
      }
    }
    // 自然语言 fallback: 名称匹配
    if (!result.filterNames.length) {
      const lowerText = text.toLowerCase()
      for (const name of ALL_NAMES) {
        if (lowerText.includes(name.toLowerCase())) result.filterNames.push(name)
      }
      for (const [alias, canonical] of Object.entries(NAME_ALIASES)) {
        if (lowerText.includes(alias.toLowerCase()) && !result.filterNames.includes(canonical)) {
          result.filterNames.push(canonical)
        }
      }
    }

    return result
  }

  return result
}

// ── 数据筛选 ──

function filterResults(r, names) {
  if (!names.length) return r
  const nameSet = new Set(names.map(n => n.toLowerCase()))
  return {
    github: r.github.filter(repo => nameSet.has(repo.label.toLowerCase())),
    npm: r.npm.filter(p => nameSet.has(p.pkg.toLowerCase())),
    clawhub: r.clawhub.filter(s => nameSet.has(s.slug.toLowerCase())),
    l1proxy: r.l1proxy,
    errors: r.errors,
  }
}

// ── 格式化 ──

function deltaStr(current, previous) {
  if (previous == null || previous === 0) return ''
  const diff = current - previous
  if (diff > 0) return ` ↑${diff}`
  if (diff < 0) return ` ↓${Math.abs(diff)}`
  return ' →0'
}

function formatStats(r, prevSnap, hours) {
  const lines = []
  const title = hours > 0 ? `📊 OceanBus 看板 (近${hours}小时变化)` : '📊 OceanBus 看板'
  lines.push(title); lines.push('')

  const prev = prevSnap?.data || {}

  // GitHub
  const ghFiltered = r.github.filter(repo => repo.data)
  if (ghFiltered.length) {
    lines.push('── GitHub Clone ──')
    for (const repo of ghFiltered) {
      const d = repo.data
      const recent = (d.clones || []).slice(-GH_DAYS)
      const recentTotal = recent.reduce((s, c) => s + (c.count || 0), 0)
      const prevCount = prev[`gh:${repo.label}`]
      const delta = deltaStr(d.count || 0, prevCount)
      lines.push(`  ${repo.label}: 总${(d.count || 0).toLocaleString()}${delta} | 近${GH_DAYS}日+${recentTotal} | 访客${(d.uniques || 0).toLocaleString()}`)
    }
    lines.push('')
  }

  // npm
  const npmFiltered = r.npm.filter(p => p.data)
  if (npmFiltered.length) {
    lines.push('── npm 安装量 (7日) ──')
    for (const p of npmFiltered) {
      const total = (p.data.downloads || []).reduce((s, d) => s + (d.downloads || 0), 0)
      const avg = Math.round(total / Math.max((p.data.downloads || []).length, 1))
      const prevTotal = prev[`npm:${p.pkg}`]
      const delta = deltaStr(total, prevTotal)
      lines.push(`  ${p.pkg}: ${total.toLocaleString()}${delta} (日均${avg.toLocaleString()})`)
    }
    lines.push('')
  }

  // ClawHub
  if (r.clawhub.length) {
    lines.push('── ClawHub 下载 ──')
    for (const s of r.clawhub) {
      const st = s.data.skill.stats
      const prevDl = prev[`ch:${s.slug}`]
      const delta = deltaStr(st.downloads || 0, prevDl)
      lines.push(`  ${s.data.skill.displayName || s.slug}: ${(st.downloads || 0).toLocaleString()}↓${delta} ⭐${st.stars || 0}`)
    }
    lines.push('')
  }

  // L1Proxy
  if (r.l1proxy && r.l1proxy.code === 0) {
    const d = r.l1proxy.data
    const uptime = Math.round((d.uptime_ms || 0) / 60000)
    lines.push('── Dify L1Proxy ──')
    lines.push(`  运行: ${uptime}min`)
    for (const [key, c] of Object.entries(d.counters || {})) {
      const label = key === 'yellow-pages-discover' ? 'Yellow Pages' : 'Reputation'
      const prevCount = prev[`dify:${key}`]
      const delta = deltaStr(c.count, prevCount)
      lines.push(`  ${label}: ${c.count}次${delta}`)
    }
    lines.push('')
  }

  if (r.errors.length) lines.push(`⚠ 部分失败: ${r.errors.join(', ')}`)

  const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
  lines.push(`刷新: ${now}`)
  if (prevSnap?.ts) {
    lines.push(`对比基准: ${new Date(prevSnap.ts).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`)
  }

  return lines.join('\n')
}

function formatShortStats(r, prevSnap, hours) {
  const lines = []
  const label = hours > 0 ? `📊 OceanBus (近${hours}h变化)` : '📊 OceanBus 实时数据'
  lines.push(label)
  const prev = prevSnap?.data || {}

  const ghLine = r.github.filter(repo => repo.data).map(repo => {
    const recent = (repo.data.clones || []).slice(-GH_DAYS)
    const rt = recent.reduce((s, c) => s + (c.count || 0), 0)
    const d = deltaStr(repo.data?.count || 0, prev[`gh:${repo.label}`])
    return `${repo.label}+${rt}${d}`
  }).join(' ')
  if (ghLine) lines.push(`GitHub(${GH_DAYS}d): ${ghLine}`)

  const npmLine = r.npm.filter(p => p.data).map(p => {
    const t = (p.data.downloads || []).reduce((s, d) => s + (d.downloads || 0), 0)
    const d = deltaStr(t, prev[`npm:${p.pkg}`])
    return `${p.pkg.split('-').pop()}+${t}${d}`
  }).join(' ')
  if (npmLine) lines.push(`npm(7d): ${npmLine}`)

  const chLine = r.clawhub.map(s => {
    const st = s.data.skill.stats
    const d = deltaStr(st.downloads || 0, prev[`ch:${s.slug}`])
    return `${s.slug}+${st.downloads || 0}${d}`
  }).join(' ')
  if (chLine) lines.push(`ClawHub: ${chLine}`)

  return lines.join('\n')
}

// ── help / version ──

function formatHelp(topic) {
  if (topic && topic.includes('show')) return formatHelpShow()

  try {
    const snapFile = fs.existsSync(SNAPSHOT_FILE)
    const snaps = snapFile ? JSON.parse(fs.readFileSync(SNAPSHOT_FILE, 'utf-8')) : []
    const oldest = snaps.length ? snaps[0].ts.slice(0, 16) : '无'
    const newest = snaps.length ? snaps[snaps.length - 1].ts.slice(0, 16) : '无'
    return `NAME
  dashboard — OceanBus 数据看板查询

SYNOPSIS
  show              完整报告
  show -s           精简版 (一行一个数据)
  show -h 6         过去6小时变化量
  show -f <names>   按名称筛选
  show -s -f guess-ai -h 3   组合
  help              本帮助
  help show         show 命令详解
  version           版本与快照状态

EXAMPLES
  show                              # 全部数据
  show -s                           # 精简版
  show -h 6                         # 过去6h变化
  show -f ocean-chat                # 只看一个
  show -f ocean-chat,guess-ai       # 多个 (逗号分隔)
  show -s -f guess-ai -h 12        # 组合

  快照: ${snaps.length} 个 | ${oldest} … ${newest}`
  } catch { return 'DashboardBot CLI v2.0.0' }
}

function formatHelpShow() {
  return `show — 查询 OceanBus 看板数据

SYNOPSIS
  show [-s] [-h N] [-f names]

FLAGS
  -s, --short     精简版输出 (一行一个平台)
  -h, --hours N   对比 N 小时前快照，显示变化量
  -f, --filter S  筛选名称 (逗号分隔，支持别名)

FILTER 别名
  lobster, 龙虾          → captain-lobster
  oceanchat              → ocean-chat
  guessai, 猜猜           → guess-ai
  mcp                    → oceanbus-mcp-server
  利率                    → chinese-interest-rate
  体检                    → health-checkup-recommender

OUTPUT
  无 -s:   分组展示 GitHub/npm/ClawHub/L1Proxy
  -s:      每个平台一行，适合贴到 Moltbook
  -h N:    每行末尾追加 ↑N 或 ↓N 的变化量`
}

function formatVersion() {
  try {
    const snapFile = fs.existsSync(SNAPSHOT_FILE)
    const snaps = snapFile ? JSON.parse(fs.readFileSync(SNAPSHOT_FILE, 'utf-8')) : []
    return `DashboardBot CLI v2.0.0
  运行中 | 快照: ${snaps.length} 个 (间隔30min, 保留48h)
  最早: ${snaps.length ? snaps[0].ts.slice(0, 19) : '无'}
  最新: ${snaps.length ? snaps[snaps.length-1].ts.slice(0, 19) : '无'}`
  } catch {
    return 'DashboardBot CLI v2.0.0'
  }
}

// ── 消息处理 ──

async function handleMessage(ob, msg) {
  const content = (msg.content || '').trim()
  INFO(`DashboardBot: ← ${msg.from_openid?.slice(0, 12)}... "${content.slice(0, 60)}"`)

  const query = parseQuery(content)

  // ── help ──
  if (query.command === 'help') {
    const reply = formatHelp(query.helpTopic)
    const result = await ob.sendMessage(msg.from_openid, reply)
    INFO(`DashboardBot: → help (${reply.length} chars) code=${result.code}`)
    return
  }

  // ── version ──
  if (query.command === 'version') {
    const reply = formatVersion()
    const result = await ob.sendMessage(msg.from_openid, reply)
    INFO(`DashboardBot: → version (${reply.length} chars) code=${result.code}`)
    return
  }

  // ── show ──
  const stats = await gatherAllStats()
  const filtered = filterResults(stats, query.filterNames)

  let prevSnap = null
  if (query.timeRangeHours > 0) {
    prevSnap = findSnapshot(query.timeRangeHours)
  }

  const reply = query.isShort
    ? formatShortStats(filtered, prevSnap, query.timeRangeHours)
    : formatStats(filtered, prevSnap, query.timeRangeHours)

  const result = await ob.sendMessage(msg.from_openid, reply)
  INFO(`DashboardBot: → reply (${reply.length} chars) code=${result.code}`)
}

// ── Agent 生命周期 ──

async function startAgent() {
  const ob = new OceanBus()

  if (fs.existsSync(STATE_FILE)) {
    try {
      const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'))
      if (state.agentId && state.openid && state.apiKey) {
        ob.restoreFromConfig(state.agentId, state.openid, state.apiKey)
        const valid = await ob.validateApiKey()
        if (valid) {
          INFO(`DashboardBot: 身份已恢复 openid=${state.openid?.slice(0, 16)}...`)
        } else {
          WARN('DashboardBot: 已存身份失效，重新注册')
          fs.unlinkSync(STATE_FILE)
        }
      }
    } catch (e) { WARN(`DashboardBot: 读取状态失败: ${e.message}`) }
  }

  if (!ob.isReady()) {
    INFO('DashboardBot: 正在注册 OceanBus 身份...')
    const result = await ob.register()
    if (result.code !== 0) {
      ERROR(`DashboardBot: 注册失败: ${JSON.stringify(result)}`)
      return null
    }
    const state = { agentId: ob.agentId, openid: ob.openid, apiKey: ob.apiKey }
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2))
    INFO(`DashboardBot: 注册成功 openid=${ob.openid?.slice(0, 16)}...`)
  }

  // 启动消息轮询
  let sinceSeq = 0
  INFO(`DashboardBot: 开始轮询 (间隔${config.poll_interval_ms}ms)`)

  const pollTimer = setInterval(async () => {
    try {
      const result = await ob.syncMessages(sinceSeq)
      if (result.code !== 0) return
      const messages = result.data?.messages || []
      for (const msg of messages) {
        sinceSeq = Math.max(sinceSeq, msg.seq_id || 0)
        if (shouldProcess(msg.content)) {
          await handleMessage(ob, msg)
        }
      }
    } catch { /* 静默重试 */ }
  }, config.poll_interval_ms)

  // 定时快照
  let lastSnapshot = null
  setInterval(async () => {
    try {
      const r = await gatherAllStats()
      saveSnapshot(r)
      lastSnapshot = new Date().toISOString()
    } catch (e) { WARN(`DashboardBot: 快照失败: ${e.message}`) }
  }, SNAPSHOT_INTERVAL_MS)

  return { ob, pollTimer }
}

// ── 启动 ──

let agentReady = false
let agentOpenid = 'initializing...'
startAgent().then(result => {
  if (result) {
    agentReady = true
    agentOpenid = result.ob.openid || 'ready'
    INFO(`DashboardBot: 就绪，发送 "看板" 到 ${agentOpenid?.slice(0, 16)}... 即可查询，发送 "help" 查看帮助`)
  }
}).catch(err => {
  ERROR(`DashboardBot: 启动失败: ${err.message}`)
})

// ── HTTP 路由 ──

module.exports = expressRouter => {
  interceptRouters({
    expressRouter,
    routers: {
      '': [
        ['healthcheck', GET, () => ({
          code: 0,
          data: { app: 'DashboardBot', version: '2.0.0', ready: agentReady, openid: agentOpenid }
        })],
        ['stats', GET, async () => {
          const stats = await gatherAllStats()
          return { code: 0, data: stats }
        }],
      ],
    }
  })
}

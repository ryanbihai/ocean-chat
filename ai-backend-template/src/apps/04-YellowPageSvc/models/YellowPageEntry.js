const mongoose = require('mongoose')
const Schema = mongoose.Schema

const entrySchema = new Schema({
  openid:         { type: String, required: true, unique: true },
  agent_id:       { type: String, required: true, unique: true },
  public_key:     { type: String, required: true },
  tags:           [{ type: String }],
  description:    { type: String, required: true, maxlength: 800 },
  registered_at:  { type: Date, default: Date.now },
  updated_at:     { type: Date, default: Date.now },
  last_heartbeat: { type: Date, default: Date.now, expires: 7776000 }, // 90天无心跳自动清除
  // AgentCard 索引字段（不存储完整 AgentCard JSON）
  card_hash:      { type: String, default: null },    // "sha256:{64hex}" — 用于防篡改验证
  summary:        { type: String, default: null, maxlength: 140 }, // 140字简介，discover 结果中展示
  a2a_compatible: { type: Boolean, default: false },  // 是否兼容 A2A 协议
  a2a_endpoint:   { type: String, default: null },    // A2A well-known endpoint URL
  // 内容审核
  review_status:  { type: String, enum: ['pending', 'approved', 'rejected', 'flagged'], default: 'approved' },
  review_reason:  { type: String, default: null },
  reviewed_at:    { type: Date, default: null }
}, {
  collection: 'YellowPageSvc_Entry'
})

// discover 按标签 + cursor 分页 (registered_at + _id 复合排序)
entrySchema.index({ tags: 1, registered_at: 1, _id: 1 })
// discover 无标签全量查询 + cursor 分页
entrySchema.index({ registered_at: 1, _id: 1 })
// A2A 兼容 Agent 发现
entrySchema.index({ a2a_compatible: 1, tags: 1, registered_at: 1, _id: 1 })

module.exports = mongoose.model('YellowPageEntry', entrySchema)

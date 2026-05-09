const mongoose = require('mongoose')
const Schema = mongoose.Schema

const factSchema = new Schema({
  subject_openid: { type: String, required: true },
  fact_type:      { type: String, required: true, enum: ['trade', 'report', 'service'] },
  fact_subtype:   { type: String, required: true },
  fact_data:      { type: Schema.Types.Mixed, default: {} },
  recorded_by:    { type: String, required: true },
  recorded_at:    { type: Date, default: Date.now },
  proof:          { type: Schema.Types.Mixed, default: null },
  client_fact_id: { type: String, default: null }   // 幂等键 — 用于防止重复记录
}, {
  collection: 'ReputationSvc_Fact'
})

// 按 subject + type 查询，按时间倒序
factSchema.index({ subject_openid: 1, fact_type: 1, recorded_at: -1 })
// 按记录者查询（审计用）
factSchema.index({ recorded_by: 1, recorded_at: -1 })
// 幂等保护：同一条事实不可重复记录
factSchema.index({ client_fact_id: 1 }, { unique: true, sparse: true })

module.exports = mongoose.model('ReputationFact', factSchema)

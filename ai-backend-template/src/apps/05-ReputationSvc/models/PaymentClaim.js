const mongoose = require('mongoose')
const Schema = mongoose.Schema

const claimSchema = new Schema({
  claim_id:       { type: String, required: true, unique: true },
  payer_openid:   { type: String, required: true },
  payee_openid:   { type: String, required: true },
  amount:         { type: Number, required: true },
  currency:       { type: String, required: true },
  chain:          { type: String, default: null },
  tx_hash:        { type: String, default: null },
  evidence:       { type: String, default: null },
  description:    { type: String, default: null },
  status:         { type: String, enum: ['pending', 'confirmed', 'disputed', 'expired'], default: 'pending' },
  payer_sig:      { type: String, required: true },
  payer_public_key: { type: String, required: true },
  payee_sig:      { type: String, default: null },
  payee_public_key: { type: String, default: null },
  dispute_reason: { type: String, default: null },
  confirmed_at:   { type: Date, default: null },
  created_at:     { type: Date, default: Date.now },
  deleted:        { type: Boolean, default: false }
}, {
  collection: 'ReputationSvc_PaymentClaim'
})

// 幂等键已在 claim_id 上 unique

// 按付款方查询
claimSchema.index({ payer_openid: 1, created_at: -1 })
// 按收款方查询
claimSchema.index({ payee_openid: 1, created_at: -1 })
// 按状态过滤
claimSchema.index({ status: 1, created_at: -1 })

module.exports = mongoose.model('PaymentClaim', claimSchema)

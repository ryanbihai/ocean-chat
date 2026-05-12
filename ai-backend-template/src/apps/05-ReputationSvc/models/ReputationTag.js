const mongoose = require('mongoose')
const Schema = mongoose.Schema

const tagSchema = new Schema({
  from_uuid:  { type: String, required: true },
  to_uuid:    { type: String, required: true },
  label:      { type: String, required: true, maxlength: 30 },
  evidence:   { type: Schema.Types.Mixed, default: null },
  created_at: { type: Date, default: Date.now }
}, {
  collection: 'ReputationSvc_Tag'
})

tagSchema.index({ from_uuid: 1, to_uuid: 1, label: 1 }, { unique: true })
tagSchema.index({ to_uuid: 1 })

module.exports = mongoose.model('ReputationTag', tagSchema)

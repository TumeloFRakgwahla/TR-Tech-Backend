const mongoose = require('mongoose');

const campaignSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  type: { type: String, enum: ['Email', 'SMS', 'Social', 'Other'], default: 'Email' },
  content: { type: String, trim: true },
  sent: { type: Number, default: 0, min: 0 },
  opened: { type: Number, default: 0, min: 0 },
  clicked: { type: Number, default: 0, min: 0 },
  status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
}, { timestamps: true });

module.exports = mongoose.model('Campaign', campaignSchema);

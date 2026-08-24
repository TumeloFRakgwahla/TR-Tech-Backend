const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, uppercase: true, trim: true },
  discount: { type: Number, required: true, min: 0 },
  type: { type: String, enum: ['Percentage', 'Fixed'], default: 'Percentage' },
  minOrder: { type: Number, default: 0, min: 0 },
  expires: { type: Date },
  status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
}, { timestamps: true });

module.exports = mongoose.model('Coupon', couponSchema);

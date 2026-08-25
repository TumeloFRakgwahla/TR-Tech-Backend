const mongoose = require('mongoose');

const promotionSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  image: { type: String, trim: true },
  link: { type: String, trim: true },
  location: { type: String, trim: true },
  startDate: { type: Date },
  endDate: { type: Date },
   clicks: { type: Number, default: 0, min: 0 },
   status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
  }, {
  timestamps: true,
  indexes: [
    { key: { status: 1 } },
    { key: { startDate: 1, endDate: 1 } },
    { key: { createdAt: -1 } }
  ]
});

module.exports = mongoose.model('Promotion', promotionSchema);

const mongoose = require('mongoose');

const repairSchema = new mongoose.Schema({
  customer: {
    name: { type: String, required: true },
    email: { type: String },
    phone: { type: String, required: true },
  },
  device: {
    type: { type: String, required: true },
    brand: { type: String },
    model: { type: String },
  },
  issue: { type: String, required: true },
  additionalInfo: { type: String },
  status: {
    type: String,
    enum: ['Pending', 'In Progress', 'Completed', 'Cancelled'],
    default: 'Pending',
  },
  estimatedCost: { type: Number },
  notes: { type: String },
  image: { type: String },
}, {
  timestamps: true,
});

module.exports = mongoose.model('Repair', repairSchema);

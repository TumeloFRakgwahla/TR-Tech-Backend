const mongoose = require('mongoose');

/**
 * Repair Mongoose Model
 *
 * Represents a customer repair request.
 *
 * Key fields:
 * - customer: name, email, phone for communication
 * - device: type, brand, model for identification
 * - issue: description of the problem
 * - status: workflow state (Pending, In Progress, Completed, Cancelled)
 * - estimatedCost: set by admin after diagnosis
 * - notes: internal admin notes
 * - image: optional image of the device/issue
 */
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
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true,
    default: null,
  },
  status: {
    type: String,
    enum: ['New', 'Diagnosing', 'Awaiting Parts', 'In Progress', 'Ready', 'Completed', 'Cancelled'],
    default: 'New',
  },
  estimatedCost: { type: Number },
  notes: { type: String },
  image: { type: String },
}, {
  timestamps: true,
  indexes: [
    { key: { status: 1 } },
    { key: { createdAt: -1 } }
  ]
});

module.exports = mongoose.model('Repair', repairSchema);

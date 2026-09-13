const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  senderName: { type: String, required: true, trim: true },
  senderType: { type: String, enum: ['customer', 'admin'], default: 'customer' },
  message: { type: String, required: true, trim: true },
  createdAt: { type: Date, default: Date.now }
});

const supportTicketSchema = new mongoose.Schema({
  ticketNumber: { type: String, required: true, unique: true, index: true },
  customerName: { type: String, required: true, trim: true },
  customerEmail: { type: String, required: true, lowercase: true, trim: true },
  customerPhone: { type: String, trim: true },
  subject: { type: String, required: true, trim: true },
  category: {
    type: String,
    enum: ['General', 'Order', 'Repair', 'Technical', 'Billing', 'Other'],
    default: 'General'
  },
  priority: {
    type: String,
    enum: ['Low', 'Medium', 'High', 'Urgent'],
    default: 'Medium'
  },
  status: {
    type: String,
    enum: ['Open', 'In Progress', 'Resolved', 'Closed'],
    default: 'Open'
  },
  message: { type: String, required: true },
  messages: [messageSchema],
  adminNotes: { type: String, trim: true },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  }
}, {
  timestamps: true,
  indexes: [
    { key: { status: 1 } },
    { key: { priority: 1 } },
    { key: { category: 1 } },
    { key: { createdAt: -1 } },
    { key: { customerEmail: 1, createdAt: -1 } }
  ]
});

supportTicketSchema.pre('save', async function(next) {
  if (!this.ticketNumber) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let unique = false;
    while (!unique) {
      const suffix = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
      this.ticketNumber = `TK-${suffix}`;
      const existing = await this.constructor.findOne({ ticketNumber: this.ticketNumber });
      if (!existing) unique = true;
    }
  }
  next();
});

module.exports = mongoose.model('SupportTicket', supportTicketSchema);

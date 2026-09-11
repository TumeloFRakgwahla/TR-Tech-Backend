const mongoose = require('mongoose');

const ticketMessageSchema = new mongoose.Schema({
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  senderRole: {
    type: String,
    enum: ['customer', 'admin', 'manager', 'staff']
  },
  senderName: {
    type: String,
    trim: true
  },
  message: {
    type: String,
    required: [true, 'Message is required'],
    trim: true,
    maxlength: [2000, 'Message cannot exceed 2000 characters']
  },
  attachments: {
    type: [String]
  }
}, {
  timestamps: true
});

const supportTicketSchema = new mongoose.Schema({
  ticketNumber: {
    type: String,
    unique: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },
  customerName: {
    type: String,
    required: [true, 'Customer name is required'],
    trim: true
  },
  customerEmail: {
    type: String,
    required: [true, 'Customer email is required'],
    trim: true,
    lowercase: true
  },
  customerPhone: {
    type: String,
    trim: true
  },
  subject: {
    type: String,
    required: [true, 'Subject is required'],
    trim: true,
    maxlength: [200, 'Subject cannot exceed 200 characters']
  },
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
    default: 'Open',
    index: true
  },
  messages: {
    type: [ticketMessageSchema],
    default: []
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  resolvedAt: {
    type: Date
  },
  closedAt: {
    type: Date
  }
}, {
  timestamps: true,
  indexes: [
    { key: { userId: 1, createdAt: -1 } },
    { key: { status: 1, createdAt: -1 } },
    { key: { ticketNumber: 1 } },
    { key: { customerEmail: 1 } }
  ]
});

supportTicketSchema.pre('save', async function (next) {
  if (!this.ticketNumber) {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    this.ticketNumber = `TK-${timestamp}-${random}`;
  }
  next();
});

module.exports = mongoose.model('SupportTicket', supportTicketSchema);

const mongoose = require('mongoose');

const activityLogSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },
  userEmail: {
    type: String,
    trim: true,
    lowercase: true
  },
  userRole: {
    type: String,
    enum: ['customer', 'admin', 'manager', 'staff'],
    index: true
  },
  action: {
    type: String,
    required: [true, 'Action is required'],
    trim: true,
    maxlength: [100, 'Action cannot exceed 100 characters']
  },
  resource: {
    type: String,
    trim: true,
    maxlength: [100, 'Resource cannot exceed 100 characters']
  },
  resourceId: {
    type: String
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  ipAddress: {
    type: String,
    trim: true
  },
  userAgent: {
    type: String,
    trim: true
  },
  method: {
    type: String,
    enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    index: true
  },
  endpoint: {
    type: String,
    trim: true
  },
  statusCode: {
    type: Number,
    index: true
  },
  changes: {
    type: mongoose.Schema.Types.Mixed
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed
  }
}, {
  timestamps: true,
  indexes: [
    { key: { userId: 1, createdAt: -1 } },
    { key: { action: 1, createdAt: -1 } },
    { key: { userRole: 1, createdAt: -1 } },
    { key: { statusCode: 1, createdAt: -1 } },
    { key: { createdAt: -1 } }
  ]
});

module.exports = mongoose.model('ActivityLog', activityLogSchema);

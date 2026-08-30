const mongoose = require('mongoose');

/**
 * Session Mongoose Model
 *
 * Supports JWT revocation by storing active sessions in MongoDB.
 * Each JWT contains a unique identifier (jti) that maps to a session document.
 * On logout or admin action, the session is marked inactive, causing authenticate()
 * to reject the token even if it has not cryptographically expired.
 *
 * The expiresAt field has a TTL index that automatically purges old sessions.
 */
const sessionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  tokenIdentifier: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  userAgent: {
    type: String,
    trim: true
  },
  ipAddress: {
    type: String,
    trim: true
  },
  deviceName: {
    type: String,
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastActive: {
    type: Date,
    default: Date.now
  },
  expiresAt: {
    type: Date,
    required: true,
    index: { expireAfterSeconds: 0 }
  }
}, {
  timestamps: true,
  indexes: [
    { key: { userId: 1, isActive: 1 } }
  ]
});

module.exports = mongoose.model('Session', sessionSchema);

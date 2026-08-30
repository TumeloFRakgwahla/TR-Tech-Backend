const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

/**
 * User Mongoose Model
 *
 * Represents a registered user (customer or admin) in the system.
 *
 * Security-relevant fields:
 * - password: stored as bcrypt hash; select: false prevents accidental leakage in queries
 * - failedLoginAttempts / lockUntil: brute-force protection
 * - emailVerificationToken / emailVerificationExpires: email verification flow
 * - isActive: soft-delete flag for deactivated accounts
 *
 * Indexes optimize:
 * - email lookups for login and uniqueness
 * - role queries for admin dashboards
 * - createdAt for sorting
 */
const userSchema = new mongoose.Schema({
  firstName: {
    type: String,
    required: [true, 'First name is required'],
    trim: true,
    maxlength: [50, 'First name cannot exceed 50 characters']
  },
  lastName: {
    type: String,
    required: [true, 'Last name is required'],
    trim: true,
    maxlength: [50, 'Last name cannot exceed 50 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    trim: true,
    lowercase: true,
    unique: true,
    match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [8, 'Password must be at least 8 characters'],
    select: false
  },
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    trim: true
  },
  address: {
    street: { type: String, trim: true },
    city: { type: String, trim: true },
    postalCode: { type: String, trim: true },
    province: { type: String, trim: true }
  },
  role: {
    type: String,
    enum: ['customer', 'admin'],
    default: 'customer'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  emailVerified: {
    type: Boolean,
    default: false
  },
  emailVerificationToken: String,
  emailVerificationExpires: Date,
  failedLoginAttempts: {
    type: Number,
    default: 0
  },
  lockUntil: {
    type: Date,
    default: null
  },
  notificationPreferences: {
    emailOrderUpdates: { type: Boolean, default: true },
    emailPromotions: { type: Boolean, default: true },
    emailNewsletter: { type: Boolean, default: false },
    smsOrderUpdates: { type: Boolean, default: true },
    smsPromotions: { type: Boolean, default: false },
    whatsappUpdates: { type: Boolean, default: true },
    pushNotifications: { type: Boolean, default: false },
    frequency: { type: String, default: 'instant', enum: ['instant', 'daily', 'weekly'] }
  }
}, {
  timestamps: true,
  indexes: [
    { key: { email: 1 } },
    { key: { role: 1 } },
    { key: { createdAt: -1 } }
  ]
});

// Hash password before saving. Only re-hashes if the password field has been modified.
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) {
    return next();
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Compare a plaintext password against the stored bcrypt hash.
userSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Remove password from JSON output. Ensures the password hash is never sent to the client.
userSchema.methods.toJSON = function() {
  const user = this.toObject();
  delete user.password;
  return user;
};

// True when the account is temporarily locked from failed logins.
userSchema.methods.isLocked = function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
};

// Generate a single-use email verification token.
// The raw token is returned to the caller for emailing; only the SHA-256 hash is persisted.
// This way, if the database is leaked, the raw token cannot be reconstructed.
userSchema.methods.generateEmailVerificationToken = function() {
  const token = crypto.randomBytes(32).toString('hex');
  this.emailVerificationToken = crypto.createHash('sha256').update(token).digest('hex');
  this.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000;
  return token;
};

module.exports = mongoose.model('User', userSchema);

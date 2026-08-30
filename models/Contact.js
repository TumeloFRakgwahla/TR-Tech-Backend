const mongoose = require('mongoose');

/**
 * Contact Mongoose Model
 *
 * Represents a message submitted through the public contact form.
 *
 * Status workflow:
 * - New: freshly submitted, awaiting review
 * - Read: admin has seen it
 * - Replied: admin has responded to the customer
 * - Closed: resolved, no further action needed
 */
const contactSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    trim: true,
    lowercase: true
  },
  phone: {
    type: String,
    required: [true, 'Phone number is required']
  },
  subject: {
    type: String,
    required: [true, 'Subject is required'],
    trim: true
  },
  message: {
    type: String,
    required: [true, 'Message is required']
  },
  status: {
    type: String,
    enum: ['New', 'Read', 'Replied', 'Closed'],
    default: 'New'
  }
}, {
  timestamps: true,
  indexes: [
    { key: { status: 1 } },
    { key: { email: 1 } },
    { key: { createdAt: -1 } }
  ]
});

module.exports = mongoose.model('Contact', contactSchema);

const mongoose = require('mongoose');

/**
 * Embedded schema for a single item within an order.
 * Snapshot fields (name, condition, price) are stored at purchase time
 * so order history remains accurate even if the product changes later.
 */
const orderItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product'
  },
  name: String,
  condition: String,
  price: Number,
  quantity: {
    type: Number,
    required: true,
    min: 1
  }
});

/**
 * Order Mongoose Model
 *
 * Represents a customer purchase containing one or more items.
 *
 * Key design decisions:
 * - Customer details are denormalized into the order so the order remains
 *   valid even if the user account is deleted or modified.
 * - Status and paymentStatus are enums to enforce valid state transitions.
 * - Indexes on status, createdAt, and customer.email support admin filtering and sorting.
 */
const orderSchema = new mongoose.Schema({
  customer: {
    name: {
      type: String,
      required: [true, 'Customer name is required'],
      trim: true
    },
    email: {
      type: String,
      required: [true, 'Customer email is required'],
      trim: true,
      lowercase: true
    },
    phone: {
      type: String,
      required: [true, 'Customer phone is required']
    },
    address: {
      street: String,
      city: String,
      postalCode: String,
      province: String
    }
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },
  items: [orderItemSchema],
  totalAmount: {
    type: Number,
    required: [true, 'Total amount is required'],
    min: [0, 'Total cannot be negative']
  },
  status: {
    type: String,
    enum: ['Pending', 'Processing', 'Shipped', 'Delivered', 'Completed', 'Cancelled'],
    default: 'Pending'
  },
  paymentMethod: {
    type: String,
    enum: ['Cash', 'Card', 'Transfer', 'Other', 'WhatsApp'],
    default: 'Cash'
  },
  paymentStatus: {
    type: String,
    enum: ['Pending', 'Paid', 'Refunded'],
    default: 'Pending'
  },
  notes: String
}, {
  timestamps: true,
  indexes: [
    { key: { status: 1 } },
    { key: { createdAt: -1 } },
    { key: { 'customer.email': 1 } },
    { key: { status: 1, createdAt: -1 } }
  ]
});

module.exports = mongoose.model('Order', orderSchema);

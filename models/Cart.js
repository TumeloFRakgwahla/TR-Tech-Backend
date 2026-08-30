const mongoose = require('mongoose');

/**
 * Embedded schema for a single item in a user's cart.
 * Stores a snapshot of product details (name, condition, price, image)
 * so the cart remains consistent even if the product changes later.
 */
const cartItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  name: {
    type: String,
    required: true
  },
  condition: {
    type: String,
    required: true
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
    default: 1
  },
  image: {
    type: String,
    default: ''
  }
});

/**
 * Cart Mongoose Model
 *
 * Each user has exactly one cart document (unique index on user).
 * The cart contains an array of cartItemSchema documents.
 */
const cartSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true
  },
  items: [cartItemSchema]
}, {
  timestamps: true,
  indexes: [
    { key: { user: 1 } },
    { key: { createdAt: -1 } }
  ]
});

module.exports = mongoose.model('Cart', cartSchema);

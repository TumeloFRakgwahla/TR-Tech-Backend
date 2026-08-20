const mongoose = require('mongoose');

const wishlistSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
  },
  products: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
  }],
}, {
  timestamps: true,
  indexes: [
    { key: { user: 1 } },
    { key: { createdAt: -1 } },
  ]
});

module.exports = mongoose.model('Wishlist', wishlistSchema);

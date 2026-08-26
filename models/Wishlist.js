const mongoose = require('mongoose');

const wishlistSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
  },
  products: {
    type: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
    }],
    validate: {
      validator: (v) => v.length <= 100,
      message: 'A wishlist cannot contain more than 100 products',
    },
  },
}, {
  timestamps: true,
  indexes: [
    { key: { user: 1 } },
    { key: { createdAt: -1 } },
  ]
});

module.exports = mongoose.model('Wishlist', wishlistSchema);

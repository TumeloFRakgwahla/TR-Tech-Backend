const mongoose = require('mongoose');

/**
 * Wishlist Mongoose Model
 *
 * A wishlist is a SET, not a bag: the same product must never appear twice,
 * and merging two wishlists is a set union. Both properties make the merge
 * naturally idempotent and commutative, which is why merging needs no
 * locking or version check.
 *
 * `appliedBatches` provides the idempotency guard; `rev` is carried for
 * consistency with Cart and for future change-feed use.
 */
const wishlistSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
  },
  products: {
    type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
    default: [],
  },
  rev: {
    type: Number,
    default: 0,
    min: 0
  },
  appliedBatches: {
    type: [{ batchId: String, appliedAt: Date }],
    default: [],
    validate: {
      validator: (v) => v.length <= 50,
      message: 'Batch ledger overflow'
    }
  }
}, {
  timestamps: true,
  indexes: [
    { key: { user: 1 } },
    { key: { createdAt: -1 } },
  ]
});

// A wishlist is a set: no duplicates, and bounded size.
wishlistSchema.path('products').validate(function (products) {
  if (products.length > 100) {
    return 'A wishlist cannot contain more than 100 products';
  }
  const unique = new Set(products.map(String));
  if (unique.size !== products.length) {
    return 'Duplicate product in wishlist';
  }
  return true;
});

module.exports = mongoose.model('Wishlist', wishlistSchema);

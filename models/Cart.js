const mongoose = require('mongoose');

/**
 * Embedded schema for a single line in a user's cart.
 *
 * Line identity is the tuple (product, variantKey). Keying on `product` alone
 * collapses two SKUs of the same product into one line, so `variantKey` is
 * part of the identity. `_id: false` because there is no need for a subdocument
 * id once identity is derived.
 *
 * The name/condition/price/image fields are a *server-owned snapshot* taken
 * from the Product document. Clients must never send them: accepting a
 * client-supplied price lets a caller set their own cart total.
 */
const cartItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  variantKey: {
    type: String,
    default: '',
    maxlength: [64, 'Variant key cannot exceed 64 characters']
  },
  name: {
    type: String,
    required: true
  },
  condition: {
    type: String,
    required: true
  },
  // Carried so client-side coupon targeting (which is category-scoped) can run
  // without a second product fetch.
  category: {
    type: String,
    default: ''
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
  },
  // Per-line revision, used for conflict reporting and future partial merges.
  lineRev: {
    type: Number,
    default: 1,
    min: 1
  }
}, { _id: false });

/**
 * Cart Mongoose Model
 *
 * One document per user. Holds:
 *  - `items`            the authoritative line set
 *  - `rev`              optimistic-concurrency token, bumped on every write
 *  - `appliedBatches`   idempotency ledger; makes merge/mutate replays no-ops
 *
 * The idempotency ledger is what makes additive merges safe. `mergeCart`
 * SUMS quantities for a product present in both carts, which is only correct
 * because a replayed batch is recognised and ignored. The two mechanisms are
 * inseparable: remove either one and reloads inflate cart quantities.
 *
 * There is deliberately no unique index on (user, items.product,
 * items.variantKey). MongoDB cannot build a compound index across two fields
 * of the same array ("cannot index parallel arrays"), so within-cart
 * uniqueness is enforced in cartMergeService instead.
 */
const cartSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true
  },
  items: {
    type: [cartItemSchema],
    default: []
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
    { key: { createdAt: -1 } }
  ]
});

// Guard against unbounded carts.
cartSchema.path('items').validate(function (items) {
  if (items.length > 100) {
    return 'A cart cannot contain more than 100 line items';
  }
  return true;
});

module.exports = mongoose.model('Cart', cartSchema);

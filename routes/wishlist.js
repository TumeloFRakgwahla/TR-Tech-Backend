const express = require('express');
const { serverError } = require('../utils/response');
const router = express.Router();
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const Wishlist = require('../models/Wishlist');
const Product = require('../models/Product');
const { authenticate } = require('../middleware/auth');
const { isObjectId, alreadyApplied, recordBatch } = require('../services/cartMergeService');

const MAX_WISHLIST_ITEMS = 100;

/** Project a wishlist into the wire format. */
async function hydrate(wishlist) {
  const populated = await Wishlist.findById(wishlist._id).populate('products').lean();
  return {
    products: populated?.products || [],
    rev: populated?.rev ?? 0,
  };
}

// Get the authenticated user's wishlist with populated product details.
router.get('/', authenticate, async (req, res) => {
  try {
    let wishlist = await Wishlist.findOne({ user: req.user._id });
    if (!wishlist) {
      wishlist = await Wishlist.create({ user: req.user._id, products: [] });
    }
    const data = await hydrate(wishlist);
    res.json({ success: true, data: data.products, rev: data.rev });
  } catch (error) {
    serverError(res, error);
  }
});

/**
 * Merge a guest wishlist into the authenticated user's wishlist.
 *
 * A wishlist is a set, so this is a set union: naturally idempotent and
 * commutative, which means it needs no locking or version check. The
 * `clientBatchId` ledger additionally makes a replayed request a no-op.
 *
 * Products that no longer exist or are no longer Active are dropped and
 * reported in `warnings`, so the client can tell the user rather than
 * silently dropping their selection.
 */
router.post('/merge', authenticate, [
  body('productIds').isArray().withMessage('productIds must be an array'),
  body('clientBatchId').isString().isLength({ min: 8, max: 64 }).withMessage('clientBatchId is required'),
  validate,
], async (req, res) => {
  try {
    const { productIds, clientBatchId } = req.body;

    let wishlist = await Wishlist.findOne({ user: req.user._id });
    if (!wishlist) {
      wishlist = await Wishlist.create({ user: req.user._id, products: [] });
    }

    if (alreadyApplied(wishlist, clientBatchId)) {
      const data = await hydrate(wishlist);
      return res.json({ success: true, data: data.products, rev: data.rev, replayed: true, warnings: [] });
    }

    const requested = [...new Set((productIds || []).map(String).filter(isObjectId))];
    if (requested.length === 0) {
      const data = await hydrate(wishlist);
      return res.json({ success: true, data: data.products, rev: data.rev, warnings: [] });
    }

    const active = await Product.find({ _id: { $in: requested }, status: 'Active' }).select('_id').lean();
    const activeIds = new Set(active.map((p) => String(p._id)));
    const rejected = requested.filter((id) => !activeIds.has(id));

    // Union, bounded, deduplicated.
    const union = [...new Set([
      ...wishlist.products.map(String),
      ...activeIds,
    ])].slice(0, MAX_WISHLIST_ITEMS);

    const dropped = union.length < (new Set([...wishlist.products.map(String), ...activeIds])).size
      ? ['WISHLIST_FULL']
      : [];

    wishlist.products = union;
    wishlist.rev += 1;
    recordBatch(wishlist, clientBatchId);
    await wishlist.save();

    const data = await hydrate(wishlist);
    res.json({ success: true, data: data.products, rev: data.rev, warnings: [...rejected.map((id) => ({ product: id, reason: 'PRODUCT_UNAVAILABLE' })), ...dropped] });
  } catch (error) {
    serverError(res, error);
  }
});

// Check if a specific product is in the user's wishlist.
// Returns { success: true, inWishlist: boolean }.
router.get('/check/:productId', authenticate, async (req, res) => {
  try {
    const wishlist = await Wishlist.findOne({ user: req.user._id });
    const inWishlist = wishlist
      ? wishlist.products.some((p) => p.toString() === req.params.productId)
      : false;
    res.json({ success: true, inWishlist });
  } catch (error) {
    serverError(res, error);
  }
});

// Add a product to the user's wishlist.
// Creates the wishlist document if it does not exist yet.
router.post('/:productId', authenticate, async (req, res) => {
  try {
    const Product = require('../models/Product');
    const product = await Product.findById(req.params.productId);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    let wishlist = await Wishlist.findOne({ user: req.user._id });
    if (!wishlist) {
      wishlist = new Wishlist({ user: req.user._id, products: [] });
    }

    if (!wishlist.products.some((p) => p.toString() === req.params.productId)) {
      if (wishlist.products.length >= MAX_WISHLIST_ITEMS) {
        return res.status(400).json({ success: false, message: `A wishlist cannot contain more than ${MAX_WISHLIST_ITEMS} products` });
      }
      wishlist.products.push(req.params.productId);
      wishlist.rev += 1;
      await wishlist.save();
    }

    res.json({ success: true, message: 'Added to wishlist', rev: wishlist.rev });
  } catch (error) {
    serverError(res, error);
  }
});

// Remove a product from the user's wishlist.
router.delete('/:productId', authenticate, async (req, res) => {
  try {
    const wishlist = await Wishlist.findOne({ user: req.user._id });
    if (!wishlist) {
      return res.status(404).json({ success: false, message: 'Wishlist not found' });
    }

    const before = wishlist.products.length;
    wishlist.products = wishlist.products.filter(
      (p) => p.toString() !== req.params.productId
    );
    if (wishlist.products.length !== before) {
      wishlist.rev += 1;
      await wishlist.save();
    }

    res.json({ success: true, message: 'Removed from wishlist', rev: wishlist.rev });
  } catch (error) {
    serverError(res, error);
  }
});

module.exports = router;

const express = require('express');
const { serverError, badRequest } = require('../utils/response');
const router = express.Router();
const { body, param } = require('express-validator');
const validate = require('../middleware/validate');
const Cart = require('../models/Cart');
const Product = require('../models/Product');
const { authenticate } = require('../middleware/auth');
const {
  mergeCart,
  applyOps,
  hydrate,
  lineKey,
  isObjectId,
  MAX_QTY_PER_LINE,
} = require('../services/cartMergeService');

// `price`, `name`, `condition` and `image` are intentionally NOT accepted from
// the client. They are a server-owned snapshot of the Product document; taking
// them from the request body would let a caller set their own cart total.
const cartItemValidation = [
  body('product').notEmpty().withMessage('Product ID is required'),
  body('variantKey').optional().trim().isLength({ max: 64 }).withMessage('Invalid variant key'),
  body('quantity').optional().isInt({ min: 1, max: MAX_QTY_PER_LINE }).withMessage('Quantity must be between 1 and 99'),
];

const productIdValidation = [
  param('productId').notEmpty().withMessage('Product ID is required')
];

const mergeValidation = [
  body('lines').isArray().withMessage('lines must be an array'),
  body('clientBatchId').isString().isLength({ min: 8, max: 64 }).withMessage('clientBatchId is required'),
];

const mutateValidation = [
  body('ops').isArray().withMessage('ops must be an array'),
  body('baseRev').isInt({ min: 0 }).withMessage('baseRev must be an integer'),
  body('clientBatchId').isString().isLength({ min: 8, max: 64 }).withMessage('clientBatchId is required'),
];

const lineKeyParamValidation = [
  param('productId').custom((v) => isObjectId(String(v)))
    .withMessage('Product ID is invalid'),
];

// Get the authenticated user's cart.
// Creates an empty cart if one does not exist yet.
router.get('/', authenticate, async (req, res) => {
  try {
    let cart = await Cart.findOne({ user: req.user._id });
    if (!cart) {
      try {
        cart = await Cart.create({ user: req.user._id, items: [] });
      } catch (createError) {
        if (createError.code === 11000) {
          cart = await Cart.findOne({ user: req.user._id });
        } else {
          throw createError;
        }
      }
    }
    const data = await hydrate(cart);
    res.json({ success: true, data: data.items, rev: data.rev, subtotal: data.subtotal });
  } catch (error) {
    serverError(res, error);
  }
});

/**
 * Merge a guest cart into the authenticated user's cart.
 *
 * Single round trip, atomic, and idempotent via `clientBatchId`. Safe to retry
 * and safe to call concurrently: merging is convergent, so two in-flight
 * merges reach the same state.
 *
 * `warnings` reports every line that could not be honoured as sent, so the
 * client can explain the difference to the user.
 */
router.post('/merge', authenticate, mergeValidation, validate, async (req, res) => {
  try {
    const { lines, clientBatchId } = req.body;
    const result = await mergeCart(req.user._id, lines, clientBatchId);
    res.json({
      success: true,
      data: result.cart.items,
      rev: result.cart.rev,
      subtotal: result.cart.subtotal,
      warnings: result.warnings,
      replayed: result.replayed,
    });
  } catch (error) {
    serverError(res, error);
  }
});

/**
 * Apply intent operations (ADD / SET_QTY / REMOVE / CLEAR) to the cart.
 *
 * Requires `baseRev` for optimistic concurrency. A stale writer receives
 * 409 with the authoritative cart and is expected to re-apply its intent.
 */
router.post('/mutate', authenticate, mutateValidation, validate, async (req, res) => {
  try {
    const { ops, baseRev, clientBatchId } = req.body;
    const result = await applyOps(req.user._id, ops, baseRev, clientBatchId);

    if (result.status === 'stale') {
      return res.status(409).json({
        success: false,
        code: 'STALE_REV',
        message: 'Cart was modified elsewhere. Re-apply your changes.',
        data: result.cart.items,
        rev: result.cart.rev,
        subtotal: result.cart.subtotal,
      });
    }

    res.json({
      success: true,
      data: result.cart.items,
      rev: result.cart.rev,
      subtotal: result.cart.subtotal,
      warnings: result.warnings || [],
      replayed: result.status === 'replayed',
    });
  } catch (error) {
    serverError(res, error);
  }
});

// Add an item to the cart.
// Prices and names always come from the Product document. Merges with an
// existing line of the same (product, variantKey).
router.post('/', authenticate, cartItemValidation, validate, async (req, res) => {
  try {
    const { product, variantKey = '', quantity } = req.body;
    const productId = String(product);

    const productDoc = await Product.findById(productId).catch(() => null);
    if (!productDoc) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const requested = parseInt(quantity, 10) || 1;
    const result = await applyOps(
      req.user._id,
      [{ type: 'ADD', product: productId, variantKey, quantity: requested }],
      // No baseRev: the legacy single-add endpoint keeps last-write-wins
      // semantics. New clients should use /mutate to get conflict detection.
      undefined,
      `single-add-${req.user._id}-${productId}-${Date.now()}`
    );

    const data = result.cart;
    res.json({ success: true, data: data.items, rev: data.rev, subtotal: data.subtotal, warnings: result.warnings || [] });
  } catch (error) {
    badRequest(res, error);
  }
});

// Update the quantity of a cart item.
// Validates against current stock before updating.
router.put('/:productId', authenticate, [...lineKeyParamValidation, ...productIdValidation], validate, async (req, res) => {
  try {
    const { quantity } = req.body;
    const productId = String(req.params.productId);
    const variantKey = String(req.query.variantKey || '');

    if (!quantity || quantity < 1) {
      return res.status(400).json({ success: false, message: 'Quantity must be at least 1' });
    }

    const result = await applyOps(
      req.user._id,
      [{ type: 'SET_QTY', product: productId, variantKey, quantity: parseInt(quantity, 10) }],
      undefined,
      `single-setqty-${req.user._id}-${productId}-${variantKey}-${Date.now()}`
    );

    if (result.status !== 'applied' && result.status !== 'replayed') {
      return res.status(400).json({ success: false, message: 'Could not update cart item' });
    }
    res.json({ success: true, data: result.cart.items, rev: result.cart.rev, subtotal: result.cart.subtotal });
  } catch (error) {
    badRequest(res, error);
  }
});

// Remove a single item from the cart by product ID (+ optional variantKey).
router.delete('/:productId', authenticate, lineKeyParamValidation, async (req, res) => {
  try {
    const productId = String(req.params.productId);
    const variantKey = String(req.query.variantKey || '');

    const cart = await Cart.findOne({ user: req.user._id });
    if (!cart) {
      return res.status(404).json({ success: false, message: 'Cart not found' });
    }

    const key = lineKey(productId, variantKey);
    cart.items = cart.items.filter((item) => lineKey(item.product, item.variantKey) !== key);
    cart.rev += 1;
    await cart.save();

    const data = await hydrate(cart);
    res.json({ success: true, data: data.items, rev: data.rev, subtotal: data.subtotal });
  } catch (error) {
    serverError(res, error);
  }
});

// Remove all items from the cart.
router.delete('/', authenticate, async (req, res) => {
  try {
    const cart = await Cart.findOne({ user: req.user._id });
    if (!cart) {
      return res.status(404).json({ success: false, message: 'Cart not found' });
    }

    cart.items = [];
    cart.rev += 1;
    await cart.save();

    res.json({ success: true, data: [], rev: cart.rev, subtotal: 0 });
  } catch (error) {
    serverError(res, error);
  }
});

module.exports = router;

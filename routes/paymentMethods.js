const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const PaymentMethod = require('../models/PaymentMethod');
const { authenticate } = require('../middleware/auth');
const { serverError } = require('../utils/response');

// All payment-method routes are authenticated and strictly scoped to req.user._id.
router.use(authenticate);

// List the current user's saved payment methods, sorted by default first.
router.get('/', async (req, res) => {
  try {
    const methods = await PaymentMethod.find({ userId: req.user._id })
      .sort({ isDefault: -1, createdAt: -1 });
    res.json({ success: true, data: methods });
  } catch (error) {
    serverError(res, error);
  }
});

// Add a payment method. `gatewayToken` is the opaque token returned by the gateway's
// client-side SDK after it tokenizes the real card — we never see raw card data.
router.post('/', [
  body('gateway').isIn(['stripe', 'paystack', 'flutterwave', 'manual']).withMessage('Invalid gateway'),
  body('gatewayToken').notEmpty().withMessage('Gateway token is required'),
  body('brand').optional().trim().isLength({ max: 50 }),
  body('last4').optional().isLength({ min: 2, max: 4 }).withMessage('last4 must be 2-4 chars'),
  body('expMonth').optional().isInt({ min: 1, max: 12 }),
  body('expYear').optional().isInt({ min: 2024 }),
], validate, async (req, res) => {
  try {
    const { gateway, gatewayToken, brand, last4, expMonth, expYear } = req.body;
    const isDefault = !!req.body.isDefault;

    if (isDefault) {
      await PaymentMethod.updateMany({ userId: req.user._id }, { isDefault: false });
    }

    const method = await PaymentMethod.create({
      userId: req.user._id,
      gateway,
      gatewayToken,
      brand,
      last4,
      expMonth,
      expYear,
      isDefault,
    });

    res.status(201).json({ success: true, data: method });
  } catch (error) {
    serverError(res, error);
  }
});

// Mark a payment method as default (must belong to the user).
router.post('/:id/default', async (req, res) => {
  try {
    const method = await PaymentMethod.findOne({ _id: req.params.id, userId: req.user._id });
    if (!method) {
      return res.status(404).json({ success: false, message: 'Payment method not found' });
    }
    await PaymentMethod.updateMany({ userId: req.user._id }, { isDefault: false });
    method.isDefault = true;
    await method.save();
    res.json({ success: true, data: method });
  } catch (error) {
    serverError(res, error);
  }
});

// Delete a payment method (must belong to the user).
router.delete('/:id', async (req, res) => {
  try {
    const method = await PaymentMethod.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    if (!method) {
      return res.status(404).json({ success: false, message: 'Payment method not found' });
    }
    res.json({ success: true, message: 'Payment method removed' });
  } catch (error) {
    serverError(res, error);
  }
});

module.exports = router;

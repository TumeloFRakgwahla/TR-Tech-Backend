const express = require('express');
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const { authenticate, optionalAuthenticate } = require('../middleware/auth');
const { initializeTransaction, verifyTransaction } = require('../services/paystackService');
const Order = require('../models/Order');
const { serverError, badRequest, successResponse } = require('../utils/response');

const router = express.Router();

const initializeValidation = [
  body('orderId').notEmpty().withMessage('Order ID is required'),
  body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('amount').isFloat({ min: 0.01 }).withMessage('Amount must be at least R0.01'),
];

const verifyValidation = [
  body('reference').notEmpty().withMessage('Transaction reference is required'),
];

router.post('/paystack/initialize', optionalAuthenticate, initializeValidation, validate, async (req, res) => {
  try {
    const { orderId, email, amount } = req.body;

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (order.paymentStatus === 'Paid') {
      return res.status(400).json({ success: false, message: 'Order has already been paid' });
    }

    const reference = `TR-${orderId}-${Date.now()}`;
    const callbackUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/order-confirmation?reference=${encodeURIComponent(reference)}`;

    const paystackData = await initializeTransaction({
      email,
      amount: Math.round(amount * 100),
      reference,
      callbackUrl,
      metadata: {
        orderId,
        userId: req.user?._id,
      },
    });

    order.paystackReference = reference;
    await order.save();

    return successResponse(res, {
      authorizationUrl: paystackData.authorization_url,
      reference,
      accessCode: paystackData.access_code,
    });
  } catch (error) {
    if (error.paystackResponse) {
      return res.status(error.status || 400).json({
        success: false,
        message: error.message,
      });
    }
    serverError(res, error);
  }
});

router.post('/paystack/verify', optionalAuthenticate, verifyValidation, validate, async (req, res) => {
  try {
    const { reference } = req.body;

    const paystackData = await verifyTransaction(reference);

    const metadata = paystackData.metadata || {};
    const orderId = metadata.orderId;

    let order = null;
    if (orderId) {
      order = await Order.findById(orderId);
    }

    if (!order && paystackData.reference) {
      order = await Order.findOne({ paystackReference: paystackData.reference });
    }

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found for this transaction' });
    }

    if (paystackData.status === 'success') {
      order.paymentStatus = 'Paid';
      order.status = 'Processing';
      order.paystackReference = paystackData.reference || order.paystackReference || reference;
      await order.save();

      return successResponse(res, {
        paid: true,
        gatewayResponse: paystackData.gateway_response,
        paidAt: paystackData.paid_at,
        order: {
          _id: order._id,
          paymentStatus: order.paymentStatus,
          status: order.status,
        },
      });
    }

    return res.status(400).json({
      success: false,
      message: paystackData.gateway_response || 'Payment was not successful',
      data: {
        status: paystackData.status,
        reference: paystackData.reference,
      },
    });
  } catch (error) {
    if (error.paystackResponse) {
      return res.status(error.status || 400).json({
        success: false,
        message: error.message,
      });
    }
    serverError(res, error);
  }
});

module.exports = router;

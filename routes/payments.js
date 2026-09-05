const express = require('express');
const crypto = require('crypto');
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const { optionalAuthenticate } = require('../middleware/auth');
const { createApiLimiter } = require('../middleware/rateLimiter');
const {
  initializeTransaction,
  verifyTransaction,
  verifyWebhookSignature,
} = require('../services/paystackService');
const Order = require('../models/Order');
const { serverError, badRequest, successResponse } = require('../utils/response');

const router = express.Router();

const paymentLimiter = createApiLimiter();

const initializeValidation = [
  body('orderId').notEmpty().withMessage('Order ID is required'),
  body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('amount').isFloat({ min: 0.01 }).withMessage('Amount must be at least R0.01'),
];

const verifyValidation = [
  body('reference').notEmpty().withMessage('Transaction reference is required'),
];

router.post(
  '/paystack/initialize',
  optionalAuthenticate,
  paymentLimiter,
  initializeValidation,
  validate,
  async (req, res) => {
    try {
      const { orderId, email, amount } = req.body;

      const order = await Order.findById(orderId);
      if (!order) {
        return res.status(404).json({ success: false, message: 'Order not found' });
      }

      if (order.paymentStatus === 'Paid') {
        return res.status(400).json({
          success: false,
          message: 'Order has already been paid',
        });
      }

      if (order.paystackReference) {
        try {
          const existing = await verifyTransaction(order.paystackReference);
          if (existing.status === 'success') {
            order.paymentStatus = 'Paid';
            order.status = 'Processing';
            order.paystackReference = existing.reference;
            await order.save();

            return successResponse(res, {
              paid: true,
              reference: existing.reference,
              authorizationUrl: null,
              order: {
                _id: order._id,
                paymentStatus: order.paymentStatus,
                status: order.status,
              },
            });
          }
        } catch (verifyError) {
          // Reference may be invalid or stale; proceed with a new initialization
        }
      }

      const reference = crypto.randomBytes(16).toString('hex').substring(0, 16).toUpperCase();
      const callbackUrl = `${
        process.env.FRONTEND_URL || 'http://localhost:5173'
      }/order-confirmation?reference=${encodeURIComponent(reference)}`;

      const paystackData = await initializeTransaction({
        email,
        amount: Math.round(amount * 100),
        reference,
        callbackUrl,
        metadata: {
          orderId: order._id.toString(),
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
  }
);

router.post(
  '/paystack/verify',
  optionalAuthenticate,
  paymentLimiter,
  verifyValidation,
  validate,
  async (req, res) => {
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
        return res
          .status(404)
          .json({ success: false, message: 'Order not found for this transaction' });
      }

      if (paystackData.status === 'success') {
        const expectedAmount = Math.round(order.totalAmount * 100);
        if (paystackData.amount !== expectedAmount) {
          console.error(
            `[paystack-verify] Amount mismatch for order ${order._id}: ` +
              `expected ${expectedAmount}, got ${paystackData.amount}`
          );
          return res.status(400).json({
            success: false,
            message: 'Payment amount does not match order total',
          });
        }

        order.paymentStatus = 'Paid';
        order.status = 'Processing';
        order.paystackReference =
          paystackData.reference || order.paystackReference || reference;
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
  }
);

router.post(
  '/paystack/webhook',
  async (req, res) => {
    const signature = req.headers['x-paystack-signature'];

    if (!signature) {
      return res
        .status(400)
        .json({ success: false, message: 'Missing Paystack signature header' });
    }

    const rawBody = req.body;
    if (!verifyWebhookSignature(signature, rawBody)) {
      console.error('[paystack-webhook] Invalid signature received');
      return res.status(401).json({ success: false, message: 'Invalid signature' });
    }

    let event;
    try {
      event = JSON.parse(rawBody.toString());
    } catch (parseError) {
      console.error('[paystack-webhook] Failed to parse webhook payload:', parseError.message);
      return res.status(400).json({ success: false, message: 'Invalid JSON payload' });
    }

    const data = event.data || {};
    const reference = data.reference;

    if (!reference) {
      return res.status(400).json({ success: false, message: 'No reference in webhook payload' });
    }

    try {
      const order = await Order.findOne({ paystackReference: reference });

      if (!order) {
        console.warn(`[paystack-webhook] No order found for reference: ${reference}`);
        return res.status(200).json({ success: true, message: 'Reference not found, ignored' });
      }

      if (event.event === 'charge.success' && order.paymentStatus !== 'Paid') {
        const expectedAmount = Math.round(order.totalAmount * 100);
        if (data.amount !== expectedAmount) {
          console.error(
            `[paystack-webhook] Amount mismatch for order ${order._id}: ` +
              `expected ${expectedAmount}, got ${data.amount}`
          );
          return res.status(200).json({
            success: true,
            message: 'Amount mismatch, order not updated',
          });
        }

        order.paymentStatus = 'Paid';
        order.status = 'Processing';
        await order.save();
        console.log(`[paystack-webhook] Order ${order._id} marked as Paid`);
      } else if (event.event === 'charge.failed' && order.paymentStatus !== 'Refunded') {
        console.log(`[paystack-webhook] Payment failed for order ${order._id}`);
      }

      res.status(200).json({ success: true });
    } catch (error) {
      console.error('[paystack-webhook] Error processing event:', error);
      res.status(500).json({ success: false, message: 'Webhook processing error' });
    }
  }
);

module.exports = router;

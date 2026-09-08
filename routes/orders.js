const express = require('express');
const { serverError, badRequest } = require('../utils/response');
const { sendPaginated } = require('../utils/pagination');
const router = express.Router();
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Repair = require('../models/Repair');
const Notification = require('../models/Notification');
const Coupon = require('../models/Coupon');
const { toSafeString } = require('../utils/query');
const { authenticateAdmin, optionalAuthenticate } = require('../middleware/auth');
const { createPublicLimiter } = require('../middleware/rateLimiter');
const {
  createOrder,
  getOrders,
  getOrderById,
  updateOrder,
  deleteOrder,
} = require('../services/orderService');

const trackLimiter = createPublicLimiter();

const orderItemValidation = [
  body('items').isArray({ min: 1 }).withMessage('Order must contain at least one item'),
  body('items.*.product').notEmpty().withMessage('Product ID is required for each item'),
  body('items.*.quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
  body('customer.name').trim().notEmpty().withMessage('Customer name is required'),
  body('customer.email').isEmail().withMessage('Valid customer email is required').normalizeEmail(),
  body('customer.phone').trim().notEmpty().withMessage('Customer phone is required'),
  body('totalAmount').optional().isFloat({ min: 0 }).withMessage('Total amount must be a positive number')
];

const orderUpdateValidation = [
  body('status').optional().isIn(['Pending', 'Confirmed', 'Processing', 'Shipped', 'Delivered', 'Completed', 'Cancelled']).withMessage('Invalid status'),
  body('paymentStatus').optional().isIn(['Pending', 'Paid', 'Refunded']).withMessage('Invalid payment status')
];

// Aggregation pipeline for order statistics.
// Computes revenue, unique customer count, and products sold for a given date range.
const buildStatsPipeline = (matchStage) => [
  { $match: matchStage },
  { $unwind: { path: '$items', preserveNullAndEmptyArrays: true } },
  {
    $group: {
      _id: null,
      revenue: { $sum: { $ifNull: ['$totalAmount', 0] } },
      customers: { $addToSet: '$customer.email' },
      productsSold: { $sum: { $ifNull: ['$items.quantity', 0] } },
    },
  },
  {
    $project: {
      _id: 0,
      revenue: 1,
      customers: { $size: { $setDifference: ['$customers', [null, '']] } },
      productsSold: 1,
    },
  },
];

// Get the authenticated user's own orders with pagination.
router.get('/my-orders', optionalAuthenticate, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    const { page = 1, limit = 20 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const { orders, total } = await getOrders({ userId: req.user._id }, pageNum, limitNum);

    sendPaginated(res, orders, total, pageNum, limitNum);
  } catch (error) {
    serverError(res, error);
  }
});

// Get a single order belonging to the authenticated user.
// Ensures the order belongs to the requesting user (authorization check).
router.get('/my-orders/:id', optionalAuthenticate, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    const order = await getOrderById(req.params.id);
    if (!order || order.userId?.toString() !== req.user._id.toString()) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    res.json({ success: true, data: order });
  } catch (error) {
    serverError(res, error);
  }
});

// Get order statistics for the admin dashboard.
// Compares current month vs previous month for revenue, orders, customers, and products sold.
router.get('/stats', authenticateAdmin, async (req, res) => {
  try {
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const previousMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

    const [currentStats, previousStats, allStats, currentOrderCount, previousOrderCount, currentRepairCount, lowStockCount] = await Promise.all([
      Order.aggregate(buildStatsPipeline({ createdAt: { $gte: currentMonthStart } })),
      Order.aggregate(buildStatsPipeline({ createdAt: { $gte: previousMonthStart, $lte: previousMonthEnd } })),
      Order.aggregate(buildStatsPipeline({})),
      Order.countDocuments({ createdAt: { $gte: currentMonthStart } }),
      Order.countDocuments({ createdAt: { $gte: previousMonthStart, $lte: previousMonthEnd } }),
      Repair.countDocuments({ status: { $nin: ['Completed', 'Cancelled'] } }),
      Product.countDocuments({ stock: { $lte: 10 }, status: 'Active' }),
    ]);

    const currentRevenue = currentStats[0]?.revenue || 0;
    const previousRevenue = previousStats[0]?.revenue || 0;
    const currentCustomers = currentStats[0]?.customers || 0;
    const previousCustomers = previousStats[0]?.customers || 0;
    const currentProductsSold = currentStats[0]?.productsSold || 0;
    const previousProductsSold = previousStats[0]?.productsSold || 0;

    const totalRevenue = allStats[0]?.revenue || 0;
    const totalOrders = await Order.countDocuments({});
    const totalCustomers = allStats[0]?.customers || 0;
    const productsSold = allStats[0]?.productsSold || 0;
    const activeRepairs = currentRepairCount || 0;

    const revenueChange = previousRevenue > 0 ? Number(((currentRevenue - previousRevenue) / previousRevenue * 100).toFixed(1)) : 0;
    const ordersChange = previousOrderCount > 0 ? Number(((currentOrderCount - previousOrderCount) / previousOrderCount * 100).toFixed(1)) : 0;
    const customersChange = previousCustomers > 0 ? Number(((currentCustomers - previousCustomers) / previousCustomers * 100).toFixed(1)) : 0;
    const salesChange = previousProductsSold > 0 ? Number(((currentProductsSold - previousProductsSold) / previousProductsSold * 100).toFixed(1)) : 0;

    res.json({
      success: true,
      data: {
        totalRevenue,
        totalOrders,
        totalCustomers,
        productsSold,
        revenueChange,
        ordersChange,
        customersChange,
        salesChange,
        activeRepairs,
        lowStockCount,
      },
    });
  } catch (error) {
    serverError(res, error);
  }
});

// List all orders for admin with optional status filter and pagination.
router.get('/', authenticateAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    let query = {};

    const status = toSafeString(req.query.status);
    if (status) query.status = status;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

    const { orders, total } = await getOrders(query, pageNum, limitNum);

    sendPaginated(res, orders, total, pageNum, limitNum);
  } catch (error) {
    serverError(res, error);
  }
});

// Public order tracking by order ID or customer phone number.
// No authentication required so WhatsApp customers can track their orders.
// Must be defined before /:id to avoid Express matching 'track' as a route parameter.
router.get('/track', trackLimiter, async (req, res) => {
  try {
    const orderId = toSafeString(req.query.orderId);
    const phone = toSafeString(req.query.phone);

    if (!orderId && !phone) {
      return res.status(400).json({ success: false, message: 'Please provide an order ID or phone number' });
    }

    let query = {};
    if (orderId) {
      query._id = orderId;
    }
    if (phone) {
      query['customer.phone'] = phone;
    }

    const order = await Order.findOne(query).populate('items.product');
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    res.json({ success: true, data: order });
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(400).json({ success: false, message: 'Invalid order ID format' });
    }
    serverError(res, error);
  }
});

// Get a single order by ID. Admin-only.
router.get('/:id', authenticateAdmin, async (req, res) => {
  try {
    const order = await getOrderById(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    res.json({ success: true, data: order });
  } catch (error) {
    serverError(res, error);
  }
});

// Create a new order. Public endpoint (optional auth for user tracking).
// Stock is deducted atomically in orderService.createOrder.
router.post('/', optionalAuthenticate, orderItemValidation, validate, async (req, res) => {
  try {
    const { items, customer, paymentMethod, notes, coupon, totalAmount } = req.body;
    let computedTotal = 0;
    let discount = 0;

    if (coupon && coupon.code) {
      const couponDoc = await Coupon.findOne({ code: coupon.code.toUpperCase(), status: 'Active' });
      if (!couponDoc) {
        return res.status(400).json({ success: false, message: 'Invalid coupon code' });
      }
      if (couponDoc.expires && new Date() > new Date(couponDoc.expires)) {
        return res.status(400).json({ success: false, message: 'Coupon has expired' });
      }

      const productIds = items.map(i => typeof i.product === 'object' ? i.product._id || i.product : i.product);
      if (couponDoc.products && couponDoc.products.length > 0) {
        const hasMatch = couponDoc.products.some(p => productIds.includes(String(p)));
        if (!hasMatch) {
          return res.status(400).json({ success: false, message: 'Coupon not valid for items in cart' });
        }
      }

      const categories = items.map(i => i.category).filter(Boolean);
      if (couponDoc.categories && couponDoc.categories.length > 0) {
        const hasMatch = couponDoc.categories.some(c => categories.includes(c));
        if (!hasMatch) {
          return res.status(400).json({ success: false, message: 'Coupon not valid for cart categories' });
        }
      }

      for (const item of items) {
        computedTotal += (item.price || 0) * (item.quantity || 0);
      }
      if (computedTotal < couponDoc.minOrder) {
        return res.status(400).json({ success: false, message: `Minimum order of R${couponDoc.minOrder} required` });
      }

      discount = couponDoc.type === 'Percentage'
        ? (computedTotal * couponDoc.discount) / 100
        : couponDoc.discount;
    }

    const order = await createOrder({
      items,
      customer,
      paymentMethod,
      notes,
      coupon,
      discount,
      totalAmount: totalAmount,
      userId: req.user ? req.user._id : undefined,
    });
    res.status(201).json({ success: true, data: order });
  } catch (error) {
    badRequest(res, error);
  }
});

// Update order status or payment status. Admin-only.
router.put('/:id', authenticateAdmin, orderUpdateValidation, validate, async (req, res) => {
  try {
    const { status, paymentStatus, notes } = req.body;
    const updateData = {};
    if (status !== undefined) updateData.status = status;
    if (paymentStatus !== undefined) updateData.paymentStatus = paymentStatus;
    if (notes !== undefined) updateData.notes = notes;

    const existingOrder = await Order.findById(req.params.id);
    if (!existingOrder) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const order = await updateOrder(req.params.id, updateData);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (status === 'Cancelled' && existingOrder.status !== 'Cancelled') {
      for (const item of order.items) {
        await Product.findByIdAndUpdate(item.product, { $inc: { stock: item.quantity } });
      }
      if (order.userId) {
        await Notification.create({
          userId: order.userId,
          type: 'order',
          title: 'Order Cancelled',
          message: `Order #${String(order._id).slice(-6).toUpperCase()} has been cancelled.`,
          data: { orderId: order._id, status: 'Cancelled' },
        });
      }
    }

    if (paymentStatus === 'Refunded' && existingOrder.paymentStatus !== 'Refunded') {
      for (const item of order.items) {
        await Product.findByIdAndUpdate(item.product, { $inc: { stock: item.quantity } });
      }
      if (order.userId) {
        await Notification.create({
          userId: order.userId,
          type: 'order',
          title: 'Payment Refunded',
          message: `Payment for order #${String(order._id).slice(-6).toUpperCase()} has been refunded.`,
          data: { orderId: order._id, paymentStatus: 'Refunded' },
        });
      }
    }

    if (status && status !== existingOrder.status && status !== 'Cancelled') {
      if (order.userId) {
        await Notification.create({
          userId: order.userId,
          type: 'order',
          title: 'Order Status Updated',
          message: `Order #${String(order._id).slice(-6).toUpperCase()} is now ${status}.`,
          data: { orderId: order._id, status },
        });
      }
    }

    res.json({ success: true, data: order });
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(400).json({ success: false, message: 'Invalid order ID format' });
    }
    serverError(res, error);
  }
});

// Delete an order by ID. Admin-only.
router.delete('/:id', authenticateAdmin, async (req, res) => {
  try {
    const order = await deleteOrder(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    res.json({ success: true, message: 'Order deleted successfully' });
  } catch (error) {
    serverError(res, error);
  }
});

module.exports = router;

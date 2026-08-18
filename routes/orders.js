const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Order = require('../models/Order');
const Product = require('../models/Product');
const { authenticate, authorize } = require('../middleware/auth');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  next();
};

const orderItemValidation = [
  body('items').isArray({ min: 1 }).withMessage('Order must contain at least one item'),
  body('items.*.product').notEmpty().withMessage('Product ID is required for each item'),
  body('items.*.quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
  body('customer.name').trim().notEmpty().withMessage('Customer name is required'),
  body('customer.email').isEmail().withMessage('Valid customer email is required').normalizeEmail(),
  body('customer.phone').trim().notEmpty().withMessage('Customer phone is required'),
  body('totalAmount').isFloat({ min: 0 }).withMessage('Total amount must be a positive number')
];

const orderUpdateValidation = [
  body('status').optional().isIn(['Pending', 'Processing', 'Shipped', 'Delivered', 'Completed', 'Cancelled']).withMessage('Invalid status'),
  body('paymentStatus').optional().isIn(['Pending', 'Paid', 'Refunded']).withMessage('Invalid payment status')
];

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

router.get('/stats', authenticate, authorize('admin'), async (req, res) => {
  try {
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const previousMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

    const [currentStats, previousStats, allStats, currentOrderCount, previousOrderCount] = await Promise.all([
      Order.aggregate(buildStatsPipeline({ createdAt: { $gte: currentMonthStart } })),
      Order.aggregate(buildStatsPipeline({ createdAt: { $gte: previousMonthStart, $lte: previousMonthEnd } })),
      Order.aggregate(buildStatsPipeline({})),
      Order.countDocuments({ createdAt: { $gte: currentMonthStart } }),
      Order.countDocuments({ createdAt: { $gte: previousMonthStart, $lte: previousMonthEnd } }),
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
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    let query = {};

    if (status) query.status = status;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const [orders, total] = await Promise.all([
      Order.find(query).populate('items.product').sort({ createdAt: -1 }).skip(skip).limit(limitNum),
      Order.countDocuments(query)
    ]);

    res.json({
      success: true,
      count: orders.length,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
      data: orders
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).populate('items.product');
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    res.json({ success: true, data: order });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/', orderItemValidation, validate, async (req, res) => {
  try {
    const { items, customer, totalAmount, paymentMethod, status, paymentStatus, notes } = req.body;

    for (const item of items) {
      const updatedProduct = await Product.findOneAndUpdate(
        { _id: item.product, stock: { $gte: item.quantity } },
        { $inc: { stock: -item.quantity } },
        { new: true }
      );

      if (!updatedProduct) {
        const product = await Product.findById(item.product);
        if (!product) {
          return res.status(400).json({
            success: false,
            message: `Product ${item.product} not found`
          });
        }
        return res.status(400).json({
          success: false,
          message: `Insufficient stock for ${product.name}`
        });
      }
    }

    const order = await Order.create({
      items,
      customer,
      totalAmount,
      paymentMethod,
      status: status || 'Pending',
      paymentStatus: paymentStatus || 'Pending',
      notes
    });

    res.status(201).json({ success: true, data: order });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.put('/:id', authenticate, authorize('admin'), orderUpdateValidation, validate, async (req, res) => {
  try {
    const { status, paymentStatus, notes } = req.body;
    const updateData = {};
    if (status !== undefined) updateData.status = status;
    if (paymentStatus !== undefined) updateData.paymentStatus = paymentStatus;
    if (notes !== undefined) updateData.notes = notes;

    const order = await Order.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    ).populate('items.product');

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    res.json({ success: true, data: order });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.delete('/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const order = await Order.findByIdAndDelete(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    res.json({ success: true, message: 'Order deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;

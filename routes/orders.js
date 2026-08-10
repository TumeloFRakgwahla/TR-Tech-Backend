const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const Product = require('../models/Product');

// Get order stats
router.get('/stats', async (req, res) => {
  try {
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const previousMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

    const [currentOrders, previousOrders, allOrders] = await Promise.all([
      Order.find({ createdAt: { $gte: currentMonthStart } }),
      Order.find({ createdAt: { $gte: previousMonthStart, $lte: previousMonthEnd } }),
      Order.find({})
    ]);

    const currentRevenue = currentOrders.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);
    const previousRevenue = previousOrders.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);

    const currentCustomers = new Set(currentOrders.map(o => o.customer?.email).filter(Boolean)).size;
    const previousCustomers = new Set(previousOrders.map(o => o.customer?.email).filter(Boolean)).size;

    const currentProductsSold = currentOrders.reduce((sum, order) => sum + order.items.reduce((s, item) => s + Number(item.quantity || 0), 0), 0);
    const previousProductsSold = previousOrders.reduce((sum, order) => sum + order.items.reduce((s, item) => s + Number(item.quantity || 0), 0), 0);

    const totalRevenue = allOrders.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);
    const totalOrders = allOrders.length;
    const totalCustomers = new Set(allOrders.map(o => o.customer?.email).filter(Boolean)).size;
    const productsSold = allOrders.reduce((sum, order) => sum + order.items.reduce((s, item) => s + Number(item.quantity || 0), 0), 0);

    const revenueChange = previousRevenue > 0 ? Number(((currentRevenue - previousRevenue) / previousRevenue * 100).toFixed(1)) : 0;
    const ordersChange = previousOrders.length > 0 ? Number(((currentOrders.length - previousOrders.length) / previousOrders.length * 100).toFixed(1)) : 0;
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
        salesChange
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get all orders
router.get('/', async (req, res) => {
  try {
    const { status } = req.query;
    let query = {};

    if (status) query.status = status;

    const orders = await Order.find(query).populate('items.product').sort({ createdAt: -1 });
    res.json({ success: true, count: orders.length, data: orders });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get single order
router.get('/:id', async (req, res) => {
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

// Create order
router.post('/', async (req, res) => {
  try {
    const { items, customer, totalAmount, paymentMethod, status, paymentStatus, notes } = req.body;

    // Update product stock
    for (const item of items) {
      const product = await Product.findById(item.product);
      if (product) {
        product.stock -= item.quantity;
        if (product.stock < 0) {
          return res.status(400).json({
            success: false,
            message: `Insufficient stock for ${product.name}`
          });
        }
        await product.save();
      }
    }

    const order = await Order.create({
      items,
      customer,
      totalAmount,
      paymentMethod,
      status,
      paymentStatus,
      notes
    });

    res.status(201).json({ success: true, data: order });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Update order status
router.put('/:id', async (req, res) => {
  try {
    const { status } = req.body;
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { status },
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

// Get order stats
router.get('/stats', async (req, res) => {
  try {
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const previousMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

    const [currentOrders, previousOrders, allOrders] = await Promise.all([
      Order.find({ createdAt: { $gte: currentMonthStart } }),
      Order.find({ createdAt: { $gte: previousMonthStart, $lte: previousMonthEnd } }),
      Order.find({})
    ]);

    const currentRevenue = currentOrders.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);
    const previousRevenue = previousOrders.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);

    const currentCustomers = new Set(currentOrders.map(o => o.customer?.email).filter(Boolean)).size;
    const previousCustomers = new Set(previousOrders.map(o => o.customer?.email).filter(Boolean)).size;

    const currentProductsSold = currentOrders.reduce((sum, order) => sum + order.items.reduce((s, item) => s + Number(item.quantity || 0), 0), 0);
    const previousProductsSold = previousOrders.reduce((sum, order) => sum + order.items.reduce((s, item) => s + Number(item.quantity || 0), 0), 0);

    const totalRevenue = allOrders.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);
    const totalOrders = allOrders.length;
    const totalCustomers = new Set(allOrders.map(o => o.customer?.email).filter(Boolean)).size;
    const productsSold = allOrders.reduce((sum, order) => sum + order.items.reduce((s, item) => s + Number(item.quantity || 0), 0), 0);

    const revenueChange = previousRevenue > 0 ? Number(((currentRevenue - previousRevenue) / previousRevenue * 100).toFixed(1)) : 0;
    const ordersChange = previousOrders.length > 0 ? Number(((currentOrders.length - previousOrders.length) / previousOrders.length * 100).toFixed(1)) : 0;
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
        salesChange
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Delete order
router.delete('/:id', async (req, res) => {
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

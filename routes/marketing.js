const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');

router.use(authenticate, authorize('admin'));

router.get('/coupons', async (req, res) => {
  try {
    const { search } = req.query;
    let query = {};
    if (search) {
      query.code = { $regex: search, $options: 'i' };
    }
    const coupons = [];
    res.json({ success: true, count: coupons.length, data: coupons });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/coupons', async (req, res) => {
  try {
    res.status(201).json({ success: true, data: req.body });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.put('/coupons/:id', async (req, res) => {
  try {
    res.json({ success: true, data: req.body });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.delete('/coupons/:id', async (req, res) => {
  try {
    res.json({ success: true, message: 'Coupon deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/campaigns', async (req, res) => {
  try {
    const { search } = req.query;
    let query = {};
    if (search) {
      query.name = { $regex: search, $options: 'i' };
    }
    const campaigns = [];
    res.json({ success: true, count: campaigns.length, data: campaigns });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/campaigns', async (req, res) => {
  try {
    res.status(201).json({ success: true, data: req.body });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.put('/campaigns/:id', async (req, res) => {
  try {
    res.json({ success: true, data: req.body });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.delete('/campaigns/:id', async (req, res) => {
  try {
    res.json({ success: true, message: 'Campaign deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/promotions', async (req, res) => {
  try {
    const { search } = req.query;
    let query = {};
    if (search) {
      query.name = { $regex: search, $options: 'i' };
    }
    const promotions = [];
    res.json({ success: true, count: promotions.length, data: promotions });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/promotions', async (req, res) => {
  try {
    res.status(201).json({ success: true, data: req.body });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.put('/promotions/:id', async (req, res) => {
  try {
    res.json({ success: true, data: req.body });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.delete('/promotions/:id', async (req, res) => {
  try {
    res.json({ success: true, message: 'Promotion deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;

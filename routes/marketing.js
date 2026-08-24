const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const { authenticate, authorize } = require('../middleware/auth');
const Coupon = require('../models/Coupon');
const Campaign = require('../models/Campaign');
const Promotion = require('../models/Promotion');
const { serverError } = require('../utils/response');
const { sendPaginated } = require('../utils/pagination');
const { escapeRegex } = require('../utils/query');

router.get('/coupons', async (req, res) => {
  try {
    const { search, limit = 50, page = 1 } = req.query;
    const safeSearch = typeof search === 'string' ? escapeRegex(search) : undefined;
    let query = { status: 'Active' };
    if (safeSearch) {
      query.$or = [
        { code: { $regex: safeSearch, $options: 'i' } },
        { name: { $regex: safeSearch, $options: 'i' } },
      ];
    }
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const skip = (pageNum - 1) * limitNum;
    const [items, total] = await Promise.all([
      Coupon.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum),
      Coupon.countDocuments(query),
    ]);
    sendPaginated(res, items, total, pageNum, limitNum);
  } catch (error) {
    serverError(res, error);
  }
});

router.get('/campaigns', async (req, res) => {
  try {
    const { search, limit = 50, page = 1 } = req.query;
    const safeSearch = typeof search === 'string' ? escapeRegex(search) : undefined;
    let query = { status: 'Active' };
    if (safeSearch) {
      query.$or = [
        { name: { $regex: safeSearch, $options: 'i' } },
      ];
    }
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const skip = (pageNum - 1) * limitNum;
    const [items, total] = await Promise.all([
      Campaign.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum),
      Campaign.countDocuments(query),
    ]);
    sendPaginated(res, items, total, pageNum, limitNum);
  } catch (error) {
    serverError(res, error);
  }
});

router.get('/promotions', async (req, res) => {
  try {
    const { search, limit = 50, page = 1 } = req.query;
    const safeSearch = typeof search === 'string' ? escapeRegex(search) : undefined;
    let query = { status: 'Active' };
    if (safeSearch) {
      query.$or = [
        { title: { $regex: safeSearch, $options: 'i' } },
      ];
    }
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const skip = (pageNum - 1) * limitNum;
    const [items, total] = await Promise.all([
      Promotion.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum),
      Promotion.countDocuments(query),
    ]);
    sendPaginated(res, items, total, pageNum, limitNum);
  } catch (error) {
    serverError(res, error);
  }
});

router.use(authenticate, authorize('admin'));

router.post('/coupons', [
  body('code').trim().notEmpty().withMessage('Code is required').isLength({ max: 50 }),
  body('discount').isFloat({ min: 0 }).withMessage('Discount must be a non-negative number'),
  body('type').optional().isIn(['Percentage', 'Fixed']),
  body('minOrder').optional().isFloat({ min: 0 }),
], validate, async (req, res) => {
  try {
    const coupon = await Coupon.create({
      code: req.body.code,
      discount: req.body.discount,
      type: req.body.type || 'Percentage',
      minOrder: req.body.minOrder || 0,
      expires: req.body.expires || undefined,
      status: req.body.status || 'Active',
    });
    res.status(201).json({ success: true, data: coupon });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'A coupon with this code already exists' });
    }
    serverError(res, error);
  }
});

router.put('/coupons/:id', async (req, res) => {
  try {
    const coupon = await Coupon.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!coupon) return res.status(404).json({ success: false, message: 'Coupon not found' });
    res.json({ success: true, data: coupon });
  } catch (error) {
    serverError(res, error);
  }
});

router.delete('/coupons/:id', async (req, res) => {
  try {
    const coupon = await Coupon.findByIdAndDelete(req.params.id);
    if (!coupon) return res.status(404).json({ success: false, message: 'Coupon not found' });
    res.json({ success: true, message: 'Coupon deleted successfully' });
  } catch (error) {
    serverError(res, error);
  }
});

router.post('/campaigns', [
  body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 100 }),
  body('type').optional().isIn(['Email', 'SMS', 'Social', 'Other']),
], validate, async (req, res) => {
  try {
    const campaign = await Campaign.create({
      name: req.body.name,
      type: req.body.type || 'Email',
      content: req.body.content || '',
      status: req.body.status || 'Active',
    });
    res.status(201).json({ success: true, data: campaign });
  } catch (error) {
    serverError(res, error);
  }
});

router.put('/campaigns/:id', async (req, res) => {
  try {
    const campaign = await Campaign.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });
    res.json({ success: true, data: campaign });
  } catch (error) {
    serverError(res, error);
  }
});

router.delete('/campaigns/:id', async (req, res) => {
  try {
    const campaign = await Campaign.findByIdAndDelete(req.params.id);
    if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });
    res.json({ success: true, message: 'Campaign deleted successfully' });
  } catch (error) {
    serverError(res, error);
  }
});

router.post('/promotions', [
  body('title').trim().notEmpty().withMessage('Title is required').isLength({ max: 100 }),
  body('image').trim().notEmpty().withMessage('Image is required'),
  body('location').trim().notEmpty().withMessage('Location is required'),
  body('startDate').optional().isISO8601().withMessage('Invalid start date'),
  body('endDate').optional().isISO8601().withMessage('Invalid end date')
    .custom((value, { req }) => {
      if (value && req.body.startDate && new Date(value) <= new Date(req.body.startDate)) {
        throw new Error('End date must be after start date');
      }
      return true;
    }),
], validate, async (req, res) => {
  try {
    const promotion = await Promotion.create({
      title: req.body.title,
      image: req.body.image,
      link: req.body.link || '',
      location: req.body.location,
      startDate: req.body.startDate || undefined,
      endDate: req.body.endDate || undefined,
      status: req.body.status || 'Active',
    });
    res.status(201).json({ success: true, data: promotion });
  } catch (error) {
    serverError(res, error);
  }
});

router.put('/promotions/:id', async (req, res) => {
  try {
    const promotion = await Promotion.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!promotion) return res.status(404).json({ success: false, message: 'Promotion not found' });
    res.json({ success: true, data: promotion });
  } catch (error) {
    serverError(res, error);
  }
});

router.delete('/promotions/:id', async (req, res) => {
  try {
    const promotion = await Promotion.findByIdAndDelete(req.params.id);
    if (!promotion) return res.status(404).json({ success: false, message: 'Promotion not found' });
    res.json({ success: true, message: 'Promotion deleted successfully' });
  } catch (error) {
    serverError(res, error);
  }
});

module.exports = router;

const express = require('express');
const mongoose = require('mongoose');
const { serverError, badRequest, successResponse } = require('../utils/response');
const { sendPaginated } = require('../utils/pagination');
const router = express.Router();
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const Review = require('../models/Review');
const Product = require('../models/Product');
const { authenticate, authenticateAdmin, optionalAuthenticate } = require('../middleware/auth');

const reviewValidation = [
  body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
  body('title').optional().trim().isLength({ max: 200 }).withMessage('Title cannot exceed 200 characters'),
  body('comment').optional().trim().isLength({ max: 1000 }).withMessage('Comment cannot exceed 1000 characters')
];

// Get approved reviews for a specific product. Public endpoint.
router.get('/product/:productId', async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const [reviews, total, avgRating] = await Promise.all([
      Review.find({ product: req.params.productId, status: 'Approved' }).sort({ createdAt: -1 }).skip(skip).limit(limitNum),
      Review.countDocuments({ product: req.params.productId, status: 'Approved' }),
      Review.aggregate([
        { $match: { product: mongoose.Types.ObjectId(req.params.productId), status: 'Approved' } },
        { $group: { _id: null, avgRating: { $avg: '$rating' }, count: { $sum: 1 } } }
      ])
    ]);

    const rating = avgRating.length > 0 ? Number(avgRating[0].avgRating.toFixed(1)) : 0;

    res.json({
      success: true,
      data: reviews,
      rating,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum)
    });
  } catch (error) {
    serverError(res, error);
  }
});

// Create a new review. Authenticated users or guests with email can submit.
router.post('/', optionalAuthenticate, reviewValidation, validate, async (req, res) => {
  try {
    const { product, rating, title, comment, customerName, customerEmail } = req.body;

    const productDoc = await Product.findById(product);
    if (!productDoc) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const userId = req.user?._id || null;
    const existingReview = await Review.findOne({ product, userId: userId || null });

    if (existingReview) {
      return res.status(400).json({ success: false, message: 'You have already reviewed this product' });
    }

    const review = await Review.create({
      product,
      userId,
      customerName: customerName || (req.user ? `${req.user.firstName} ${req.user.lastName}` : 'Anonymous'),
      customerEmail: customerEmail || (req.user?.email || ''),
      rating,
      title,
      comment,
      verifiedPurchase: false,
      status: 'Pending'
    });

    res.status(201).json({ success: true, data: review });
  } catch (error) {
    badRequest(res, error);
  }
});

// List all reviews. Admin-only.
router.get('/', authenticateAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, status, product } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const query = {};
    if (status) query.status = status;
    if (product) query.product = product;

    const [reviews, total] = await Promise.all([
      Review.find(query).populate('product', 'name').populate('userId', 'firstName lastName email').sort({ createdAt: -1 }).skip(skip).limit(limitNum),
      Review.countDocuments(query)
    ]);

    sendPaginated(res, reviews, total, pageNum, limitNum);
  } catch (error) {
    serverError(res, error);
  }
});

// Update a review status (approve/reject). Admin-only.
router.put('/:id/status', authenticateAdmin, [
  body('status').isIn(['Pending', 'Approved', 'Rejected']).withMessage('Invalid status')
], validate, async (req, res) => {
  try {
    const review = await Review.findById(req.params.id);
    if (!review) {
      return res.status(404).json({ success: false, message: 'Review not found' });
    }

    review.status = req.body.status;
    await review.save();

    res.json({ success: true, data: review });
  } catch (error) {
    badRequest(res, error);
  }
});

// Delete a review. Admin-only.
router.delete('/:id', authenticateAdmin, async (req, res) => {
  try {
    const review = await Review.findByIdAndDelete(req.params.id);
    if (!review) {
      return res.status(404).json({ success: false, message: 'Review not found' });
    }
    res.json({ success: true, message: 'Review deleted successfully' });
  } catch (error) {
    serverError(res, error);
  }
});

module.exports = router;

const express = require('express');
const { serverError, badRequest } = require('../utils/response');
const router = express.Router();
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const Service = require('../models/Service');
const { authenticate, authorize } = require('../middleware/auth');
const { toSafeString } = require('../utils/query');

const serviceValidation = [
  body('name').trim().notEmpty().withMessage('Service name is required').isLength({ max: 100 }).withMessage('Name cannot exceed 100 characters'),
  body('description').trim().notEmpty().withMessage('Service description is required').isLength({ max: 500 }).withMessage('Description cannot exceed 500 characters'),
  body('category').trim().notEmpty().withMessage('Category is required'),
  body('price').isFloat({ min: 0 }).withMessage('Price must be a positive number'),
  body('status').optional().trim().isIn(['Active', 'Inactive']).withMessage('Invalid status')
];

router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    let query = {};

    const category = toSafeString(req.query.category);
    const status = toSafeString(req.query.status);

    if (category) query.category = category;
    if (status) query.status = status;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const [services, total] = await Promise.all([
      Service.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum),
      Service.countDocuments(query)
    ]);

    res.json({
      success: true,
      count: services.length,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
      data: services
    });
  } catch (error) {
    serverError(res, error);
  }
});

router.get('/:id', async (req, res) => {
  try {
    const service = await Service.findById(req.params.id);
    if (!service) {
      return res.status(404).json({ success: false, message: 'Service not found' });
    }
    res.json({ success: true, data: service });
  } catch (error) {
    serverError(res, error);
  }
});

router.post('/', authenticate, authorize('admin'), serviceValidation, validate, async (req, res) => {
  try {
    const { name, description, category, price, estimatedTime, image, icon, features, status } = req.body;
    const service = await Service.create({
      name, description, category, price,
      estimatedTime, image, icon, features,
      status: status || 'Active',
    });
    res.status(201).json({ success: true, data: service });
  } catch (error) {
    badRequest(res, error);
  }
});

router.put('/:id', authenticate, authorize('admin'), serviceValidation, validate, async (req, res) => {
  try {
    const { name, description, category, price, estimatedTime, image, icon, features, status } = req.body;
    const service = await Service.findByIdAndUpdate(
      req.params.id,
      { name, description, category, price, estimatedTime, image, icon, features, status },
      { new: true, runValidators: true }
    );
    if (!service) {
      return res.status(404).json({ success: false, message: 'Service not found' });
    }
    res.json({ success: true, data: service });
  } catch (error) {
    badRequest(res, error);
  }
});

router.delete('/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const service = await Service.findByIdAndDelete(req.params.id);
    if (!service) {
      return res.status(404).json({ success: false, message: 'Service not found' });
    }
    res.json({ success: true, message: 'Service deleted successfully' });
  } catch (error) {
    serverError(res, error);
  }
});

module.exports = router;

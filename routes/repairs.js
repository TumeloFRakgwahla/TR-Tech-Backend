const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Repair = require('../models/Repair');
const { authenticate, authorize } = require('../middleware/auth');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  next();
};

const repairValidation = [
  body('customer.name').trim().notEmpty().withMessage('Customer name is required'),
  body('customer.phone').trim().notEmpty().withMessage('Customer phone is required'),
  body('device.type').trim().notEmpty().withMessage('Device type is required'),
  body('issue').trim().notEmpty().withMessage('Issue description is required').isLength({ max: 1000 }).withMessage('Issue cannot exceed 1000 characters')
];

const repairUpdateValidation = [
  body('status').optional().isIn(['Pending', 'In Progress', 'Completed', 'Cancelled']).withMessage('Invalid status'),
  body('estimatedCost').optional().isFloat({ min: 0 }).withMessage('Estimated cost must be a positive number')
];

router.post('/', repairValidation, validate, async (req, res) => {
  try {
    const repair = await Repair.create(req.body);
    res.status(201).json({ success: true, data: repair });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.get('/', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { status } = req.query;
    let query = {};

    if (status) query.status = status;

    const pageNum = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const [repairs, total] = await Promise.all([
      Repair.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum),
      Repair.countDocuments(query)
    ]);

    res.json({
      success: true,
      count: repairs.length,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
      data: repairs
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const repair = await Repair.findById(req.params.id);
    if (!repair) {
      return res.status(404).json({ success: false, message: 'Repair not found' });
    }
    res.json({ success: true, data: repair });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/:id', authenticate, authorize('admin'), repairUpdateValidation, validate, async (req, res) => {
  try {
    const { status, notes, estimatedCost } = req.body;
    const updateData = {};
    if (status !== undefined) updateData.status = status;
    if (notes !== undefined) updateData.notes = notes;
    if (estimatedCost !== undefined) updateData.estimatedCost = estimatedCost;

    const repair = await Repair.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    if (!repair) {
      return res.status(404).json({ success: false, message: 'Repair not found' });
    }

    res.json({ success: true, data: repair });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.delete('/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const repair = await Repair.findByIdAndDelete(req.params.id);
    if (!repair) {
      return res.status(404).json({ success: false, message: 'Repair not found' });
    }
    res.json({ success: true, message: 'Repair deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;

const express = require('express');
const { serverError, badRequest } = require('../utils/response');
const { sendPaginated } = require('../utils/pagination');
const router = express.Router();
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const Repair = require('../models/Repair');
const { authenticateAdmin, authenticate } = require('../middleware/auth');
const { toSafeString } = require('../utils/query');
const { createPublicLimiter } = require('../middleware/rateLimiter');

// Validation rules for creating a repair request.
const repairValidation = [
  body('customer.name').trim().notEmpty().withMessage('Customer name is required'),
  body('customer.email').optional().isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('customer.phone').trim().notEmpty().withMessage('Customer phone is required'),
  body('device.type').trim().notEmpty().withMessage('Device type is required'),
  body('device.brand').optional().trim(),
  body('device.model').optional().trim(),
  body('issue').trim().notEmpty().withMessage('Issue description is required').isLength({ max: 1000 }).withMessage('Issue cannot exceed 1000 characters'),
  body('additionalInfo').optional().trim(),
  body('image').optional().trim(),
];

const repairLimiter = createPublicLimiter();

// Validation rules for updating a repair (admin-only).
const repairUpdateValidation = [
  body('status').optional().isIn(['Pending', 'In Progress', 'Completed', 'Cancelled']).withMessage('Invalid status'),
  body('estimatedCost').optional().isFloat({ min: 0 }).withMessage('Estimated cost must be a positive number')
];

// Submit a new repair request. Rate limited to prevent spam.
// Status is always set to 'Pending' server-side; client input is ignored.
router.post('/', repairLimiter, repairValidation, validate, async (req, res) => {
  try {
    const { customer, device, issue, additionalInfo, image } = req.body;
    const repair = await Repair.create({
      customer,
      device,
      issue,
      additionalInfo,
      image,
      // status and estimatedCost are server-controlled; never trust client input.
      status: 'Pending',
    });
    res.status(201).json({ success: true, data: repair });
  } catch (error) {
    badRequest(res, error);
  }
});

// Get the authenticated user's own repair requests with pagination.
router.get('/my-repairs', authenticate, async (req, res) => {
  try {
    const pageNum = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const [repairs, total] = await Promise.all([
      Repair.find({ 'customer.email': req.user.email }).sort({ createdAt: -1 }).skip(skip).limit(limitNum),
      Repair.countDocuments({ 'customer.email': req.user.email }),
    ]);

    sendPaginated(res, repairs, total, pageNum, limitNum);
  } catch (error) {
    serverError(res, error);
  }
});

// List all repair requests. Admin-only with optional status filter.
router.get('/', authenticateAdmin, async (req, res) => {
  try {
    const status = toSafeString(req.query.status);
    let query = {};

    if (status) query.status = status;

    const pageNum = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const [repairs, total] = await Promise.all([
      Repair.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum),
      Repair.countDocuments(query)
    ]);

    sendPaginated(res, repairs, total, pageNum, limitNum);
  } catch (error) {
    serverError(res, error);
  }
});

// Get a single repair request by ID. Admin-only.
router.get('/:id', authenticateAdmin, async (req, res) => {
  try {
    const repair = await Repair.findById(req.params.id);
    if (!repair) {
      return res.status(404).json({ success: false, message: 'Repair not found' });
    }
    res.json({ success: true, data: repair });
  } catch (error) {
    serverError(res, error);
  }
});

// Update repair status or estimated cost. Admin-only.
router.put('/:id', authenticateAdmin, repairUpdateValidation, validate, async (req, res) => {
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

// Delete a repair request by ID. Admin-only.
router.delete('/:id', authenticateAdmin, async (req, res) => {
  try {
    const repair = await Repair.findByIdAndDelete(req.params.id);
    if (!repair) {
      return res.status(404).json({ success: false, message: 'Repair not found' });
    }
    res.json({ success: true, message: 'Repair deleted successfully' });
  } catch (error) {
    serverError(res, error);
  }
});

module.exports = router;

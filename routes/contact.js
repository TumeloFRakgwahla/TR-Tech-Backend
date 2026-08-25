const express = require('express');
const { serverError, badRequest } = require('../utils/response');
const { sendPaginated } = require('../utils/pagination');
const router = express.Router();
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const Contact = require('../models/Contact');
const { authenticateAdmin } = require('../middleware/auth');
const { toSafeString } = require('../utils/query');
const { createPublicLimiter } = require('../middleware/rateLimiter');

const contactLimiter = createPublicLimiter();

const contactValidation = [
  body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 100 }).withMessage('Name cannot exceed 100 characters'),
  body('email').isEmail().withMessage('Please enter a valid email').normalizeEmail(),
  body('phone').trim().notEmpty().withMessage('Phone number is required'),
  body('subject').trim().notEmpty().withMessage('Subject is required').isLength({ max: 200 }).withMessage('Subject cannot exceed 200 characters'),
  body('message').trim().notEmpty().withMessage('Message is required').isLength({ max: 1000 }).withMessage('Message cannot exceed 1000 characters')
];

router.post('/', contactLimiter, contactValidation, validate, async (req, res) => {
  try {
    const contact = await Contact.create(req.body);
    res.status(201).json({ success: true, data: contact });
  } catch (error) {
    badRequest(res, error);
  }
});

router.get('/', authenticateAdmin, async (req, res) => {
  try {
    const status = toSafeString(req.query.status);
    let query = {};

    if (status) query.status = status;

    const pageNum = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const [contacts, total] = await Promise.all([
      Contact.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum),
      Contact.countDocuments(query)
    ]);

    sendPaginated(res, contacts, total, pageNum, limitNum);
  } catch (error) {
    serverError(res, error);
  }
});

router.get('/:id', authenticateAdmin, async (req, res) => {
  try {
    const contact = await Contact.findById(req.params.id);
    if (!contact) {
      return res.status(404).json({ success: false, message: 'Contact not found' });
    }
    res.json({ success: true, data: contact });
  } catch (error) {
    serverError(res, error);
  }
});

router.put('/:id', authenticateAdmin, [
  body('status').optional().isIn(['New', 'Read', 'Replied', 'Closed']).withMessage('Invalid status')
], validate, async (req, res) => {
  try {
    const { status } = req.body;
    const contact = await Contact.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );

    if (!contact) {
      return res.status(404).json({ success: false, message: 'Contact not found' });
    }

    res.json({ success: true, data: contact });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.delete('/:id', authenticateAdmin, async (req, res) => {
  try {
    const contact = await Contact.findByIdAndDelete(req.params.id);
    if (!contact) {
      return res.status(404).json({ success: false, message: 'Contact not found' });
    }
    res.json({ success: true, message: 'Contact deleted successfully' });
  } catch (error) {
    serverError(res, error);
  }
});

module.exports = router;

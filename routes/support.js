const express = require('express');
const crypto = require('crypto');
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const { authenticateAdmin } = require('../middleware/auth');
const { serverError, badRequest } = require('../utils/response');
const { sendPaginated } = require('../utils/pagination');
const { toSafeString, escapeRegex } = require('../utils/query');
const { createPublicLimiter } = require('../middleware/rateLimiter');
const SupportTicket = require('../models/SupportTicket');

const router = express.Router();

const submitLimiter = createPublicLimiter();

const ticketValidation = [
  body('customerName').trim().notEmpty().withMessage('Customer name is required').isLength({ max: 200 }).withMessage('Name cannot exceed 200 characters'),
  body('customerEmail').isEmail().withMessage('Please enter a valid email').normalizeEmail(),
  body('customerPhone').optional().trim().isLength({ max: 20 }).withMessage('Phone cannot exceed 20 characters'),
  body('subject').trim().notEmpty().withMessage('Subject is required').isLength({ max: 200 }).withMessage('Subject cannot exceed 200 characters'),
  body('category').optional().trim().isIn(['General', 'Order', 'Repair', 'Technical', 'Billing', 'Other']).withMessage('Invalid category'),
  body('priority').optional().trim().isIn(['Low', 'Medium', 'High', 'Urgent']).withMessage('Invalid priority'),
  body('message').trim().notEmpty().withMessage('Message is required').isLength({ max: 2000 }).withMessage('Message cannot exceed 2000 characters'),
];

const generateTicketNumber = async () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let unique = false;
  while (!unique) {
    const suffix = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    const ticketNumber = `TK-${suffix}`;
    const existing = await SupportTicket.findOne({ ticketNumber });
    if (!existing) return ticketNumber;
  }
  return `TK-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
};

router.post('/', submitLimiter, ticketValidation, validate, async (req, res) => {
  try {
    const { customerName, customerEmail, customerPhone, subject, category, priority, message } = req.body;
    const ticketNumber = await generateTicketNumber();
    const ticket = await SupportTicket.create({
      ticketNumber,
      customerName,
      customerEmail,
      customerPhone,
      subject,
      category: category || 'General',
      priority: priority || 'Medium',
      message,
      messages: [{
        senderName: customerName,
        senderType: 'customer',
        message,
      }],
    });
    res.status(201).json({ success: true, data: ticket });
  } catch (error) {
    serverError(res, error);
  }
});

router.get('/', authenticateAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    let query = {};

    const status = toSafeString(req.query.status);
    if (status) query.status = status;

    const search = toSafeString(req.query.search);
    if (search) {
      query.$or = [
        { ticketNumber: { $regex: escapeRegex(search), $options: 'i' } },
        { customerName: { $regex: escapeRegex(search), $options: 'i' } },
        { customerEmail: { $regex: escapeRegex(search), $options: 'i' } },
        { subject: { $regex: escapeRegex(search), $options: 'i' } },
      ];
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const [tickets, total] = await Promise.all([
      SupportTicket.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum),
      SupportTicket.countDocuments(query)
    ]);

    res.json({
      success: true,
      tickets,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum),
    });
  } catch (error) {
    serverError(res, error);
  }
});

router.get('/:id', async (req, res) => {
  try {
    const id = req.params.id;

    let query = {};
    if (id.length === 24 && id.match(/^[0-9a-fA-F]{24}$/)) {
      query._id = id;
    } else {
      query.ticketNumber = id.toUpperCase();
    }

    const ticket = await SupportTicket.findOne(query);
    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    res.json({ success: true, data: ticket });
  } catch (error) {
    serverError(res, error);
  }
});

const updateTicketValidation = [
  body('status').optional().isIn(['Open', 'In Progress', 'Resolved', 'Closed']).withMessage('Invalid status'),
  body('priority').optional().isIn(['Low', 'Medium', 'High', 'Urgent']).withMessage('Invalid priority'),
  body('category').optional().trim().isIn(['General', 'Order', 'Repair', 'Technical', 'Billing', 'Other']).withMessage('Invalid category'),
  body('message').optional().trim().isLength({ max: 2000 }).withMessage('Message cannot exceed 2000 characters'),
  body('adminNotes').optional().trim(),
  body('assignedTo').optional().isMongoId().withMessage('Invalid assignedTo ID'),
];

router.put('/:id', authenticateAdmin, updateTicketValidation, validate, async (req, res) => {
  try {
    const { status, priority, category, message, adminNotes, assignedTo } = req.body;
    const ticket = await SupportTicket.findById(req.params.id);

    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    if (status !== undefined) ticket.status = status;
    if (priority !== undefined) ticket.priority = priority;
    if (category !== undefined) ticket.category = category;
    if (adminNotes !== undefined) ticket.adminNotes = adminNotes;
    if (assignedTo !== undefined) ticket.assignedTo = assignedTo;

    if (message) {
      const ticketObj = ticket.toObject();
      const lastMessage = ticket.messages.length > 0 ? ticket.messages[ticket.messages.length - 1] : null;
      const senderName = lastMessage && lastMessage.senderType === 'admin'
        ? lastMessage.senderName
        : 'Admin';
      ticket.messages.push({
        senderName,
        senderType: 'admin',
        message,
      });
      void ticketObj;
    }

    await ticket.save();
    res.json({ success: true, data: ticket });
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(400).json({ success: false, message: 'Invalid ticket ID' });
    }
    serverError(res, error);
  }
});

router.delete('/:id', authenticateAdmin, async (req, res) => {
  try {
    const ticket = await SupportTicket.findByIdAndDelete(req.params.id);
    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }
    res.json({ success: true, message: 'Ticket deleted successfully' });
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(400).json({ success: false, message: 'Invalid ticket ID' });
    }
    serverError(res, error);
  }
});

module.exports = router;

const express = require('express');
const { serverError, badRequest, successResponse } = require('../utils/response');
const { sendPaginated } = require('../utils/pagination');
const router = express.Router();
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const SupportTicket = require('../models/SupportTicket');
const { authenticate, authenticateAdmin, optionalAuthenticate } = require('../middleware/auth');
const { createPublicLimiter } = require('../middleware/rateLimiter');

const ticketValidation = [
  body('subject').trim().notEmpty().withMessage('Subject is required').isLength({ max: 200 }).withMessage('Subject cannot exceed 200 characters'),
  body('category').optional().isIn(['General', 'Order', 'Repair', 'Technical', 'Billing', 'Other']).withMessage('Invalid category'),
  body('priority').optional().isIn(['Low', 'Medium', 'High', 'Urgent']).withMessage('Invalid priority'),
  body('message').trim().notEmpty().withMessage('Message is required').isLength({ max: 2000 }).withMessage('Message cannot exceed 2000 characters'),
  body('customerName').trim().notEmpty().withMessage('Customer name is required'),
  body('customerEmail').isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('customerPhone').optional().trim()
];

const ticketUpdateValidation = [
  body('status').optional().isIn(['Open', 'In Progress', 'Resolved', 'Closed']).withMessage('Invalid status'),
  body('priority').optional().isIn(['Low', 'Medium', 'High', 'Urgent']).withMessage('Invalid priority'),
  body('category').optional().isIn(['General', 'Order', 'Repair', 'Technical', 'Billing', 'Other']).withMessage('Invalid category'),
  body('assignedTo').optional().isMongoId().withMessage('Invalid assigned user ID'),
  body('message').optional().trim().isLength({ max: 2000 }).withMessage('Message cannot exceed 2000 characters')
];

// Submit a new support ticket. Public endpoint so customers can submit without an account.
router.post('/', createPublicLimiter, ticketValidation, validate, async (req, res) => {
  try {
    const { subject, category, priority, message, customerName, customerEmail, customerPhone } = req.body;

    const ticket = await SupportTicket.create({
      subject,
      category: category || 'General',
      priority: priority || 'Medium',
      customerName,
      customerEmail,
      customerPhone,
      messages: [
        {
          senderName: customerName,
          message,
          senderRole: 'customer'
        }
      ]
    });

    res.status(201).json({ success: true, data: ticket });
  } catch (error) {
    badRequest(res, error);
  }
});

// List support tickets. Admin sees all, authenticated customers see only their own.
router.get('/', authenticateAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, status, category, priority } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const query = {};
    if (status) query.status = status;
    if (category) query.category = category;
    if (priority) query.priority = priority;

    const [tickets, total] = await Promise.all([
      SupportTicket.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum),
      SupportTicket.countDocuments(query)
    ]);

    sendPaginated(res, tickets, total, pageNum, limitNum);
  } catch (error) {
    serverError(res, error);
  }
});

// Get a single ticket by ID. Admin can view any ticket; customers can view their own.
router.get('/:id', optionalAuthenticate, async (req, res) => {
  try {
    const ticket = await SupportTicket.findById(req.params.id);
    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    if (req.user && req.user.role !== 'customer') {
      return res.json({ success: true, data: ticket });
    }

    if (req.user && ticket.userId && ticket.userId.toString() === req.user._id.toString()) {
      return res.json({ success: true, data: ticket });
    }

    return res.status(404).json({ success: false, message: 'Ticket not found' });
  } catch (error) {
    serverError(res, error);
  }
});

// Update a ticket. Admin-only for status/priority changes; customers can add messages.
router.put('/:id', optionalAuthenticate, ticketUpdateValidation, validate, async (req, res) => {
  try {
    const ticket = await SupportTicket.findById(req.params.id);
    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    const isAdmin = req.user && ['admin', 'manager', 'staff'].includes(req.user.role);
    const isOwner = req.user && ticket.userId && ticket.userId.toString() === req.user._id.toString();

    if (!isAdmin && !isOwner) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    if (isAdmin) {
      if (req.body.status) {
        ticket.status = req.body.status;
        if (req.body.status === 'Resolved' && !ticket.resolvedAt) {
          ticket.resolvedAt = new Date();
        }
        if (req.body.status === 'Closed' && !ticket.closedAt) {
          ticket.closedAt = new Date();
        }
      }
      if (req.body.priority) ticket.priority = req.body.priority;
      if (req.body.category) ticket.category = req.body.category;
      if (req.body.assignedTo) ticket.assignedTo = req.body.assignedTo;
    }

    if (req.body.message) {
      ticket.messages.push({
        senderId: req.user?._id || null,
        senderRole: req.user?.role || 'customer',
        senderName: req.user ? `${req.user.firstName} ${req.user.lastName}` : ticket.customerName,
        message: req.body.message
      });
    }

    await ticket.save();
    res.json({ success: true, data: ticket });
  } catch (error) {
    badRequest(res, error);
  }
});

// Delete a ticket. Admin-only.
router.delete('/:id', authenticateAdmin, async (req, res) => {
  try {
    const ticket = await SupportTicket.findByIdAndDelete(req.params.id);
    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }
    res.json({ success: true, message: 'Ticket deleted successfully' });
  } catch (error) {
    serverError(res, error);
  }
});

module.exports = router;

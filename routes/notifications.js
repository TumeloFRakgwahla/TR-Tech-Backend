const express = require('express');
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const { authenticate, authenticateAdmin } = require('../middleware/auth');
const { serverError } = require('../utils/response');
const { sendPaginated } = require('../utils/pagination');
const { toSafeString } = require('../utils/query');
const Notification = require('../models/Notification');

const router = express.Router();

router.get('/', authenticate, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    let query = { userId: req.user._id };

    const isRead = toSafeString(req.query.read);
    if (isRead === 'true') query.read = true;
    else if (isRead === 'false') query.read = false;

    const type = toSafeString(req.query.type);
    if (type) query.type = type;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const [notifications, total] = await Promise.all([
      Notification.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum),
      Notification.countDocuments(query)
    ]);

    sendPaginated(res, notifications, total, pageNum, limitNum);
  } catch (error) {
    serverError(res, error);
  }
});

router.get('/unread-count', authenticate, async (req, res) => {
  try {
    const count = await Notification.countDocuments({
      userId: req.user._id,
      read: false
    });
    res.json({ success: true, data: { unreadCount: count } });
  } catch (error) {
    serverError(res, error);
  }
});

router.put('/read-all', authenticate, async (req, res) => {
  try {
    await Notification.updateMany(
      { userId: req.user._id, read: false },
      { $set: { read: true, readAt: new Date() } }
    );
    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (error) {
    serverError(res, error);
  }
});

router.put('/:id/read', authenticate, async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { read: true, readAt: new Date() },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    res.json({ success: true, data: notification });
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(400).json({ success: false, message: 'Invalid notification ID' });
    }
    serverError(res, error);
  }
});

router.delete('/:id', authenticate, async (req, res) => {
  try {
    const notification = await Notification.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    res.json({ success: true, message: 'Notification deleted successfully' });
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(400).json({ success: false, message: 'Invalid notification ID' });
    }
    serverError(res, error);
  }
});

const sendValidation = [
  body('userId').notEmpty().withMessage('userId is required'),
  body('type').notEmpty().isIn(['order', 'repair', 'promotion', 'security', 'system']).withMessage('Invalid notification type'),
  body('title').trim().notEmpty().withMessage('Title is required').isLength({ max: 200 }),
  body('message').trim().notEmpty().withMessage('Message is required').isLength({ max: 1000 }),
];

router.post('/send', authenticateAdmin, sendValidation, validate, async (req, res) => {
  try {
    const { userId, type, title, message, data } = req.body;
    const notification = await Notification.create({
      userId,
      type,
      title,
      message,
      data: data || {},
    });
    res.status(201).json({ success: true, data: notification });
  } catch (error) {
    serverError(res, error);
  }
});

module.exports = router;

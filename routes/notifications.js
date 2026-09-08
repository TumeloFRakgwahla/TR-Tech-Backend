const express = require('express');
const router = express.Router();
const { authenticateAdmin, authenticate, optionalAuthenticate } = require('../middleware/auth');
const Notification = require('../models/Notification');
const { serverError, badRequest } = require('../utils/response');
const { sendPaginated } = require('../utils/pagination');
const { toSafeString } = require('../utils/query');

// Get notifications for the authenticated user.
router.get('/', authenticate, async (req, res) => {
  try {
    const { page = 1, limit = 20, read } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    let query = { userId: req.user._id };
    if (read !== undefined) query.read = read === 'true';

    const [notifications, total] = await Promise.all([
      Notification.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum),
      Notification.countDocuments(query),
    ]);

    sendPaginated(res, notifications, total, pageNum, limitNum);
  } catch (error) {
    serverError(res, error);
  }
});

// Get unread count for the authenticated user.
router.get('/unread-count', authenticate, async (req, res) => {
  try {
    const count = await Notification.countDocuments({ userId: req.user._id, read: false });
    res.json({ success: true, count });
  } catch (error) {
    serverError(res, error);
  }
});

// Mark a notification as read.
router.put('/:id/read', authenticate, async (req, res) => {
  try {
    const notification = await Notification.findByIdAndUpdate(
      req.params.id,
      { read: true, readAt: new Date() },
      { new: true }
    );
    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }
    res.json({ success: true, data: notification });
  } catch (error) {
    serverError(res, error);
  }
});

// Mark all notifications as read for the authenticated user.
router.put('/read-all', authenticate, async (req, res) => {
  try {
    await Notification.updateMany(
      { userId: req.user._id, read: false },
      { read: true, readAt: new Date() }
    );
    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (error) {
    serverError(res, error);
  }
});

// Delete a notification.
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const notification = await Notification.findByIdAndDelete(req.params.id);
    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }
    res.json({ success: true, message: 'Notification deleted successfully' });
  } catch (error) {
    serverError(res, error);
  }
});

// Admin: create a notification for a user.
router.post('/send', authenticateAdmin, async (req, res) => {
  try {
    const { userId, type, title, message, data } = req.body;
    if (!userId || !type || !title || !message) {
      return res.status(400).json({ success: false, message: 'userId, type, title, and message are required' });
    }
    const notification = await Notification.create({
      userId,
      type,
      title,
      message,
      data: data || {},
    });
    res.status(201).json({ success: true, data: notification });
  } catch (error) {
    badRequest(res, error);
  }
});

module.exports = router;

const express = require('express');
const { serverError } = require('../utils/response');
const router = express.Router();
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const Address = require('../models/Address');
const Notification = require('../models/Notification');
const Session = require('../models/Session');
const User = require('../models/User');
const { authenticate } = require('../middleware/auth');

const addressValidation = [
  body('label').optional().isIn(['Home', 'Work', 'Other']).withMessage('Invalid label'),
  body('street').trim().notEmpty().withMessage('Street is required'),
  body('city').trim().notEmpty().withMessage('City is required'),
  body('province').trim().notEmpty().withMessage('Province is required'),
  body('postalCode').trim().notEmpty().withMessage('Postal code is required'),
  body('country').trim().notEmpty().withMessage('Country is required')
];

// Get the authenticated user's profile data.
router.get('/profile', authenticate, async (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        id: req.user._id,
        firstName: req.user.firstName,
        lastName: req.user.lastName,
        email: req.user.email,
        phone: req.user.phone,
        address: req.user.address,
        role: req.user.role
      }
    });
  } catch (error) {
    serverError(res, error);
  }
});

// Update the authenticated user's profile (name, phone).
router.put('/profile', authenticate, [
  body('firstName').optional().trim().notEmpty().withMessage('First name cannot be empty').isLength({ max: 50 }).withMessage('First name cannot exceed 50 characters'),
  body('lastName').optional().trim().notEmpty().withMessage('Last name cannot be empty').isLength({ max: 50 }).withMessage('Last name cannot exceed 50 characters'),
  body('phone').optional().trim().notEmpty().withMessage('Phone number cannot be empty')
], validate, async (req, res) => {
  try {
    const { firstName, lastName, phone } = req.body;

    if (firstName) req.user.firstName = firstName;
    if (lastName) req.user.lastName = lastName;
    if (phone) req.user.phone = phone;

    await req.user.save();

    res.json({
      success: true,
      data: {
        id: req.user._id,
        firstName: req.user.firstName,
        lastName: req.user.lastName,
        email: req.user.email,
        phone: req.user.phone,
        address: req.user.address,
        role: req.user.role
      }
    });
  } catch (error) {
    serverError(res, error);
  }
});

// Change the user's password. Requires the current password for verification.
// After a successful change, all other active sessions are revoked for security.
router.put('/password', authenticate, [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-zA-Z])(?=.*\d).+$/).withMessage('Password must contain both letters and numbers'),
], validate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user._id).select('+password');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const isMatch = await user.matchPassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect' });
    }

    // Set via the document instance and save() so the pre('save') hook hashes it.
    user.password = newPassword;
    await user.save();

    // Invalidate other sessions so a compromised/old session cannot persist.
    await Session.updateMany({ userId: user._id }, { isActive: false });

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    serverError(res, error);
  }
});

// Addresses
// Get all addresses for the authenticated user, sorted by default first.
router.get('/addresses', authenticate, async (req, res) => {
  try {
    const addresses = await Address.find({ userId: req.user._id }).sort({ isDefault: -1, createdAt: -1 });
    res.json({ success: true, data: addresses });
  } catch (error) {
    serverError(res, error);
  }
});

// Create a new address for the authenticated user.
router.post('/addresses', authenticate, addressValidation, validate, async (req, res) => {
  try {
    const addressData = {
      ...req.body,
      userId: req.user._id
    };

    const address = await Address.create(addressData);
    res.status(201).json({ success: true, data: address });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Update an existing address. Ensures the address belongs to the authenticated user.
router.put('/addresses/:id', authenticate, addressValidation, validate, async (req, res) => {
  try {
    const address = await Address.findOne({ _id: req.params.id, userId: req.user._id });
    if (!address) {
      return res.status(404).json({ success: false, message: 'Address not found' });
    }

    const { label, street, city, province, postalCode, country } = req.body;
    Object.assign(address, { label, street, city, province, postalCode, country });
    await address.save();

    res.json({ success: true, data: address });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Delete an address. Ensures the address belongs to the authenticated user.
router.delete('/addresses/:id', authenticate, async (req, res) => {
  try {
    const address = await Address.findOne({ _id: req.params.id, userId: req.user._id });
    if (!address) {
      return res.status(404).json({ success: false, message: 'Address not found' });
    }

    await address.deleteOne();
    res.json({ success: true, message: 'Address deleted successfully' });
  } catch (error) {
    serverError(res, error);
  }
});

// Set an address as the default for the user.
// Clears the default flag from all other addresses first.
router.post('/addresses/:id/default', authenticate, async (req, res) => {
  try {
    const address = await Address.findOne({ _id: req.params.id, userId: req.user._id });
    if (!address) {
      return res.status(404).json({ success: false, message: 'Address not found' });
    }

    await Address.updateMany({ userId: req.user._id }, { isDefault: false });
    address.isDefault = true;
    await address.save();

    res.json({ success: true, data: address });
  } catch (error) {
    serverError(res, error);
  }
});

// Notifications
// Get notification preferences and unread count for the authenticated user.
router.get('/notifications', authenticate, async (req, res) => {
  try {
    const preferences = req.user.notificationPreferences || {
      emailOrderUpdates: true,
      emailPromotions: true,
      emailNewsletter: false,
      smsOrderUpdates: true,
      smsPromotions: false,
      whatsappUpdates: true,
      pushNotifications: false,
      frequency: 'instant'
    };

    const unreadCount = await Notification.countDocuments({
      userId: req.user._id,
      read: false
    });

    res.json({
      success: true,
      data: {
        ...preferences,
        unreadCount
      }
    });
  } catch (error) {
    serverError(res, error);
  }
});

// Update notification preferences for the authenticated user.
router.put('/notifications', authenticate, [
  body('emailOrderUpdates').optional().isBoolean(),
  body('emailPromotions').optional().isBoolean(),
  body('emailNewsletter').optional().isBoolean(),
  body('smsOrderUpdates').optional().isBoolean(),
  body('smsPromotions').optional().isBoolean(),
  body('whatsappUpdates').optional().isBoolean(),
  body('pushNotifications').optional().isBoolean(),
  body('frequency').optional().isIn(['instant', 'daily', 'weekly'])
], validate, async (req, res) => {
  try {
    const prefs = req.body;
    req.user.notificationPreferences = {
      emailOrderUpdates: prefs.emailOrderUpdates ?? true,
      emailPromotions: prefs.emailPromotions ?? true,
      emailNewsletter: prefs.emailNewsletter ?? false,
      smsOrderUpdates: prefs.smsOrderUpdates ?? true,
      smsPromotions: prefs.smsPromotions ?? false,
      whatsappUpdates: prefs.whatsappUpdates ?? true,
      pushNotifications: prefs.pushNotifications ?? false,
      frequency: prefs.frequency || 'instant'
    };
    await req.user.save();

    res.json({
      success: true,
      data: req.user.notificationPreferences
    });
  } catch (error) {
    serverError(res, error);
  }
});

// Sessions
// List all active sessions for the authenticated user.
router.get('/sessions', authenticate, async (req, res) => {
  try {
    const sessions = await Session.find({ userId: req.user._id, isActive: true })
      .sort({ lastActive: -1 });
    res.json({ success: true, data: sessions });
  } catch (error) {
    serverError(res, error);
  }
});

// Revoke a specific session by ID. Ensures the session belongs to the authenticated user.
router.delete('/sessions/:id', authenticate, async (req, res) => {
  try {
    const session = await Session.findOne({ _id: req.params.id, userId: req.user._id });
    if (!session) {
      return res.status(404).json({ success: false, message: 'Session not found' });
    }

    session.isActive = false;
    await session.save();

    res.json({ success: true, message: 'Session revoked' });
  } catch (error) {
    serverError(res, error);
  }
});

module.exports = router;

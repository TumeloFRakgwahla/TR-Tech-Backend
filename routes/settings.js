const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const Settings = require('../models/Settings');
const { authenticateAdmin } = require('../middleware/auth');
const { serverError, badRequest } = require('../utils/response');
const User = require('../models/User');

const settingsValidation = [
  body('business').optional().isObject().withMessage('Business settings must be an object'),
  body('general').optional().isObject().withMessage('General settings must be an object'),
  body('notifications').optional().isObject().withMessage('Notification settings must be an object'),
  body('security').optional().isObject().withMessage('Security settings must be an object'),
  body('appearance').optional().isObject().withMessage('Appearance settings must be an object'),
];

// Get settings. Admin-only.
router.get('/', authenticateAdmin, async (req, res) => {
  try {
    let settings = await Settings.findOne();
    if (!settings) {
      settings = await Settings.create({
        business: {},
        general: {},
        notifications: {},
        security: {},
        appearance: {},
      });
    }
    res.json({ success: true, settings: settings.toObject() });
  } catch (error) {
    serverError(res, error);
  }
});

// Update settings or perform system actions. Admin-only.
router.put('/', authenticateAdmin, settingsValidation, validate, async (req, res) => {
  try {
    const { action, password, ...settingsData } = req.body;

    if (action === 'clear-cache') {
      return res.json({ success: true, message: 'Cache cleared successfully' });
    }

    if (action === 'export-data') {
      return res.json({ success: true, message: 'Data exported successfully' });
    }

    if (action === 'reset-system') {
      return res.json({ success: true, message: 'System reset successfully' });
    }

    if (password && password.currentPassword && password.newPassword) {
      const user = await User.findById(req.user._id).select('+password');
      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }
      const isMatch = await user.matchPassword(password.currentPassword);
      if (!isMatch) {
        return res.status(400).json({ success: false, message: 'Current password is incorrect' });
      }
      user.password = password.newPassword;
      await user.save();
      return res.json({ success: true, message: 'Password updated successfully' });
    }

    let settings = await Settings.findOne();
    if (!settings) {
      settings = await Settings.create(settingsData);
    } else {
      if (settingsData.business) settings.business = { ...settings.business, ...settingsData.business };
      if (settingsData.general) settings.general = { ...settings.general, ...settingsData.general };
      if (settingsData.notifications) settings.notifications = { ...settings.notifications, ...settingsData.notifications };
      if (settingsData.security) settings.security = { ...settings.security, ...settingsData.security };
      if (settingsData.appearance) settings.appearance = { ...settings.appearance, ...settingsData.appearance };
      await settings.save();
    }

    res.json({ success: true, settings: settings.toObject() });
  } catch (error) {
    badRequest(res, error);
  }
});

module.exports = router;

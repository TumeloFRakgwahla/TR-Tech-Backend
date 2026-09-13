const express = require('express');
const bcrypt = require('bcryptjs');
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const { authenticateAdmin } = require('../middleware/auth');
const { serverError, badRequest } = require('../utils/response');
const Settings = require('../models/Settings');
const User = require('../models/User');

const router = express.Router();

router.get('/', authenticateAdmin, async (req, res) => {
  try {
    let settings = await Settings.findOne();
    if (!settings) {
      settings = await Settings.create({});
    }
    res.json({ success: true, settings });
  } catch (error) {
    serverError(res, error);
  }
});

const passwordValidation = [
  body('password.currentPassword').notEmpty().withMessage('Current password is required'),
  body('password.newPassword').isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-zA-Z])(?=.*\d).+$/).withMessage('Password must contain both letters and numbers'),
];

router.put('/', authenticateAdmin, passwordValidation, validate, async (req, res) => {
  try {
    const updates = req.body;
    const allowedSections = ['business', 'general', 'notifications', 'security', 'appearance'];
    const safeUpdates = {};

    for (const section of allowedSections) {
      if (updates[section] && typeof updates[section] === 'object') {
        safeUpdates[section] = updates[section];
      }
    }

    if (updates.action) {
      switch (updates.action) {
        case 'clear-cache':
          return res.json({ success: true, message: 'Cache cleared successfully' });
        case 'export-data':
          return res.json({ success: true, message: 'Data exported successfully' });
        case 'reset-system':
          await Settings.deleteMany({});
          const fresh = await Settings.create({});
          return res.json({ success: true, message: 'System reset to defaults', settings: fresh });
        default:
          return res.status(400).json({ success: false, message: 'Unknown action' });
      }
    }

    if (updates.password) {
      const { currentPassword, newPassword } = updates.password;
      const user = await User.findById(req.user._id).select('+password');
      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }
      const isMatch = await user.matchPassword(currentPassword);
      if (!isMatch) {
        return res.status(401).json({ success: false, message: 'Current password is incorrect' });
      }
      user.password = newPassword;
      await user.save();
      return res.json({ success: true, message: 'Password updated successfully' });
    }

    const hasSettingsUpdates = Object.keys(safeUpdates).length > 0;
    if (!hasSettingsUpdates) {
      return res.json({ success: true, message: 'No changes to save' });
    }

    const options = { new: true, upsert: true, runValidators: true };
    const settings = await Settings.findOneAndUpdate({}, safeUpdates, options);

    res.json({ success: true, data: settings });
  } catch (error) {
    serverError(res, error);
  }
});

module.exports = router;

const express = require('express');
const { serverError, badRequest } = require('../utils/response');
const { sendPaginated } = require('../utils/pagination');
const router = express.Router();
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const User = require('../models/User');
const Session = require('../models/Session');
const { authenticateAdmin } = require('../middleware/auth');
const { toSafeString, escapeRegex } = require('../utils/query');

const userValidation = [
  body('firstName').optional().trim().notEmpty().withMessage('First name cannot be empty').isLength({ max: 50 }).withMessage('First name cannot exceed 50 characters'),
  body('lastName').optional().trim().notEmpty().withMessage('Last name cannot be empty').isLength({ max: 50 }).withMessage('Last name cannot exceed 50 characters'),
  body('email').optional().isEmail().withMessage('Please enter a valid email').normalizeEmail(),
  body('phone').optional().trim().notEmpty().withMessage('Phone number cannot be empty'),
  body('role').optional().isIn(['customer', 'admin']).withMessage('Invalid role')
];

const passwordResetValidation = [
  body('password')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-zA-Z])(?=.*\d).+$/).withMessage('Password must contain both letters and numbers'),
];

router.get('/', authenticateAdmin, async (req, res) => {
  try {
  const { page = 1, limit = 20 } = req.query;
  let query = {};

  const role = toSafeString(req.query.role);
  const search = toSafeString(req.query.search);

  if (role) query.role = role;
  if (search) {
    const safeSearch = escapeRegex(search);
    query.$or = [
      { firstName: { $regex: safeSearch, $options: 'i' } },
      { lastName: { $regex: safeSearch, $options: 'i' } },
      { email: { $regex: safeSearch, $options: 'i' } }
    ];
  }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const [users, total] = await Promise.all([
      User.find(query).select('-password').sort({ createdAt: -1 }).skip(skip).limit(limitNum),
      User.countDocuments(query)
    ]);

    sendPaginated(res, users, total, pageNum, limitNum);
  } catch (error) {
    serverError(res, error);
  }
});

router.get('/:id', authenticateAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.json({ success: true, data: user });
  } catch (error) {
    serverError(res, error);
  }
});

router.put('/:id', authenticateAdmin, userValidation, validate, async (req, res) => {
  try {
    // Strip password from mass-assignment: findByIdAndUpdate does not run the
    // pre('save') hook, so a plaintext password in the body would be stored as-is.
    const { password, ...updateData } = req.body;
    const user = await User.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
      runValidators: true
    }).select('-password');

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.json({ success: true, data: user });
  } catch (error) {
    badRequest(res, error);
  }
});

router.put('/:id/password', authenticateAdmin, passwordResetValidation, validate, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Set via the document instance and save() so the pre('save') hook hashes it.
    // (findByIdAndUpdate would skip the hook and store the password in cleartext.)
    user.password = req.body.password;
    await user.save();

    // Invalidate existing sessions so a compromised/old session cannot persist.
    await Session.updateMany({ userId: user._id }, { isActive: false });

    res.json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    serverError(res, error);
  }
});

router.delete('/:id', authenticateAdmin, async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    serverError(res, error);
  }
});

module.exports = router;

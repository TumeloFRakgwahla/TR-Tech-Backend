const express = require('express');
const { serverError, badRequest } = require('../utils/response');
const { sendPaginated } = require('../utils/pagination');
const router = express.Router();
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const User = require('../models/User');
const Session = require('../models/Session');
const ActivityLog = require('../models/ActivityLog');
const { authenticateAdmin, requireTwoFactor } = require('../middleware/auth');
const { toSafeString, escapeRegex } = require('../utils/query');

const DEFAULT_ROLE_PERMISSIONS = {
  admin: ['dashboard', 'products', 'categories', 'brands', 'services', 'repairs', 'orders', 'customers', 'inventory', 'marketing', 'reports', 'users', 'settings'],
  manager: ['dashboard', 'products', 'categories', 'brands', 'services', 'repairs', 'orders', 'customers', 'inventory', 'marketing', 'reports'],
  staff: ['dashboard', 'repairs', 'orders', 'inventory'],
  customer: [],
};

const roleValidation = [
  body('name').trim().notEmpty().withMessage('Role name is required').isLength({ max: 50 }),
  body('permissions').optional().isArray().withMessage('Permissions must be an array'),
];

const userValidation = [
  body('firstName').optional().trim().notEmpty().withMessage('First name cannot be empty').isLength({ max: 50 }).withMessage('First name cannot exceed 50 characters'),
  body('lastName').optional().trim().notEmpty().withMessage('Last name cannot be empty').isLength({ max: 50 }).withMessage('Last name cannot exceed 50 characters'),
  body('email').optional().isEmail().withMessage('Please enter a valid email').normalizeEmail(),
  body('phone').optional().trim().notEmpty().withMessage('Phone number cannot be empty'),
  body('role').optional().isIn(['customer', 'admin', 'manager', 'staff']).withMessage('Invalid role')
];

const passwordResetValidation = [
  body('password')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-zA-Z])(?=.*\d).+$/).withMessage('Password must contain both letters and numbers'),
];

// List all users with optional role filter and search. Admin-only.
// Password field is explicitly excluded from the response.
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

// Get a single user by ID. Admin-only. Password field is excluded.
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

// Update a user by ID. Admin-only.
// Password is explicitly stripped from the update payload because findByIdAndUpdate
// does not run the pre('save') hook — a plaintext password would be stored as-is.
router.put('/:id', authenticateAdmin, requireTwoFactor, userValidation, validate, async (req, res) => {
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

// Reset a user's password. Admin-only.
// Uses document.save() so the pre('save') hook hashes the password.
// Invalidates all active sessions after a password reset.
router.put('/:id/password', authenticateAdmin, requireTwoFactor, passwordResetValidation, validate, async (req, res) => {
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

// Delete a user by ID. Admin-only.
router.delete('/:id', authenticateAdmin, requireTwoFactor, async (req, res) => {
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

// Get all roles with their permissions. Admin-only.
router.get('/roles', authenticateAdmin, async (req, res) => {
  try {
    const roles = Object.entries(DEFAULT_ROLE_PERMISSIONS).map(([id, permissions]) => ({
      id,
      name: id.charAt(0).toUpperCase() + id.slice(1),
      permissions,
    }));
    res.json({ success: true, data: roles });
  } catch (error) {
    serverError(res, error);
  }
});

// Create a new role. Admin-only.
router.post('/roles', authenticateAdmin, roleValidation, validate, async (req, res) => {
  try {
    const { name, permissions } = req.body;
    const roleId = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    if (DEFAULT_ROLE_PERMISSIONS[roleId]) {
      return res.status(400).json({ success: false, message: 'Role already exists' });
    }
    DEFAULT_ROLE_PERMISSIONS[roleId] = permissions || [];
    res.status(201).json({ success: true, data: { id: roleId, name, permissions: DEFAULT_ROLE_PERMISSIONS[roleId] } });
  } catch (error) {
    badRequest(res, error);
  }
});

// Update a role's permissions. Admin-only.
router.put('/roles/:id', authenticateAdmin, roleValidation, validate, async (req, res) => {
  try {
    const { permissions } = req.body;
    const roleId = req.params.id;
    if (!DEFAULT_ROLE_PERMISSIONS[roleId]) {
      return res.status(404).json({ success: false, message: 'Role not found' });
    }
    DEFAULT_ROLE_PERMISSIONS[roleId] = permissions || [];
    res.json({ success: true, data: { id: roleId, permissions: DEFAULT_ROLE_PERMISSIONS[roleId] } });
  } catch (error) {
    badRequest(res, error);
  }
});

// Delete a role. Admin-only.
router.delete('/roles/:id', authenticateAdmin, async (req, res) => {
  try {
    const roleId = req.params.id;
    if (!DEFAULT_ROLE_PERMISSIONS[roleId]) {
      return res.status(404).json({ success: false, message: 'Role not found' });
    }
    if (['admin', 'manager', 'staff', 'customer'].includes(roleId)) {
      return res.status(400).json({ success: false, message: 'Cannot delete default roles' });
    }
    delete DEFAULT_ROLE_PERMISSIONS[roleId];
    res.json({ success: true, message: 'Role deleted successfully' });
  } catch (error) {
    serverError(res, error);
  }
});

// Get activity logs. Admin-only.
router.get('/activity-logs', authenticateAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 50, action, userRole, statusCode, userId, startDate, endDate } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const skip = (pageNum - 1) * limitNum;

    const query = {};
    if (action) query.action = action;
    if (userRole) query.userRole = userRole;
    if (statusCode) query.statusCode = parseInt(statusCode, 10);
    if (userId) query.userId = userId;

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const [logs, total] = await Promise.all([
      ActivityLog.find(query).sort({ createdAt: -1 }).skip(skip).limit(limitNum),
      ActivityLog.countDocuments(query)
    ]);

    sendPaginated(res, logs, total, pageNum, limitNum);
    const { page = 1, limit = 50 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    res.json({ success: true, data: [], total: 0, page: pageNum, limit: limitNum });
  } catch (error) {
    serverError(res, error);
  }
});

// Get all admin users. Admin-only.
router.get('/admins', authenticateAdmin, async (req, res) => {
  try {
    const admins = await User.find({ role: { $in: ['admin', 'manager', 'staff'] } }).select('-password').sort({ createdAt: -1 });
    res.json({ success: true, data: admins });
  } catch (error) {
    serverError(res, error);
  }
});

// Update a user's role. Admin-only.
router.put('/:id/role', authenticateAdmin, requireTwoFactor, async (req, res) => {
router.put('/:id/role', authenticateAdmin, async (req, res) => {
  try {
    const { role } = req.body;
    if (!['customer', 'admin', 'manager', 'staff'].includes(role)) {
      return res.status(400).json({ success: false, message: 'Invalid role' });
    }
    const user = await User.findByIdAndUpdate(req.params.id, { role }, { new: true }).select('-password');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.json({ success: true, data: user });
  } catch (error) {
    badRequest(res, error);
  }
});

// Toggle user active status. Admin-only.
router.put('/:id/status', authenticateAdmin, requireTwoFactor, async (req, res) => {
router.put('/:id/status', authenticateAdmin, async (req, res) => {
  try {
    const { isActive } = req.body;
    const user = await User.findByIdAndUpdate(req.params.id, { isActive }, { new: true }).select('-password');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.json({ success: true, data: user });
  } catch (error) {
    badRequest(res, error);
  }
});

module.exports = router;

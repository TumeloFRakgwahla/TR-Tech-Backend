const express = require('express');
const crypto = require('crypto');
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const { verifyToken } = require('../utils/jwt');
const { issueSession, revokeSession, isSessionActive } = require('../utils/session');
const User = require('../models/User');
const { authenticate, authenticateAdmin } = require('../middleware/auth');
const { createAuthLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

const authLimiter = createAuthLimiter();

// Treat Vercel deployments as production so cookies use Secure + SameSite=None
// (required for cross-site XHR from the separate frontend Vercel domain).
const isProd = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';
const cookieBaseOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? 'none' : 'lax',
  path: '/',
};

// Register a new customer account.
// Rate limited to prevent abuse. Generates an email verification token.
router.post('/register', authLimiter, [
  body('firstName').trim().notEmpty().withMessage('First name is required').isLength({ max: 50 }).withMessage('First name cannot exceed 50 characters'),
  body('lastName').trim().notEmpty().withMessage('Last name is required').isLength({ max: 50 }).withMessage('Last name cannot exceed 50 characters'),
  body('email').isEmail().withMessage('Please enter a valid email').normalizeEmail(),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('phone').trim().notEmpty().withMessage('Phone number is required')
], validate, async (req, res) => {
  try {
    const { firstName, lastName, email, password, phone, address } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists'
      });
    }

    const user = await User.create({
      firstName,
      lastName,
      email,
      password,
      phone,
      address: address || {}
    });

    const verificationToken = user.generateEmailVerificationToken();
    await user.save();
    // TODO: send verification email via provider (nodemailer/SendGrid).
    // Verification tokens must never be logged to stdout or persisted in logs
    // — they are single-use secrets. In non-production environments the token
    // is returned to the caller via the API response only if explicitly needed.

    const token = await issueSession(user, req);

    res.cookie('authToken', token, {
      ...cookieBaseOptions,
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    res.status(201).json({
      success: true,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        role: user.role,
        emailVerified: user.emailVerified
      }
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during registration'
    });
  }
});

// Login for customer accounts.
// Implements account lockout after 5 failed attempts (15-minute cooldown).
router.post('/login', authLimiter, [
  body('email').isEmail().withMessage('Please enter a valid email').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required')
], validate, async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    if (user.isLocked()) {
      return res.status(429).json({
        success: false,
        message: 'Account temporarily locked due to too many failed attempts. Try again later.'
      });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
      if (user.failedLoginAttempts >= 5) {
        user.lockUntil = Date.now() + 15 * 60 * 1000;
        user.failedLoginAttempts = 0;
      }
      await user.save();
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Successful login: clear failed-attempt history and any lock.
    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    await user.save();

    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Your account has been deactivated'
      });
    }

    const token = await issueSession(user, req);

    res.cookie('authToken', token, {
      ...cookieBaseOptions,
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    res.json({
      success: true,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        address: user.address,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login'
    });
  }
});

// Get the currently authenticated user's profile.
router.get('/me', authenticate, async (req, res) => {
  res.json({
    success: true,
    user: {
      id: req.user._id,
      firstName: req.user.firstName,
      lastName: req.user.lastName,
      email: req.user.email,
      phone: req.user.phone,
      address: req.user.address,
      role: req.user.role
    }
  });
});

// Logout the current user by revoking the session and clearing cookies.
router.post('/logout', async (req, res) => {
  try {
    const token = req.cookies?.authToken;
    if (token) {
      const decoded = verifyToken(token);
      await revokeSession(decoded.jti, decoded.id);
    }
  } catch (error) {
    console.error('Logout session revocation error:', error);
  } finally {
    res.clearCookie('authToken', cookieBaseOptions);
    res.clearCookie('csrf_token', cookieBaseOptions);
    res.json({ success: true, message: 'Logged out successfully' });
  }
});

// Update the authenticated user's profile (name, phone, address).
router.put('/updateprofile', authenticate, [
  body('firstName').optional().trim().notEmpty().withMessage('First name cannot be empty').isLength({ max: 50 }).withMessage('First name cannot exceed 50 characters'),
  body('lastName').optional().trim().notEmpty().withMessage('Last name cannot be empty').isLength({ max: 50 }).withMessage('Last name cannot exceed 50 characters'),
  body('phone').optional().trim().notEmpty().withMessage('Phone number cannot be empty'),
  body('address').optional().isObject().withMessage('Address must be an object')
], validate, async (req, res) => {
  try {
    const { firstName, lastName, phone, address } = req.body;

    if (firstName) req.user.firstName = firstName;
    if (lastName) req.user.lastName = lastName;
    if (phone) req.user.phone = phone;
    if (address) req.user.address = address;

    await req.user.save();

    res.json({
      success: true,
      user: {
        id: req.user._id,
        firstName: req.user.firstName,
        lastName: req.user.lastName,
        email: req.user.email,
        phone: req.user.phone,
        address: req.user.address,
        role: req.user.role,
        emailVerified: req.user.emailVerified
      }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating profile'
    });
  }
});

// Verify email using the token sent to the user.
// Looks up the SHA-256 hash of the token and marks the email as verified.
router.post('/verify-email', [
  body('token').notEmpty().withMessage('Token is required'),
], validate, async (req, res) => {
  try {
    const hashed = crypto.createHash('sha256').update(req.body.token).digest('hex');
    const user = await User.findOne({
      emailVerificationToken: hashed,
      emailVerificationExpires: { $gt: Date.now() },
    });
    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid or expired verification token' });
    }
    user.emailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save();
    res.json({ success: true, message: 'Email verified successfully' });
  } catch (error) {
    console.error('Verify email error:', error);
    res.status(500).json({ success: false, message: 'Server error verifying email' });
  }
});

// Resend the email verification link.
// Always returns success to prevent user enumeration.
router.post('/resend-verification', [
  body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
], validate, async (req, res) => {
  try {
    const user = await User.findOne({ email: req.body.email });
    if (!user || user.emailVerified) {
      return res.json({ success: true, message: 'If that email exists and is unverified, a verification link has been sent' });
    }
    const verificationToken = user.generateEmailVerificationToken();
    await user.save();
    // Verification tokens must never be logged — they are single-use secrets.
    res.json({ success: true, message: 'If that email exists and is unverified, a verification link has been sent' });
  } catch (error) {
    console.error('Resend verification error:', error);
    res.status(500).json({ success: false, message: 'Server error resending verification' });
  }
});

// Admin login route. Requires role === 'admin'.
router.post('/admin/login', authLimiter, [
  body('email').isEmail().withMessage('Please enter a valid email').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required')
], validate, async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    if (user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin credentials required.'
      });
    }

    if (user.isLocked()) {
      return res.status(429).json({
        success: false,
        message: 'Account temporarily locked due to too many failed attempts. Try again later.'
      });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
      if (user.failedLoginAttempts >= 5) {
        user.lockUntil = Date.now() + 15 * 60 * 1000;
        user.failedLoginAttempts = 0;
      }
      await user.save();
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    await user.save();

    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Your account has been deactivated'
      });
    }

    const token = await issueSession(user, req);

    res.cookie('adminAuthToken', token, {
      ...cookieBaseOptions,
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    res.json({
      success: true,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        address: user.address,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during admin login'
    });
  }
});

// Get the currently authenticated admin's profile.
router.get('/admin/me', authenticateAdmin, async (req, res) => {
  res.json({
    success: true,
    user: {
      id: req.user._id,
      firstName: req.user.firstName,
      lastName: req.user.lastName,
      email: req.user.email,
      phone: req.user.phone,
      address: req.user.address,
      role: req.user.role
    }
  });
});

// Logout the current admin by revoking the session and clearing cookies.
router.post('/admin/logout', async (req, res) => {
  try {
    const token = req.cookies?.adminAuthToken;
    if (token) {
      const decoded = verifyToken(token);
      await revokeSession(decoded.jti, decoded.id);
    }
  } catch (error) {
    console.error('Admin logout session revocation error:', error);
  } finally {
    res.clearCookie('adminAuthToken', cookieBaseOptions);
    res.clearCookie('csrf_token', cookieBaseOptions);
    res.json({ success: true, message: 'Logged out successfully' });
  }
});

module.exports = router;

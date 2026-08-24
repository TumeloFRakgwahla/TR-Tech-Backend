const express = require('express');
const crypto = require('crypto');
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const { verifyToken } = require('../utils/jwt');
const { issueSession, revokeSession, isSessionActive } = require('../utils/session');
const User = require('../models/User');
const { authenticate } = require('../middleware/auth');
const { createAuthLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

const authLimiter = createAuthLimiter();

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
    // In non-production the raw token is logged for local testing only.
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[dev] email verification token for ${user.email}: ${verificationToken}`);
    }

    const token = await issueSession(user, req);

    res.cookie('authToken', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: '/',
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
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: '/',
    });

    res.json({
      success: true,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
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
    res.clearCookie('authToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      path: '/',
    });
    res.clearCookie('csrf_token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      path: '/',
    });
    res.json({ success: true, message: 'Logged out successfully' });
  }
});

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

router.post('/resend-verification', [
  body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
], validate, async (req, res) => {
  try {
    const user = await User.findOne({ email: req.body.email });
    // Avoid account enumeration: always return the same generic message.
    if (!user || user.emailVerified) {
      return res.json({ success: true, message: 'If that email exists and is unverified, a verification link has been sent' });
    }
    const verificationToken = user.generateEmailVerificationToken();
    await user.save();
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[dev] email verification token for ${user.email}: ${verificationToken}`);
    }
    res.json({ success: true, message: 'If that email exists and is unverified, a verification link has been sent' });
  } catch (error) {
    console.error('Resend verification error:', error);
    res.status(500).json({ success: false, message: 'Server error resending verification' });
  }
});

module.exports = router;

const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const { verifyToken } = require('../utils/jwt');
const { issueSession, revokeSession, isSessionActive } = require('../utils/session');
const User = require('../models/User');
const { authenticate, authenticateAdmin, requireTwoFactor } = require('../middleware/auth');
const { createAuthLimiter } = require('../middleware/rateLimiter');
const { sendEmail, generateVerificationEmail, generateOrderConfirmationEmail, generatePasswordResetEmail } = require('../services/emailService');
const Settings = require('../models/Settings');

const router = express.Router();

const authLimiter = createAuthLimiter();

const isProd = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';
const cookieBaseOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? 'none' : 'lax',
  path: '/',
};

// Generate a server-side CAPTCHA challenge for admin login.
// Returns a CAPTCHA ID and a data URI containing the challenge image.
const captchaStore = new Map();
const CAPTCHA_TTL_MS = 5 * 60 * 1000;

router.get('/admin/captcha', (req, res) => {
  try {
    const captchaId = crypto.randomBytes(16).toString('hex');
    const solution = crypto.randomBytes(3).toString('hex').slice(0, 5).toUpperCase();

    captchaStore.set(captchaId, { solution, createdAt: Date.now() });

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="60" viewBox="0 0 200 60">
      <rect width="200" height="60" fill="#1e293b"/>
      <text x="100" y="35" text-anchor="middle" font-family="monospace" font-size="24" fill="#e2e8f0" font-weight="bold">${solution}</text>
    </svg>`;

    res.json({
      success: true,
      captchaId,
      image: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to generate CAPTCHA' });
  }
});

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

    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const verificationLink = `${baseUrl}/verify-email?token=${verificationToken}`;
    const emailData = generateVerificationEmail(`${firstName} ${lastName}`, verificationLink);
    await sendEmail(email, emailData);

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

    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Your account has been deactivated'
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

    if (user.twoFactorEnabled) {
      const tempToken = jwt.sign({ id: user._id, purpose: '2fa', role: user.role }, process.env.JWT_SECRET, { expiresIn: '5m' });
      res.cookie('tempToken', tempToken, {
        ...cookieBaseOptions,
        maxAge: 5 * 60 * 1000,
      });
      res.json({
        success: true,
        requiresTwoFactor: true,
        tempToken,
        message: 'Two-factor authentication required'
      });
      return;
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
        role: user.role,
        twoFactorEnabled: user.twoFactorEnabled
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

// Admin login route. Requires role === 'admin'.
router.post('/admin/login', authLimiter, [
  body('email').isEmail().withMessage('Please enter a valid email').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required'),
  body('captchaId').optional().isString().withMessage('Invalid CAPTCHA ID'),
  body('captchaCode').optional().isString().withMessage('Invalid CAPTCHA code')
], validate, async (req, res) => {
  try {
    const { email, password, captchaId, captchaCode } = req.body;

    const settings = await Settings.findOne();
    const ipWhitelist = settings?.security?.ipWhitelist || '';

    if (ipWhitelist && req.ip) {
      const clientIp = req.ip.replace(/^::ffff:/, '');
      const allowed = ipWhitelist.split(/[,\n;]+/).map((ip) => ip.trim()).filter(Boolean);
      const isAllowed = allowed.some((entry) => {
        if (entry.includes('/')) {
          const [network, prefix] = entry.split('/');
          const ipInt = clientIp.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0);
          const mask = prefix ? ~((1 << (32 - parseInt(prefix, 10))) - 1) >>> 0 : 0xFFFFFFFF;
          const networkInt = network.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0);
          return (ipInt & mask) === (networkInt & mask);
        }
        return clientIp === entry;
      });
      if (!isAllowed) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. Your IP address is not whitelisted.'
        });
      }
    }

    if (captchaId && captchaCode) {
      const stored = captchaStore.get(captchaId);
      if (!stored || Date.now() - stored.createdAt > CAPTCHA_TTL_MS) {
        return res.status(400).json({
          success: false,
          message: 'CAPTCHA expired. Please try again.',
          requiresCaptcha: true
        });
      }
      if (stored.solution !== captchaCode.toUpperCase()) {
        return res.status(400).json({
          success: false,
          message: 'Invalid CAPTCHA. Please try again.',
          requiresCaptcha: true
        });
      }
      captchaStore.delete(captchaId);
    } else if (captchaId || captchaCode) {
      return res.status(400).json({
        success: false,
        message: 'CAPTCHA verification required',
        requiresCaptcha: true
      });
    }

    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    if (!['admin', 'manager', 'staff'].includes(user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin credentials required.'
      });
    }

    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Your account has been deactivated'
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
        role: user.role,
        twoFactorEnabled: user.twoFactorEnabled
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
      role: req.user.role,
      twoFactorEnabled: req.user.twoFactorEnabled
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
    res.clearCookie('tempToken', cookieBaseOptions);
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

    const emailData = generateVerificationEmail(`${user.firstName} ${user.lastName}`, 'Your email has been verified successfully.');
    await sendEmail(user.email, emailData);

    res.json({ success: true, message: 'Email verified successfully' });
  } catch (error) {
    console.error('Verify email error:', error);
    res.status(500).json({ success: false, message: 'Server error verifying email' });
  }
});

// Resend the email verification link.
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
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const verificationLink = `${baseUrl}/verify-email?token=${verificationToken}`;
    const emailData = generateVerificationEmail(`${user.firstName} ${user.lastName}`, verificationLink);
    await sendEmail(user.email, emailData);
    res.json({ success: true, message: 'If that email exists and is unverified, a verification link has been sent' });
  } catch (error) {
    console.error('Resend verification error:', error);
    res.status(500).json({ success: false, message: 'Server error resending verification' });
  }
});

// Admin-initiated password reset for a specific user.
router.put('/admin/reset-password', authenticateAdmin, [
  body('userId').isMongoId().withMessage('Valid user ID is required'),
  body('newPassword').isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-zA-Z])(?=.*\d).+$/).withMessage('Password must contain both letters and numbers')
], validate, async (req, res) => {
  try {
    const { userId, newPassword } = req.body;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    user.password = newPassword;
    await user.save();
    await Session.updateMany({ userId: user._id }, { isActive: false });

    const emailData = generatePasswordResetEmail(`${user.firstName} ${user.lastName}`, 'Your password has been reset by an administrator.');
    await sendEmail(user.email, emailData);

    res.json({ success: true, message: 'Password reset successfully' });
  } catch (error) {
    serverError(res, error);
  }
});

// Request a password reset link. Always returns success to prevent user enumeration.
router.post('/forgot-password', [
  body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
], validate, async (req, res) => {
  try {
    const user = await User.findOne({ email: req.body.email });
    if (!user) {
      return res.json({ success: true, message: 'If that email exists, a reset link has been sent' });
    }

    const resetToken = user.generatePasswordResetToken();
    await user.save();

    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const resetLink = `${baseUrl}/reset-password?token=${resetToken}`;
    const emailData = generatePasswordResetEmail(`${user.firstName} ${user.lastName}`, resetLink);
    await sendEmail(user.email, emailData);

    res.json({ success: true, message: 'If that email exists, a reset link has been sent' });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ success: false, message: 'Server error processing password reset request' });
  }
});

// Reset password using a time-limited token.
router.put('/reset-password', [
  body('token').notEmpty().withMessage('Token is required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-zA-Z])(?=.*\d).+$/).withMessage('Password must contain both letters and numbers')
], validate, async (req, res) => {
  try {
    const hashed = crypto.createHash('sha256').update(req.body.token).digest('hex');
    const user = await User.findOne({
      passwordResetToken: hashed,
      passwordResetExpires: { $gt: Date.now() },
    }).select('+passwordResetToken +passwordResetExpires');

    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid or expired reset token' });
    }

    user.password = req.body.password;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    await Session.updateMany({ userId: user._id }, { isActive: false });

    res.json({ success: true, message: 'Password reset successfully' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ success: false, message: 'Server error resetting password' });
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
    res.clearCookie('tempToken', cookieBaseOptions);
    res.json({ success: true, message: 'Logged out successfully' });
  }
});

module.exports = router;

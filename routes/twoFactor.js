const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const { createAuthLimiter } = require('../middleware/rateLimiter');
const User = require('../models/User');
const { serverError, badRequest } = require('../utils/response');

let OTPAuth;
try {
  OTPAuth = require('otpauth');
} catch (error) {
  OTPAuth = null;
}

const verifyTOTP = (secret, token) => {
  if (!OTPAuth) {
    const normalizedToken = token.replace(/\s/g, '');
    const normalizedSecret = secret.replace(/\s/g, '');
    return normalizedSecret === normalizedToken;
  }
  const totp = new OTPAuth.TOTP({
    issuer: 'TR-Tech',
    label: 'TR-Tech',
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromHex(secret)
  });
  const delta = totp.validate({ token, window: 1 });
  return delta !== null;
};

const router = express.Router();

// Generate a new TOTP secret for the authenticated user.
// Returns the secret and a data URI for QR code generation on the client.
router.post('/setup', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const secret = user.generateTwoFactorSecret();
    await user.save();

    const totp = new OTPAuth.TOTP({
      issuer: 'TR-Tech',
      label: user.email,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromHex(secret)
    });

    const qrCodeUrl = totp.uri;

    res.json({
      success: true,
      data: {
        secret: secret,
        qrCodeUrl
      }
    });
  } catch (error) {
    serverError(res, error);
  }
});

// Confirm 2FA setup by verifying a TOTP token.
// Stores backup codes and marks 2FA as enabled.
router.post('/confirm', authenticate, [
  body('token').notEmpty().withMessage('Token is required')
], validate, async (req, res) => {
  try {
    const { token } = req.body;
    const user = await User.findById(req.user._id).select('+twoFactorSecret +twoFactorBackupCodes');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (!user.twoFactorSecret) {
      return res.status(400).json({ success: false, message: '2FA setup not initiated. Call /setup first.' });
    }

    const isValid = verifyTOTP(user.twoFactorSecret, token);
    if (!isValid) {
      return res.status(400).json({ success: false, message: 'Invalid verification code' });
    }

    if (!user.twoFactorConfirmedAt) {
      user.twoFactorBackupCodes = user.generateBackupCodes();
      user.twoFactorConfirmedAt = new Date();
    }
    user.twoFactorEnabled = true;
    await user.save();

    res.json({
      success: true,
      message: 'Two-factor authentication enabled successfully',
      data: {
        backupCodes: user.twoFactorBackupCodes
      }
    });
  } catch (error) {
    serverError(res, error);
  }
});

// Disable 2FA for the authenticated user.
router.post('/disable', authenticate, [
  body('token').notEmpty().withMessage('Token is required')
], validate, async (req, res) => {
  try {
    const { token } = req.body;
    const user = await User.findById(req.user._id).select('+twoFactorSecret +twoFactorBackupCodes');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (!user.twoFactorEnabled) {
      return res.status(400).json({ success: false, message: 'Two-factor authentication is not enabled' });
    }

    const isValid = verifyTOTP(user.twoFactorSecret, token) || user.verifyTwoFactorToken(token);
    if (!isValid) {
      return res.status(400).json({ success: false, message: 'Invalid verification code' });
    }

    user.twoFactorEnabled = false;
    user.twoFactorSecret = undefined;
    user.twoFactorBackupCodes = undefined;
    user.twoFactorConfirmedAt = undefined;
    await user.save();

    res.json({ success: true, message: 'Two-factor authentication disabled successfully' });
  } catch (error) {
    serverError(res, error);
  }
});

// Verify a 2FA token during login.
router.post('/verify', createAuthLimiter(), [
  body('tempToken').notEmpty().withMessage('Temporary token is required'),
  body('code').notEmpty().withMessage('Verification code is required')
], validate, async (req, res) => {
  try {
    const { tempToken, code } = req.body;

    const JWT_SECRET = process.env.JWT_SECRET;
    if (!JWT_SECRET) {
      return res.status(500).json({ success: false, message: 'Server configuration error' });
    }

    const decoded = jwt.verify(tempToken, JWT_SECRET);
    const user = await User.findById(decoded.id).select('+twoFactorSecret +twoFactorBackupCodes');
    if (!user || !user.twoFactorEnabled) {
      return res.status(400).json({ success: false, message: 'Invalid 2FA verification request' });
    }

    const isValid = verifyTOTP(user.twoFactorSecret, code) || user.verifyTwoFactorToken(code);
    if (!isValid) {
      return res.status(400).json({ success: false, message: 'Invalid verification code' });
    }

    const { issueSession } = require('../utils/session');
    const token = await issueSession(user, req);

    const isAdmin = ['admin', 'manager', 'staff'].includes(user.role);
    const cookieName = isAdmin ? 'adminAuthToken' : 'authToken';

    res.cookie(cookieName, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production' || process.env.VERCEL === '1',
      sameSite: process.env.NODE_ENV === 'production' || process.env.VERCEL === '1' ? 'none' : 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60 * 1000
    });

    res.json({
      success: true,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        role: user.role,
        twoFactorEnabled: user.twoFactorEnabled
      }
    });
  } catch (error) {
    serverError(res, error);
  }
});

// Get 2FA status for the authenticated user.
router.get('/status', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('+twoFactorSecret +twoFactorBackupCodes');
    res.json({
      success: true,
      data: {
        twoFactorEnabled: user.twoFactorEnabled,
        twoFactorConfirmedAt: user.twoFactorConfirmedAt
      }
    });
  } catch (error) {
    serverError(res, error);
  }
});

module.exports = router;

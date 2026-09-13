const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Session = require('../models/Session');

// Lazy getter for JWT_SECRET: read at call time rather than module load time.
// This avoids crashing the entire module (and breaking all route exports) when
// the env var is missing during deployment — the runtime returns an empty
// exports object for a module that throws during require(). Instead, each
// middleware below checks the secret when a request arrives.
const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    const err = new Error('JWT_SECRET environment variable is required');
    err.code = 'MISSING_JWT_SECRET';
    throw err;
  }
  return secret;
};

const authenticate = async (req, res, next) => {
  try {
    const token = req.cookies?.authToken;

    if (!token) {
      return res.status(401).json({ success: false, message: 'Access denied. No token provided.' });
    }

    const decoded = jwt.verify(token, getJwtSecret());
    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid token. User not found.' });
    }

    if (!user.isActive) {
      return res.status(401).json({ success: false, message: 'Account has been deactivated.' });
    }

    const session = await Session.findOne({ tokenIdentifier: decoded.jti, userId: user._id, isActive: true });
    if (!session) {
      return res.status(401).json({ success: false, message: 'Session expired or has been revoked.' });
    }

    if (!session.lastActive || Date.now() - new Date(session.lastActive).getTime() > 5 * 60 * 1000) {
      Session.updateOne({ _id: session._id }, { $set: { lastActive: new Date() } }).catch(() => {});
    }

    req.user = user;
    req.session = session;
    req.twoFactorVerified = session.twoFactorVerified || false;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token.' });
  }
};

// authorize: role-based access control middleware factory.
// Usage: authorize('admin', 'manager') — allows only users with one of the specified roles.
const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Access denied. Not authenticated.' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Access denied. Insufficient permissions.' });
    }
    next();
  };
};

const optionalAuthenticate = async (req, res, next) => {
  try {
    const token = req.cookies?.authToken;
    if (!token) return next();
    const decoded = jwt.verify(token, getJwtSecret());
    const user = await User.findById(decoded.id);
    if (user && user.isActive) {
      const session = await Session.findOne({ tokenIdentifier: decoded.jti, userId: user._id, isActive: true });
      if (session) {
        req.user = user;
        if (!session.lastActive || Date.now() - new Date(session.lastActive).getTime() > 5 * 60 * 1000) {
          Session.updateOne({ _id: session._id }, { $set: { lastActive: new Date() } }).catch(() => {});
        }
      }
    }
  } catch {
    // Invalid/expired token: treat as guest, continue unauthenticated.
  }
  next();
};

// authenticateAdmin: required middleware for admin-only routes.
// Reads the adminAuthToken cookie, verifies the JWT, ensures the user is active,
// checks the role is one of the allowed admin roles, and validates the session is still active.
// Accepts optional allowed roles array; defaults to ['admin', 'manager', 'staff'].
const authenticateAdmin = async (req, res, next, allowedRoles = ['admin', 'manager', 'staff']) => {
  try {
    const token = req.cookies?.adminAuthToken;

    if (!token) {
      return res.status(401).json({ success: false, message: 'Access denied. No admin token provided.' });
    }

    const decoded = jwt.verify(token, getJwtSecret());
    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid token. User not found.' });
    }

    if (!user.isActive) {
      return res.status(401).json({ success: false, message: 'Account has been deactivated.' });
    }

    if (!allowedRoles.includes(user.role)) {
      return res.status(403).json({ success: false, message: 'Access denied. Insufficient permissions.' });
    }

    const session = await Session.findOne({ tokenIdentifier: decoded.jti, userId: user._id, isActive: true });
    if (!session) {
      return res.status(401).json({ success: false, message: 'Session expired or has been revoked.' });
    }

    if (!session.lastActive || Date.now() - new Date(session.lastActive).getTime() > 5 * 60 * 1000) {
      Session.updateOne({ _id: session._id }, { $set: { lastActive: new Date() } }).catch(() => {});
    }

    req.user = user;
    req.session = session;
    req.twoFactorVerified = session.twoFactorVerified || false;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Invalid or expired admin token.' });
  }
};

// requireEmailVerified: middleware that blocks authenticated users whose email
// is not yet verified. Returns 403 with a machine-readable flag so the client
// can prompt re-verification. Unauthenticated requests pass through (caller
// should chain after authenticate/optionalAuthenticate).
const requireEmailVerified = (req, res, next) => {
  if (req.user && !req.user.emailVerified) {
    return res.status(403).json({
      success: false,
      message: 'Please verify your email address to continue.',
      requiresEmailVerification: true,
    });
  }
  next();
};

// requireTwoFactor: enforces two-factor authentication for admin actions.
// Must be used after authenticate or authenticateAdmin (which sets req.user,
// req.session, and req.twoFactorVerified). If the user has 2FA enabled but
// the session has not been 2FA-verified (e.g., via /auth/2fa/verify), returns
// 403 with a flag so the client can prompt for a verification code.
const requireTwoFactor = (req, res, next) => {
  const user = req.user;

  if (!user) {
    return res.status(401).json({ success: false, message: 'Access denied. Not authenticated.' });
  }

  if (user.twoFactorEnabled && !req.twoFactorVerified) {
    return res.status(403).json({
      success: false,
      message: 'Two-factor authentication required. Please verify your 2FA token.',
      requiresTwoFactor: true,
    });
  }

  next();
};

module.exports = { authenticate, authenticateAdmin, authorize, optionalAuthenticate, requireEmailVerified, requireTwoFactor };

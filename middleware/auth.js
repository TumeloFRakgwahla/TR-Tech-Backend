const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Session = require('../models/Session');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

const authenticate = async (req, res, next) => {
  try {
    const token = req.cookies?.authToken;

    if (!token) {
      return res.status(401).json({ success: false, message: 'Access denied. No token provided.' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
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
    const decoded = jwt.verify(token, JWT_SECRET);
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

    const decoded = jwt.verify(token, JWT_SECRET);
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

// authorizeAdmin: role-based access control factory for admin routes.
// Usage: authorizeAdmin('admin', 'manager') — allows only users with one of the specified roles.
const authorizeAdmin = (...allowedRoles) => {
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

const requireTwoFactor = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Access denied. Not authenticated.' });
  }
  if (!req.user.twoFactorEnabled) {
    return next();
  }
  if (req.twoFactorVerified) {
    return next();
  }
  return res.status(401).json({
    success: false,
    message: 'Two-factor authentication required.',
    requiresTwoFactor: true
  });
};

module.exports = {
  authenticate,
  authenticateAdmin,
  authorizeAdmin,
  authorize,
  optionalAuthenticate,
  requireTwoFactor
};

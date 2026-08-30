const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Session = require('../models/Session');

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

// authenticate: required middleware for protected user routes.
// Verifies the JWT from the authToken cookie, checks the user exists and is active,
// and validates the session has not been revoked. Attaches req.user on success.
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

    // Refresh the "last active" timestamp at most every 5 minutes to avoid a write per request.
    if (!session.lastActive || Date.now() - new Date(session.lastActive).getTime() > 5 * 60 * 1000) {
      Session.updateOne({ _id: session._id }, { $set: { lastActive: new Date() } }).catch(() => {});
    }

    req.user = user;
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

// optionalAuthenticate: like authenticate but does not reject unauthenticated requests.
// Used for endpoints that behave differently for logged-in users (e.g., guest checkout).
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
// checks the role is 'admin', and validates the session is still active.
const authenticateAdmin = async (req, res, next) => {
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

    if (user.role !== 'admin') {
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
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Invalid or expired admin token.' });
  }
};

module.exports = { authenticate, authenticateAdmin, authorize, optionalAuthenticate };

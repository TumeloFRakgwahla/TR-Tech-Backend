const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const Session = require('../models/Session');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

const TOKEN_TTL_DAYS = 30;

// Creates a new session record and issues a signed JWT.
// The JWT contains the user ID and a unique token identifier (jti).
// The session is stored in MongoDB so it can be revoked independently of the JWT expiry.
async function issueSession(user, req) {
  const jti = crypto.randomBytes(16).toString('hex');
  const expiresAt = new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

  await Session.create({
    userId: user._id,
    tokenIdentifier: jti,
    isActive: true,
    expiresAt,
    ipAddress: req && req.ip,
    userAgent: req && typeof req.get === 'function' ? req.get('user-agent') : undefined,
  });

  return jwt.sign({ id: user._id, jti }, JWT_SECRET, { expiresIn: `${TOKEN_TTL_DAYS}d` });
}

// Revokes a session by marking it inactive. Used during logout.
// The JWT may still be cryptographically valid, but the session check in authenticate() will reject it.
async function revokeSession(jti, userId) {
  if (!jti) return;
  await Session.updateOne(
    { tokenIdentifier: jti, userId },
    { isActive: false }
  );
}

// Checks whether a given session (jti + userId) is still active.
async function isSessionActive(jti, userId) {
  if (!jti) {
    return false;
  }
  const session = await Session.findOne({ tokenIdentifier: jti, userId, isActive: true });
  return !!session;
}

module.exports = { issueSession, revokeSession, isSessionActive, TOKEN_TTL_DAYS };

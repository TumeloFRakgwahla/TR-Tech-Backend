const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const Session = require('../models/Session');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

const TOKEN_TTL_DAYS = 30;

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

async function revokeSession(jti, userId) {
  if (!jti) return;
  await Session.updateOne(
    { tokenIdentifier: jti, userId },
    { isActive: false }
  );
}

async function isSessionActive(jti, userId) {
  if (!jti) {
    return false;
  }
  const session = await Session.findOne({ tokenIdentifier: jti, userId, isActive: true });
  return !!session;
}

module.exports = { issueSession, revokeSession, isSessionActive, TOKEN_TTL_DAYS };

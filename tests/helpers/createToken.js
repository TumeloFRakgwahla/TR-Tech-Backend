const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const Session = require('../../models/Session');

const JWT_SECRET = process.env.JWT_SECRET;

// Mint a JWT that includes a real session `jti` plus a corresponding active
// Session document, so the session-revocation path in `authenticate` is
// actually exercised. (Tests previously used no-jti tokens that hit the
// insecure legacy fallback and never touched the Session collection.)
const createToken = async (userId) => {
  const id = userId && userId._id ? userId._id : userId;
  const jti = crypto.randomBytes(16).toString('hex');
  await Session.create({
    userId: id,
    tokenIdentifier: jti,
    isActive: true,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  });
  return jwt.sign({ id, jti }, JWT_SECRET, { expiresIn: '30d' });
};

module.exports = { createToken };

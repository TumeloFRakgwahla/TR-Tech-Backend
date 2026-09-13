const jwt = require('jsonwebtoken');

const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is required');
  }
  return secret;
};

// Verifies a JWT token and returns the decoded payload.
// Throws if the token is invalid or expired.
const verifyToken = (token) => {
  return jwt.verify(token, getJwtSecret());
};

module.exports = { verifyToken };

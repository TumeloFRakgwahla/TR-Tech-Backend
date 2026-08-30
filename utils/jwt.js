const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

// Verifies a JWT token and returns the decoded payload.
// Throws if the token is invalid or expired.
const verifyToken = (token) => {
  return jwt.verify(token, JWT_SECRET);
};

module.exports = { verifyToken };

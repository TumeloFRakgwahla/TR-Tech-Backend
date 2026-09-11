const rateLimit = require('express-rate-limit');

// Rate limiting is infrastructure; disable it only under test so the in-memory
// store doesn't accumulate across tests and block legitimate requests.
// In all other environments, rate limiting is enabled by default.
const isTest = process.env.NODE_ENV === 'test';
const passthrough = () => (req, res, next) => next();

// Auth limiter: restricts login and registration attempts to prevent credential stuffing.
// 20 attempts per 15 minutes per IP.
const createAuthLimiter = () => {
  if (isTest) return passthrough();
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { success: false, message: 'Too many authentication attempts. Please try again after 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
  });
};

// General API limiter: protects all API routes from abuse.
// 100 requests per 15 minutes per IP.
const createApiLimiter = () => {
  if (isTest) return passthrough();
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { success: false, message: 'Too many requests. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
  });
};

// Public limiter: for unauthenticated write endpoints (contact form, repair bookings).
// Stricter limit of 10 requests per 15 minutes to prevent spam.
const createPublicLimiter = () => {
  if (isTest) return passthrough();
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { success: false, message: 'Too many requests. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
  });
};

module.exports = { createAuthLimiter, createApiLimiter, createPublicLimiter };

const rateLimit = require('express-rate-limit');

// Rate limiting is infrastructure; disable it under test so the in-memory
// store doesn't accumulate across tests and block legitimate requests.
const isTest = process.env.NODE_ENV === 'test';
const passthrough = () => (req, res, next) => next();

const isDevelopment = process.env.NODE_ENV === 'development';

const createAuthLimiter = () => {
  if (isTest || isDevelopment) return passthrough();
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { success: false, message: 'Too many authentication attempts. Please try again after 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
  });
};

const createApiLimiter = () => {
  if (isTest || isDevelopment) return passthrough();
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { success: false, message: 'Too many requests. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
  });
};

// For public, unauthenticated write endpoints (contact form, repair bookings).
const createPublicLimiter = () => {
  if (isTest || isDevelopment) return passthrough();
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { success: false, message: 'Too many requests. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
  });
};

module.exports = { createAuthLimiter, createApiLimiter, createPublicLimiter };

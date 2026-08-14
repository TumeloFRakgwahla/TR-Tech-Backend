const rateLimit = require('express-rate-limit');

const createAuthLimiter = () => {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { success: false, message: 'Too many authentication attempts. Please try again after 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
  });
};

const createApiLimiter = () => {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { success: false, message: 'Too many requests. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
  });
};

module.exports = { createAuthLimiter, createApiLimiter };

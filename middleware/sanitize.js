const validator = require('validator');

const escapeValue = (value) => {
  if (typeof value === 'string') {
    return validator.escape(value);
  }
  if (Array.isArray(value)) {
    return value.map(escapeValue);
  }
  if (value && typeof value === 'object') {
    const sanitized = {};
    for (const key of Object.keys(value)) {
      sanitized[key] = escapeValue(value[key]);
    }
    return sanitized;
  }
  return value;
};

const sanitize = (req, res, next) => {
  if (req.body && typeof req.body === 'object') {
    req.body = escapeValue(req.body);
  }
  next();
};

module.exports = sanitize;

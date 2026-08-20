const validator = require('validator');

const sanitize = (req, res, next) => {
  const sanitizeValue = (value, key) => {
    if (typeof value !== 'string') return value;
    if (key && key.toLowerCase() === 'password') return value;
    return validator.escape(value);
  };

  const sanitizeObject = (obj) => {
    if (!obj || typeof obj !== 'object') return obj;
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const value = obj[key];
        if (typeof value === 'string') {
          obj[key] = sanitizeValue(value, key);
        } else if (Array.isArray(value)) {
          obj[key] = value.map((item) => {
            if (typeof item === 'string') return sanitizeValue(item, key);
            if (item && typeof item === 'object') {
              return sanitizeObject(item);
            }
            return item;
          });
        } else if (value && typeof value === 'object') {
          obj[key] = sanitizeObject(value);
        }
      }
    }
    return obj;
  };

  if (req.body) sanitizeObject(req.body);
  if (req.query) sanitizeObject(req.query);
  if (req.params) sanitizeObject(req.params);

  next();
};

module.exports = sanitize;

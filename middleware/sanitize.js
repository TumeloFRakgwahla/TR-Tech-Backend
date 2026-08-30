// Removes control characters (C0/C1) and trims whitespace from string inputs.
// Prevents injection attacks that rely on non-printable characters.
const sanitizeString = (value) => {
  if (typeof value !== 'string') return value;
  return value
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .trim();
};

// Recursively sanitizes strings, arrays, and plain objects.
// Nested objects (e.g., req.body.customer.address) are handled automatically.
const sanitizeValue = (value) => {
  if (typeof value === 'string') {
    return sanitizeString(value);
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }
  if (value && typeof value === 'object') {
    const sanitized = {};
    for (const key of Object.keys(value)) {
      sanitized[key] = sanitizeValue(value[key]);
    }
    return sanitized;
  }
  return value;
};

// Express middleware that sanitizes req.body in place before validation runs.
const sanitize = (req, res, next) => {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeValue(req.body);
  }
  next();
};

module.exports = sanitize;

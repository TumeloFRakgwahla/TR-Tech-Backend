const crypto = require('crypto');

// Generates a UUID v4 for each incoming request and attaches it to req.id.
// Also exposes it via the X-Request-ID response header for client-side correlation.
const requestId = (req, res, next) => {
  const id = crypto.randomUUID();
  req.id = id;
  res.set('X-Request-ID', id);
  next();
};

module.exports = requestId;

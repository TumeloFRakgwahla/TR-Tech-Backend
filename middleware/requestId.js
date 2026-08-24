const crypto = require('crypto');

const requestId = (req, res, next) => {
  const id = crypto.randomUUID();
  req.id = id;
  res.set('X-Request-ID', id);
  next();
};

module.exports = requestId;

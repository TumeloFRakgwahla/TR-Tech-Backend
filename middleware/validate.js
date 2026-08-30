const { validationResult } = require('express-validator');

// Shared request-validation middleware (replaces the duplicated helper that
// was copied into every route file).
// Checks the results of express-validator chains and returns a 400 with
// all validation errors if any field fails.
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  next();
};

module.exports = validate;

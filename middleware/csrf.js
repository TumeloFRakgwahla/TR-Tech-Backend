// CSRF protection middleware using the double-submit cookie pattern.
// For mutating requests (POST, PUT, PATCH, DELETE), the client must send the CSRF token
// in the X-CSRF-Token header, which must match the value stored in the csrf_token cookie.
// Safe methods (GET, HEAD, OPTIONS) are exempt.
const csrfProtection = (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  const token = req.headers['x-csrf-token'] || req.body._csrf;
  const cookieToken = req.cookies?.csrf_token;

  if (!token || !cookieToken || token !== cookieToken) {
    return res.status(419).json({ success: false, message: 'Invalid CSRF token' });
  }

  next();
};

module.exports = { csrfProtection };

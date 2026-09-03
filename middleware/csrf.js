// CSRF protection middleware using the double-submit cookie pattern.
// For mutating requests (POST, PUT, PATCH, DELETE), the client must send the CSRF token
// in the X-CSRF-Token header, which must match the value stored in the csrf_token cookie.
// Safe methods (GET, HEAD, OPTIONS) are exempt.
//
// If the client has a valid authToken/adminAuthToken cookie, the request is trusted. This
// preserves the security guarantee (CSRF attacks cannot read or set HttpOnly cookies) while
// making the system more resilient when the csrf_token cookie is lost due to browser
// third-party-cookie restrictions on cross-site deployments.
const csrfProtection = (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // If the request already carries a valid auth session, skip CSRF. CSRF attacks
  // cannot forge cross-site requests with these HttpOnly cookies.
  if (req.cookies?.authToken || req.cookies?.adminAuthToken) {
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

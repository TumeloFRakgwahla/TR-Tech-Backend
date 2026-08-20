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

const ActivityLog = require('../models/ActivityLog');

const SENSITIVE_FIELDS = new Set([
  'password',
  'newPassword',
  'currentPassword',
  'confirmPassword',
  'token',
  'accessToken',
  'refreshToken',
  'captchaCode',
  'captchaId',
  'secret',
  'apiKey',
  'paystackSecretKey',
  'paystackWebhookSecret',
  'authorization',
  'cookie',
  'setCookie',
  'creditCard',
  'cvv',
  'pin',
  'otp',
  'backupCodes',
  'twoFactorSecret',
]);

function sanitizeBody(body) {
  if (!body || typeof body !== 'object') return body;
  const sanitized = { ...body };
  for (const key of Object.keys(sanitized)) {
    if (SENSITIVE_FIELDS.has(key)) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof sanitized[key] === 'object' && sanitized[key] !== null && !Array.isArray(sanitized[key])) {
      sanitized[key] = sanitizeBody(sanitized[key]);
    }
  }
  return sanitized;
}

const logActivity = async (req, res, next) => {
  const originalJson = res.json.bind(res);
  const originalStatus = res.status.bind(res);
  let statusCode = 200;
  let logged = false;

  res.status = function (code) {
    statusCode = code;
    return originalStatus(code);
  };

  const recordLog = () => {
    if (logged) return;
    logged = true;

    const userId = req.user?._id || null;
    const userEmail = req.user?.email || null;
    const userRole = req.user?.role || null;
    const ipAddress = req.ip || req.connection?.remoteAddress || null;
    const userAgent = req.get('user-agent') || null;

    const action = req.method.toUpperCase();
    const endpoint = req.originalUrl || req.url || '';
    const pathname = endpoint.replace(/^\/api\/v1/, '') || endpoint;

    const logEntry = {
      userId,
      userEmail,
      userRole,
      action,
      resource: pathname.split('/')[1] || 'unknown',
      resourceId: pathname.split('/')[2] || null,
      ipAddress,
      userAgent,
      method: action,
      endpoint: pathname,
      statusCode,
      changes: req.method !== 'GET' && req.method !== 'DELETE' && req.body ? sanitizeBody(req.body) : undefined,
      metadata: {
        query: req.query,
        params: req.params,
      }
    };

    ActivityLog.create(logEntry).catch((err) => {
      console.error('Failed to create activity log:', err);
    });
  };

  res.json = function (body) {
    recordLog();
    return originalJson(body);
  };

  const originalEnd = res.end.bind(res);
  res.end = function (...args) {
    if (!logged) {
      recordLog();
    }
    return originalEnd(...args);
  };

  next();
};

module.exports = { logActivity };

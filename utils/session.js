const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const Session = require('../models/Session');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

const TOKEN_TTL_DAYS = 30;

function parseUserAgent(userAgent) {
  if (!userAgent || typeof userAgent !== 'string') {
    return { deviceType: 'Desktop', browser: 'Unknown', location: 'Unknown' };
  }

  const ua = userAgent.toLowerCase();
  let deviceType = 'Desktop';
  if (/mobile|android|iphone|ipod|blackberry|opera mini|iemobile|wpdesktop/.test(ua)) {
    deviceType = 'Mobile';
  } else if (/tablet|ipad|playbook|silk|tabletpc/.test(ua)) {
    deviceType = 'Tablet';
  }

  let browser = 'Unknown';
  if (ua.includes('edg/')) browser = 'Edge';
  else if (ua.includes('chrome/')) browser = 'Chrome';
  else if (ua.includes('safari/') && !ua.includes('chrome')) browser = 'Safari';
  else if (ua.includes('firefox/')) browser = 'Firefox';
  else if (ua.includes('opr/') || ua.includes('opera')) browser = 'Opera';
  else if (ua.includes('msie') || ua.includes('trident/')) browser = 'IE';

  let location = 'Unknown';
  if (ua.includes('windows')) location = 'Windows';
  else if (ua.includes('mac os x')) location = 'MacOS';
  else if (ua.includes('linux')) location = 'Linux';
  else if (ua.includes('android')) location = 'Android';
  else if (ua.includes('iphone') || ua.includes('ipad')) location = 'iOS';

  return { deviceType, browser, location };
}

// Creates a new session record and issues a signed JWT.
// The JWT contains the user ID and a unique token identifier (jti).
// The session is stored in MongoDB so it can be revoked independently of the JWT expiry.
async function issueSession(user, req, options = {}) {
  const jti = crypto.randomBytes(16).toString('hex');
  const expiresAt = new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  const userAgent = req && typeof req.get === 'function' ? req.get('user-agent') : undefined;
  const parsed = parseUserAgent(userAgent);

  await Session.create({
    userId: user._id,
    tokenIdentifier: jti,
    isActive: true,
    expiresAt,
    ipAddress: req && req.ip,
    userAgent,
    deviceName: parsed.deviceType,
    deviceType: parsed.deviceType,
    browser: parsed.browser,
    location: parsed.location,
    twoFactorVerified: !!options.twoFactorVerified,
  });

  return jwt.sign({ id: user._id, jti }, JWT_SECRET, { expiresIn: `${TOKEN_TTL_DAYS}d` });
}

// Revokes a session by marking it inactive. Used during logout.
// The JWT may still be cryptographically valid, but the session check in authenticate() will reject it.
async function revokeSession(jti, userId) {
  if (!jti) return;
  await Session.updateOne(
    { tokenIdentifier: jti, userId },
    { isActive: false }
  );
}

// Checks whether a given session (jti + userId) is still active.
async function isSessionActive(jti, userId) {
  if (!jti) {
    return false;
  }
  const session = await Session.findOne({ tokenIdentifier: jti, userId, isActive: true });
  return !!session;
}

module.exports = { issueSession, revokeSession, isSessionActive, TOKEN_TTL_DAYS };

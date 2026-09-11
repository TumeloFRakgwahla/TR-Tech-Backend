const express = require('express');
const path = require('path');
const crypto = require('crypto');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const { createAuthLimiter, createApiLimiter, createPublicLimiter } = require('./middleware/rateLimiter');
const sanitize = require('./middleware/sanitize');
const requestId = require('./middleware/requestId');
const { logActivity } = require('./middleware/auditLog');
const registerRoutes = require('./routes');

const app = express();

// Assign a unique request ID to every incoming request for distributed tracing and log correlation.
app.use(requestId);

// Trust the proxy in front of the app so req.ip reflects the real client IP.
// This is required for rate limiting, geo-restrictions, and accurate logging
// when deployed behind Nginx, Vercel, Heroku, ELB, Cloudflare, etc.
// Set to 1 for a single reverse proxy; increase if requests traverse multiple proxies.
app.set('trust proxy', 1);

const isDev = process.env.NODE_ENV === 'development';
// Treat Vercel deployments as production even if NODE_ENV was not set explicitly,
// so cookies use Secure + SameSite=None (required for cross-site XHR from the
// separate frontend Vercel domain).
const isProd = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';
const frontendUrl = process.env.FRONTEND_URL || 'https://tr-tech-frontend.vercel.app';

const corsOptions = {
  origin: frontendUrl,
  credentials: true,
};
app.use(cors(corsOptions));

const connectSrc = isDev
  ? ["'self'", "https://wa.me", "https://tr-tech-frontend.vercel.app", "https://api.paystack.co"]
  : ["'self'", "https://wa.me", "https://tr-tech-frontend.vercel.app", "https://api.paystack.co"];

// Helmet sets security-related HTTP headers. The CSP below is intentionally strict:
// - defaultSrc 'self': blocks all external resources by default
// - scriptSrc allows WhatsApp embed scripts and inline styles for font loading
// - imgSrc allows data URIs and HTTPS images for product images
// - connectSrc allows API calls to the backend and WhatsApp
// - frameSrc/frameAncestors prevent clickjacking
//
// Cross-origin policies:
// - COOP/COEP are disabled because the app embeds WhatsApp chat widgets and may
//   embed other third-party content (Paystack, analytics). Enabling them would
//   break these cross-origin embeds. If cross-origin embeds are removed in the
//   future, enable crossOriginEmbedderPolicy: "require-corp" and
//   crossOriginOpenerPolicy: "same-origin" for stronger isolation.
const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "https://wa.me"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: connectSrc,
      fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["https://wa.me"],
      frameAncestors: ["'none'"],
      formAction: ["'self'"],
      baseUri: ["'self'"],
      manifestSrc: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: false,
  crossOriginOpenerPolicy: false,
});

// HSTS (HTTP Strict Transport Security) is only enabled in production because:
// - Local development typically runs over HTTP (http://localhost:3000/5000)
// - Enabling HSTS in dev would tell browsers to refuse HTTP connections,
//   breaking local development workflows
// - In production/Vercel, all traffic is served over HTTPS, so HSTS is safe
if (isProd) {
  helmetMiddleware.set({
    strictTransportSecurity: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
  });
}

app.use(helmetMiddleware);

app.use(createApiLimiter());

// Webhook raw body parser MUST run before any JSON parser so HMAC signature
// verification receives the unmodified payload bytes.
app.use('/api/v1/payments/paystack/webhook', express.raw({ type: 'application/json' }));

// Limit request body size to 100KB to mitigate large-payload attacks and reduce memory usage.
// Skip JSON/urlencoded parsing for the webhook path because the raw body is already captured above.
const jsonParser = express.json({ limit: '100kb' });
const urlencodedParser = express.urlencoded({ extended: false, limit: '100kb' });
app.use((req, res, next) => {
  if (req.path === '/api/v1/payments/paystack/webhook') {
    return next();
  }
  jsonParser(req, res, next);
});
app.use((req, res, next) => {
  if (req.path === '/api/v1/payments/paystack/webhook') {
    return next();
  }
  urlencodedParser(req, res, next);
});
app.use(cookieParser());
app.use(sanitize);

// Serve local uploads for both development and production.
// New uploads may go to Vercel Blob (when BLOB_READ_WRITE_TOKEN is set),
// but legacy products and any locally stored files still need to be served.
app.use('/uploads', (req, res, next) => {
  res.header('Access-Control-Allow-Origin', process.env.FRONTEND_URL || 'https://tr-tech-frontend.vercel.app');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Cross-Origin-Resource-Policy', 'cross-origin');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
}, express.static(path.join(__dirname, 'uploads')));

// CSRF endpoint: generates a random token, stores it in an HTTP-only cookie, and returns it
// to the client. The client must send this token back in the X-CSRF-Token header for
// non-GET requests. This double-submit cookie pattern prevents CSRF without server-side state.
app.get('/api/csrf-token', createApiLimiter(), (req, res) => {
  const token = crypto.randomBytes(32).toString('hex');
  res.cookie('csrf_token', token, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    path: '/',
  });
  res.json({ csrfToken: token });
});


app.get('/', (req, res) => {
  res.json({ status: 'OK', message: 'TR-Tech Backend is running' });
});

app.use(logActivity);

registerRoutes(app);

// Centralized error-handling middleware. Must be registered after all routes.
// - 400/parse errors: invalid JSON payload
// - 5xx errors: generic message in production, full stack in development
app.use((err, req, res, next) => {
  console.error(err.stack);
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, message: 'Invalid JSON payload' });
  }

  const status = err.status || 500;
  const isProd = process.env.NODE_ENV === 'production';
  const message = isProd && status >= 500
    ? 'Internal Server Error'
    : (err.message || 'Internal Server Error');

  res.status(status).json({
    success: false,
    message,
    error: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });
});

if (process.env.NODE_ENV === 'production') {
  const frontendDist = path.join(__dirname, 'frontend-build');
  app.use(express.static(frontendDist));

  // Static public routes that exist in the frontend SPA.
  // Dynamic routes (product detail, account, admin) are matched by prefix below.
  const STATIC_ROUTES = new Set([
    '/about',
    '/services',
    '/shop',
    '/book-repair',
    '/cart',
    '/checkout',
    '/contact',
    '/wishlist',
    '/track-order',
    '/order-confirmation',
  ]);

  // Prefix-based matching for dynamic routes with path params.
  const DYNAMIC_ROUTE_PREFIXES = [
    '/products/',
    '/account/',
    '/admin/',
  ];

  const isKnownRoute = (reqPath) => {
    if (reqPath === '/') return true;
    if (STATIC_ROUTES.has(reqPath)) return true;
    if (DYNAMIC_ROUTE_PREFIXES.some((p) => reqPath.startsWith(p))) return true;
    if (reqPath === '/admin' || reqPath === '/account') return true;
    return false;
  };

  // Catch-all for client-side routing. Known routes serve index.html with 200
  // so the SPA renders normally. Unknown paths serve index.html with 404 so
  // React Router renders NotFoundPage but the HTTP status is correct for SEO
  // (prevents soft-404).
  app.get('*', (req, res) => {
    if (isKnownRoute(req.path)) {
      return res.sendFile(path.join(frontendDist, 'index.html'));
    }
    res.status(404).sendFile(path.join(frontendDist, 'index.html'));
  });
}

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
  });
});

module.exports = app;

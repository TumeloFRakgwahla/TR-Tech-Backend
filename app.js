const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const sanitize = require('./middleware/sanitize');
const requestId = require('./middleware/requestId');
const { createAuthLimiter, createApiLimiter } = require('./middleware/rateLimiter');
const registerRoutes = require('./routes');

const app = express();

// Assign a unique request ID to every incoming request for distributed tracing and log correlation.
app.use(requestId);

// Trust the single proxy in front of the app (Nginx, Heroku, ELB, etc.) so that
// express-rate-limit and req.ip reflect the real client IP instead of the proxy's.
// Increase the number if requests traverse multiple proxies.
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

const isDev = process.env.NODE_ENV === 'development';
const frontendUrl = process.env.FRONTEND_URL || 'https://tr-tech-frontend.vercel.app';

const corsOptions = {
  origin: frontendUrl,
  credentials: true,
};
app.use(cors(corsOptions));

const connectSrc = isDev
  ? ["'self'", "https://wa.me", "https://api.trtech.co.za"]
  : ["'self'", "https://wa.me", "https://api.trtech.co.za"];

// Helmet sets security-related HTTP headers. The CSP below is intentionally strict:
// - defaultSrc 'self': blocks all external resources by default
// - scriptSrc allows WhatsApp embed scripts and inline styles for font loading
// - imgSrc allows data URIs and HTTPS images for product images
// - connectSrc allows API calls to the backend and WhatsApp
// - frameSrc/frameAncestors prevent clickjacking
app.use(helmet({
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
}));

app.use(createApiLimiter());

// Limit request body size to 100KB to mitigate large-payload attacks and reduce memory usage.
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));
app.use(cookieParser());
app.use(sanitize);

// Serve uploaded files with explicit CORS/CORP headers so the frontend can load them
// even when the backend is on a different origin.
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
app.get('/api/csrf-token', (req, res) => {
  const token = crypto.randomBytes(32).toString('hex');
  res.cookie('csrf_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  });
  res.json({ csrfToken: token });
});

registerRoutes(app);

app.get('/api/v1/health', (req, res) => {
  res.json({ status: 'OK', message: 'TR-Tech Backend is running' });
});

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
  const frontendDist = path.join(__dirname, '..', 'tr-tech-frontend', 'dist');
  app.use(express.static(frontendDist));
  app.get('*', (req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
  });
});

module.exports = app;

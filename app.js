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

app.use(requestId);

// Trust the single proxy in front of the app (Nginx, Heroku, ELB, etc.) so that
// express-rate-limit and req.ip reflect the real client IP instead of the proxy's.
// Increase the number if requests traverse multiple proxies.
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

const isDev = process.env.NODE_ENV === 'development';
const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

const corsOptions = {
  origin: frontendUrl,
  credentials: true,
};
app.use(cors(corsOptions));

const connectSrc = isDev ? ["'self'", frontendUrl] : ["'self'"];

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: connectSrc,
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
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

app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));
app.use(cookieParser());
app.use(sanitize);

app.use('/uploads', (req, res, next) => {
  res.header('Access-Control-Allow-Origin', process.env.FRONTEND_URL || 'http://localhost:5173');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Cross-Origin-Resource-Policy', 'cross-origin');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
}, express.static(path.join(__dirname, 'uploads')));

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

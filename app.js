const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const crypto = require('crypto');
const parseCookie = require('./middleware/parseCookie');
const sanitize = require('./middleware/sanitize');
const { createAuthLimiter, createApiLimiter } = require('./middleware/rateLimiter');
const { csrfProtection } = require('./middleware/csrf');

const app = express();

const corsOptions = {
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
};
app.use(cors(corsOptions));

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
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

if (process.env.NODE_ENV === 'production') {
  app.use(createApiLimiter());
}

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: false }));
app.use(parseCookie);
app.use(sanitize);

app.use('/uploads', (req, res, next) => {
  res.header('Access-Control-Allow-Origin', process.env.FRONTEND_URL || 'http://localhost:5173');
  res.header('Access-Control-Allow-Methods', 'GET', 'OPTIONS');
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
    sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
  });
  res.json({ csrfToken: token });
});

if (process.env.NODE_ENV !== 'test') {
  app.use('/api/auth', csrfProtection, require('./routes/auth'));
  app.use('/api/products', csrfProtection, require('./routes/products'));
  app.use('/api/services', csrfProtection, require('./routes/services'));
  app.use('/api/orders', csrfProtection, require('./routes/orders'));
  app.use('/api/contact', csrfProtection, require('./routes/contact'));
  app.use('/api/repairs', csrfProtection, require('./routes/repairs'));
  app.use('/api/upload', csrfProtection, require('./routes/upload'));
  app.use('/api/users', csrfProtection, require('./routes/users'));
  app.use('/api/marketing', csrfProtection, require('./routes/marketing'));
  app.use('/api/wishlist', csrfProtection, require('./routes/wishlist'));
} else {
  app.use('/api/auth', require('./routes/auth'));
  app.use('/api/products', require('./routes/products'));
  app.use('/api/services', require('./routes/services'));
  app.use('/api/orders', require('./routes/orders'));
  app.use('/api/contact', require('./routes/contact'));
  app.use('/api/repairs', require('./routes/repairs'));
  app.use('/api/upload', require('./routes/upload'));
  app.use('/api/users', require('./routes/users'));
  app.use('/api/marketing', require('./routes/marketing'));
  app.use('/api/wishlist', require('./routes/wishlist'));
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'TR-Tech Backend is running' });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, message: 'Invalid JSON payload' });
  }
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
    error: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });
});

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
  });
});

module.exports = app;

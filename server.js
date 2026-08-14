const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const dotenv = require('dotenv');
const path = require('path');
const crypto = require('crypto');
const connectDB = require('./config/db');
const parseCookie = require('./middleware/parseCookie');
const { createAuthLimiter, createApiLimiter } = require('./middleware/rateLimiter');
const { csrfProtection } = require('./middleware/csrf');

dotenv.config();

connectDB();

const app = express();

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', process.env.FRONTEND_URL || 'http://localhost:5173');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-CSRF-Token');
  res.header('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: false,
  crossOriginOpenerPolicy: false,
}));

const corsOptions = {
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
};
app.use(cors(corsOptions));

if (process.env.NODE_ENV === 'production') {
  app.use(createApiLimiter());
}

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: false }));
app.use(parseCookie);

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
    sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
  });
  res.json({ csrfToken: token });
});

app.use('/api/auth', csrfProtection, require('./routes/auth'));
app.use('/api/products', csrfProtection, require('./routes/products'));
app.use('/api/services', csrfProtection, require('./routes/services'));
app.use('/api/orders', csrfProtection, require('./routes/orders'));
app.use('/api/contact', csrfProtection, require('./routes/contact'));
app.use('/api/repairs', csrfProtection, require('./routes/repairs'));
app.use('/api/upload', csrfProtection, require('./routes/upload'));
app.use('/api/users', csrfProtection, require('./routes/users'));
app.use('/api/marketing', csrfProtection, require('./routes/marketing'));

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
    error: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

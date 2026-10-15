require('dotenv').config();

const { parseEnv } = require('./config/env');
const { isMailConfigured, verifyTransport } = require('./utils/mail');
try {
  parseEnv();
} catch (err) {
  console.error('Failed to load environment configuration:', err);
  if (process.env.VERCEL !== '1') {
    process.exit(1);
  }
}

const connectDB = require('./config/db');
const app = require('./app');

const PORT = process.env.PORT || 5000;

if ((process.env.NODE_ENV === 'production' || process.env.VERCEL === '1') && !process.env.BLOB_READ_WRITE_TOKEN) {
  console.warn('[startup] BLOB_READ_WRITE_TOKEN is not set. Image uploads will fail in production until it is configured in Vercel environment variables.');
}

if (isMailConfigured()) {
  verifyTransport().then((ok) => {
    if (ok === false) {
      console.error('[startup] SMTP/transport verification failed. Emails may not be sent. Check SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS.');
    }
  });
} else {
  const envLabel = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1' ? 'production' : 'development';
  const isDev = envLabel === 'development';
  const msg = `[startup] Email transport not configured. ${
    isDev
      ? 'Using development JSON transport — emails will be logged to console instead of sent. Configure SMTP or SendGrid to send real emails.'
      : 'Verification emails will NOT be sent. Configure SMTP_HOST/SMTP_USER or SENDGRID_API_KEY in environment variables.'
  }`;
  if (isDev) {
    console.warn(msg);
  } else {
    console.error(msg);
  }
}

if (process.env.VERCEL !== '1') {
  connectDB().then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  }).catch((err) => {
    console.error('Failed to connect to MongoDB:', err);
    process.exit(1);
  });
} else {
  connectDB().catch((err) => {
    console.error('MongoDB connection error on Vercel:', err);
  });
}

module.exports = app;
module.exports.default = app;

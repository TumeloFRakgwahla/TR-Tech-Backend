require('dotenv').config();

const { parseEnv } = require('./config/env');
let env;
try {
  env = parseEnv();
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

require('dotenv').config();

// Validate environment variables before anything else. This ensures required secrets
// (JWT_SECRET, MONGODB_URI) are present and correctly typed before the app boots.
const { parseEnv } = require('./config/env');
parseEnv();

// Establish MongoDB connection. The app will not start until the database is reachable.
const connectDB = require('./config/db');

// Import the fully configured Express application.
const app = require('./app');

const PORT = process.env.PORT || 5000;

if (process.env.VERCEL !== '1') {
  // Local development: connect to DB then start listening.
  connectDB().then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  }).catch((err) => {
    console.error('Failed to connect to MongoDB:', err);
    process.exit(1);
  });
} else {
  // Vercel serverless: connect to DB in background. The function handler
  // will be invoked for each request even if DB connection is still pending.
  connectDB().catch((err) => {
    console.error('MongoDB connection error on Vercel:', err);
  });
}

module.exports = app;

require('dotenv').config();

// Validate environment variables before anything else. This ensures required secrets
// (JWT_SECRET, MONGODB_URI) are present and correctly typed before the app boots.
const { parseEnv } = require('./config/env');
parseEnv();

// Establish MongoDB connection. The app will not start until the database is reachable.
const connectDB = require('./config/db');
connectDB();

// Import the fully configured Express application.
const app = require('./app');

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

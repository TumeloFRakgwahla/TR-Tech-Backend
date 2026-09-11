const mongoose = require('mongoose');

// Establishes the MongoDB connection using the URI from environment variables.
// Registers listeners for connection lifecycle events (disconnect, error, reconnect).
// In Vercel serverless mode, we do NOT exit the process on connection failure
// because the function may be invoked before the DB is ready, and the
// connection can be retried on subsequent requests.
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    console.log(`MongoDB Connected: ${conn.connection.host}`);

    mongoose.connection.on('disconnected', () => {
      console.log('MongoDB disconnected');
    });

    mongoose.connection.on('error', (err) => {
      console.error('MongoDB connection error:', err);
    });

    mongoose.connection.on('reconnected', () => {
      console.log('MongoDB reconnected');
    });
  } catch (error) {
    console.error(`MongoDB connection error: ${error.message}`);
    if (process.env.VERCEL !== '1') {
      // Only exit in local development; Vercel serverless functions should
      // continue so the runtime can retry the connection on next invocation.
      process.exit(1);
    }
  }
};

module.exports = connectDB;

// Standardized 500 error response. Logs the full error server-side but returns
// a generic message in production to avoid leaking internal details.
const serverError = (res, error) => {
  console.error(error);
  const isProd = process.env.NODE_ENV === 'production';
  res.status(500).json({
    success: false,
    message: isProd ? 'Internal Server Error' : (error && error.message) || 'Internal Server Error',
  });
};

// Standardized 400 error response. Prevents leaking MongoDB/Mongoose validation
// messages to clients in production.
const badRequest = (res, error) => {
  const isProd = process.env.NODE_ENV === 'production';
  res.status(400).json({
    success: false,
    message: isProd ? 'Bad request' : (error && error.message) || 'Bad request',
  });
};

const successResponse = (res, data, statusCode = 200) => {
  res.status(statusCode).json({
    success: true,
    data,
  });
};

module.exports = { serverError, badRequest, successResponse };

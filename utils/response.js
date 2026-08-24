const serverError = (res, error) => {
  console.error(error);
  const isProd = process.env.NODE_ENV === 'production';
  res.status(500).json({
    success: false,
    message: isProd ? 'Internal Server Error' : (error && error.message) || 'Internal Server Error',
  });
};

// 400 responses: avoid leaking internal error details (e.g. Mongo messages) in production.
const badRequest = (res, error) => {
  const isProd = process.env.NODE_ENV === 'production';
  res.status(400).json({
    success: false,
    message: isProd ? 'Bad request' : (error && error.message) || 'Bad request',
  });
};

module.exports = { serverError, badRequest };

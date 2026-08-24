const fs = require('fs');
const path = require('path');

const registerRoutes = (app) => {
  const routesDir = __dirname;
  const routeFiles = fs.readdirSync(routesDir).filter((file) => {
    const fullPath = path.join(routesDir, file);
    return file.endsWith('.js') && file !== 'index.js' && fs.statSync(fullPath).isFile();
  });

  const isTest = process.env.NODE_ENV === 'test';
  const csrfMiddleware = isTest ? (req, res, next) => next() : require('../middleware/csrf').csrfProtection;

  const pathMap = {
    paymentMethods: 'payment-methods',
  };

  routeFiles.forEach((file) => {
    const routeName = path.basename(file, '.js');
    const route = require(path.join(routesDir, file));
    const basePath = `/api/v1/${pathMap[routeName] || routeName}`;
    app.use(basePath, csrfMiddleware, route);
  });
};

module.exports = registerRoutes;

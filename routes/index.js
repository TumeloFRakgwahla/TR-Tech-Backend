const csrfProtection = require('../middleware/csrf').csrfProtection;

const accountRoutes = require('./account');
const authRoutes = require('./auth');
const brandsRoutes = require('./brands');
const cartRoutes = require('./cart');
const categoriesRoutes = require('./categories');
const contactRoutes = require('./contact');
const marketingRoutes = require('./marketing');
const ordersRoutes = require('./orders');
const paymentMethodsRoutes = require('./paymentMethods');
const productsRoutes = require('./products');
const repairsRoutes = require('./repairs');
const servicesRoutes = require('./services');
const uploadRoutes = require('./upload');
const usersRoutes = require('./users');
const wishlistRoutes = require('./wishlist');

const routeRegistry = [
  { path: '/api/v1/account', routes: accountRoutes },
  { path: '/api/v1/auth', routes: authRoutes },
  { path: '/api/v1/brands', routes: brandsRoutes },
  { path: '/api/v1/cart', routes: cartRoutes },
  { path: '/api/v1/categories', routes: categoriesRoutes },
  { path: '/api/v1/contact', routes: contactRoutes },
  { path: '/api/v1/marketing', routes: marketingRoutes },
  { path: '/api/v1/orders', routes: ordersRoutes },
  { path: '/api/v1/payment-methods', routes: paymentMethodsRoutes },
  { path: '/api/v1/products', routes: productsRoutes },
  { path: '/api/v1/repairs', routes: repairsRoutes },
  { path: '/api/v1/services', routes: servicesRoutes },
  { path: '/api/v1/upload', routes: uploadRoutes },
  { path: '/api/v1/users', routes: usersRoutes },
  { path: '/api/v1/wishlist', routes: wishlistRoutes },
];

const registerRoutes = (app) => {
  const isTest = process.env.NODE_ENV === 'test';
  const csrfMiddleware = isTest ? (req, res, next) => next() : csrfProtection;

  routeRegistry.forEach(({ path, routes }) => {
    app.use(path, csrfMiddleware, routes);
  });
};

module.exports = registerRoutes;

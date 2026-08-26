const express = require('express');
const validator = require('validator');
const { serverError, badRequest } = require('../utils/response');
const { sendPaginated } = require('../utils/pagination');
const router = express.Router();
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const Product = require('../models/Product');
const { authenticateAdmin } = require('../middleware/auth');
const { toSafeString, escapeRegex } = require('../utils/query');
const {
  createProduct,
  getProducts,
  getProductById,
  updateProduct,
  deleteProduct,
} = require('../services/productService');

const unescapeUrl = (url) => (url ? validator.unescape(url) : url);

const sanitizeProductUrls = (product) => {
  if (!product) return product;
  if (Array.isArray(product)) {
    return product.map(sanitizeProductUrls);
  }
  const p = product.toObject ? product.toObject() : { ...product };
  if (p.image) p.image = unescapeUrl(p.image);
  if (Array.isArray(p.images)) p.images = p.images.map(unescapeUrl);
  return p;
};

const productValidation = [
  body('name').trim().notEmpty().withMessage('Product name is required').isLength({ max: 100 }).withMessage('Name cannot exceed 100 characters'),
  body('description').trim().notEmpty().withMessage('Product description is required').isLength({ max: 500 }).withMessage('Description cannot exceed 500 characters'),
  body('category').trim().notEmpty().withMessage('Category is required'),
  body('brand').trim().notEmpty().withMessage('Brand is required'),
  body('price').isFloat({ min: 0 }).withMessage('Price must be a positive number'),
  body('condition').trim().notEmpty().withMessage('Condition is required'),
  body('stock').isInt({ min: 0 }).withMessage('Stock must be a non-negative integer'),
  body('status').optional().trim().isIn(['Active', 'Inactive', 'Out of Stock']).withMessage('Invalid status')
];

router.get('/low-stock', authenticateAdmin, async (req, res) => {
  try {
    const threshold = parseInt(req.query.threshold) || 10;
    const products = await Product.find({ stock: { $lte: threshold }, status: 'Active' }).sort({ stock: 1 });
    res.json({ success: true, count: products.length, data: sanitizeProductUrls(products) });
  } catch (error) {
    serverError(res, error);
  }
});

router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    let query = {};

    const category = toSafeString(req.query.category);
    const brand = toSafeString(req.query.brand);
    const status = toSafeString(req.query.status);
    const search = toSafeString(req.query.search);

    if (category) query.category = category;
    if (brand) query.brand = brand;
    if (status) query.status = status;
    if (search) {
      const safeSearch = escapeRegex(search);
      query.$or = [
        { name: { $regex: safeSearch, $options: 'i' } },
        { description: { $regex: safeSearch, $options: 'i' } }
      ];
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

    const { products, total } = await getProducts(query, pageNum, limitNum);

    sendPaginated(res, sanitizeProductUrls(products), total, pageNum, limitNum);
  } catch (error) {
    serverError(res, error);
  }
});

router.get('/:id', async (req, res) => {
  try {
    const product = await getProductById(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    res.json({ success: true, data: sanitizeProductUrls(product) });
  } catch (error) {
    serverError(res, error);
  }
});

router.post('/', authenticateAdmin, productValidation, validate, async (req, res) => {
  try {
    const { name, description, category, brand, price, condition, image, images, stock, status } = req.body;
    const product = await createProduct({
      name, description, category, brand, price, condition,
      image: unescapeUrl(image), images: Array.isArray(images) ? images.map(unescapeUrl) : images, stock,
      status: status || 'Active',
    });
    res.status(201).json({ success: true, data: sanitizeProductUrls(product) });
  } catch (error) {
    badRequest(res, error);
  }
});

router.put('/:id', authenticateAdmin, productValidation, validate, async (req, res) => {
  try {
    const { name, description, category, brand, price, condition, image, images, stock, status } = req.body;
    const product = await updateProduct(req.params.id, {
      name, description, category, brand, price, condition,
      image: unescapeUrl(image), images: Array.isArray(images) ? images.map(unescapeUrl) : images, stock, status
    });
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    res.json({ success: true, data: sanitizeProductUrls(product) });
  } catch (error) {
    badRequest(res, error);
  }
});

router.delete('/:id', authenticateAdmin, async (req, res) => {
  try {
    const product = await deleteProduct(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    res.json({ success: true, message: 'Product deleted successfully' });
  } catch (error) {
    serverError(res, error);
  }
});

module.exports = router;

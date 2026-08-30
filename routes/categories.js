const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const { authenticateAdmin } = require('../middleware/auth');
const { serverError, badRequest } = require('../utils/response');
const { sendPaginated } = require('../utils/pagination');
const { escapeRegex } = require('../utils/query');
const Category = require('../models/Category');
const {
  getCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
} = require('../services/categoryService');

const categoryValidation = [
  body('name').trim().notEmpty().withMessage('Category name is required').isLength({ max: 100 }),
  body('slug').optional().trim().isLength({ max: 100 }),
  body('status').optional().trim().isIn(['Active', 'Inactive']),
];

// Get all active categories for public display (e.g., shop filter dropdown).
router.get('/active', async (req, res) => {
  try {
    const categories = await Category.find({ status: 'Active' }).sort({ name: 1 });
    res.json({ success: true, data: categories });
  } catch (error) {
    serverError(res, error);
  }
});

// All routes below this middleware require admin authentication.
router.use(authenticateAdmin);

// List categories with optional search, status filter, and pagination.
router.get('/', async (req, res) => {
  try {
    const { search, status, limit = 50, page = 1 } = req.query;
    let query = {};
    if (status) query.status = status;
    if (search) {
      query.$or = [
        { name: { $regex: escapeRegex(search), $options: 'i' } },
        { slug: { $regex: escapeRegex(search), $options: 'i' } },
      ];
    }
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const { items, total } = await getCategories(query, pageNum, limitNum);
    sendPaginated(res, items, total, pageNum, limitNum);
  } catch (error) {
    serverError(res, error);
  }
});

// Get a single category by ID. Admin-only.
router.get('/:id', async (req, res) => {
  try {
    const category = await getCategoryById(req.params.id);
    if (!category) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }
    res.json({ success: true, data: category });
  } catch (error) {
    serverError(res, error);
  }
});

// Create a new category. Admin-only.
router.post('/', categoryValidation, validate, async (req, res) => {
  try {
    const { name, slug, status } = req.body;
    const category = await createCategory({ name, slug, status: status || 'Active' });
    res.status(201).json({ success: true, data: category });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: error.keyValue?.name ? 'A category with this name already exists' : 'A category with this slug already exists' });
    }
    badRequest(res, error);
  }
});

// Update a category by ID. Admin-only.
router.put('/:id', [
  body('name').optional().trim().notEmpty().withMessage('Category name cannot be empty').isLength({ max: 100 }),
  body('slug').optional().trim().isLength({ max: 100 }),
  body('status').optional().trim().isIn(['Active', 'Inactive']),
], validate, async (req, res) => {
  try {
    const category = await updateCategory(req.params.id, req.body);
    if (!category) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }
    res.json({ success: true, data: category });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'A category with this name already exists' });
    }
    serverError(res, error);
  }
});

// Delete a category by ID. Admin-only.
router.delete('/:id', async (req, res) => {
  try {
    const category = await deleteCategory(req.params.id);
    if (!category) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }
    res.json({ success: true, message: 'Category deleted successfully' });
  } catch (error) {
    serverError(res, error);
  }
});

module.exports = router;

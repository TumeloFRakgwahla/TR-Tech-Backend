const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const { authenticateAdmin } = require('../middleware/auth');
const { serverError, badRequest } = require('../utils/response');
const { sendPaginated } = require('../utils/pagination');
const { escapeRegex } = require('../utils/query');
const Brand = require('../models/Brand');
const {
  getBrands,
  getBrandById,
  createBrand,
  updateBrand,
  deleteBrand,
} = require('../services/brandService');

const brandValidation = [
  body('name').trim().notEmpty().withMessage('Brand name is required').isLength({ max: 100 }),
  body('slug').optional().trim().isLength({ max: 100 }),
  body('status').optional().trim().isIn(['Active', 'Inactive']),
  body('logo').optional().trim().isLength({ max: 500 }),
];

// Get all active brands for public display (e.g., shop filter dropdown).
router.get('/active', async (req, res) => {
  try {
    const brands = await Brand.find({ status: 'Active' }).sort({ name: 1 });
    res.json({ success: true, data: brands });
  } catch (error) {
    serverError(res, error);
  }
});

// All routes below this middleware require admin authentication.
router.use(authenticateAdmin);

// List brands with optional search, status filter, and pagination.
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
    const { items, total } = await getBrands(query, pageNum, limitNum);
    sendPaginated(res, items, total, pageNum, limitNum);
  } catch (error) {
    serverError(res, error);
  }
});

// Get a single brand by ID. Admin-only.
router.get('/:id', async (req, res) => {
  try {
    const brand = await getBrandById(req.params.id);
    if (!brand) {
      return res.status(404).json({ success: false, message: 'Brand not found' });
    }
    res.json({ success: true, data: brand });
  } catch (error) {
    serverError(res, error);
  }
});

// Create a new brand. Admin-only.
router.post('/', brandValidation, validate, async (req, res) => {
  try {
    const { name, slug, status, logo } = req.body;
    const brand = await createBrand({ name, slug, status: status || 'Active', logo });
    res.status(201).json({ success: true, data: brand });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'A brand with this name already exists' });
    }
    badRequest(res, error);
  }
});

// Update a brand by ID. Admin-only.
router.put('/:id', [
  body('name').optional().trim().notEmpty().withMessage('Brand name cannot be empty').isLength({ max: 100 }),
  body('slug').optional().trim().isLength({ max: 100 }),
  body('status').optional().trim().isIn(['Active', 'Inactive']),
  body('logo').optional().trim().isLength({ max: 500 }),
], validate, async (req, res) => {
  try {
    const brand = await updateBrand(req.params.id, req.body);
    if (!brand) {
      return res.status(404).json({ success: false, message: 'Brand not found' });
    }
    res.json({ success: true, data: brand });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'A brand with this name already exists' });
    }
    serverError(res, error);
  }
});

// Delete a brand by ID. Admin-only.
router.delete('/:id', async (req, res) => {
  try {
    const brand = await deleteBrand(req.params.id);
    if (!brand) {
      return res.status(404).json({ success: false, message: 'Brand not found' });
    }
    res.json({ success: true, message: 'Brand deleted successfully' });
  } catch (error) {
    serverError(res, error);
  }
});

module.exports = router;

const Category = require('../models/Category');

// Retrieves a paginated list of categories matching the query filter.
const getCategories = async (query = {}, page = 1, limit = 50) => {
  const skip = (Math.max(1, parseInt(page, 10) || 1) - 1) * limit;
  const [items, total] = await Promise.all([
    Category.find(query).sort({ displayOrder: 1, createdAt: -1 }).skip(skip).limit(limit),
    Category.countDocuments(query),
  ]);
  return { items, total };
};

// Finds a single category by its MongoDB ObjectId.
const getCategoryById = async (id) => {
  return Category.findById(id);
};

// Creates a new category. Auto-generates a URL-friendly slug from the name if not provided.
const createCategory = async (data) => {
  const slug = data.slug || data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return Category.create({ ...data, slug });
};

// Updates a category by ID. runValidators: true ensures schema validation runs on updates.
const updateCategory = async (id, data) => {
  return Category.findByIdAndUpdate(id, data, { new: true, runValidators: true });
};

// Permanently deletes a category by ID.
const deleteCategory = async (id) => {
  return Category.findByIdAndDelete(id);
};

// Returns active categories sorted by displayOrder for the frontend CategoryChips component.
const getActiveCategories = async () => {
  return Category.find({ status: 'Active' }).sort({ displayOrder: 1, createdAt: -1 });
};

// Returns an array of category names, optionally filtered by status.
// Used for dropdown filters in the shop and admin panels.
const getCategoryNames = async (status = 'Active') => {
  const query = status ? { status } : {};
  const categories = await Category.find(query).sort({ name: 1 });
  return categories.map((c) => c.name);
};

module.exports = {
  getCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
  getActiveCategories,
  getCategoryNames,
};

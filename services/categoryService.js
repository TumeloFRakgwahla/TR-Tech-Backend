const Category = require('../models/Category');

const getCategories = async (query = {}, page = 1, limit = 50) => {
  const skip = (Math.max(1, parseInt(page, 10) || 1) - 1) * limit;
  const [items, total] = await Promise.all([
    Category.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Category.countDocuments(query),
  ]);
  return { items, total };
};

const getCategoryById = async (id) => {
  return Category.findById(id);
};

const createCategory = async (data) => {
  const slug = data.slug || data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return Category.create({ ...data, slug });
};

const updateCategory = async (id, data) => {
  return Category.findByIdAndUpdate(id, data, { new: true, runValidators: true });
};

const deleteCategory = async (id) => {
  return Category.findByIdAndDelete(id);
};

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
  getCategoryNames,
};

const Category = require('../models/Category');
const cache = require('../utils/cache');

const CACHE_TTL_MS = 5 * 60 * 1000;

const getCategories = async (query = {}, page = 1, limit = 50) => {
  if (Object.keys(query).length === 0 && !page && !limit) {
    const cached = cache.get('categories:list');
    if (cached) return cached;
  }

  const skip = (Math.max(1, parseInt(page, 10) || 1) - 1) * limit;
  const [items, total] = await Promise.all([
    Category.find(query).sort({ displayOrder: 1, createdAt: -1 }).skip(skip).limit(limit),
    Category.countDocuments(query),
  ]);
  const result = { items, total };

  if (Object.keys(query).length === 0 && !page && !limit) {
    cache.set('categories:list', result, CACHE_TTL_MS);
  }

  return result;
};

const getCategoryById = async (id) => {
  const cacheKey = `category:${id}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const category = await Category.findById(id);
  if (category) {
    cache.set(cacheKey, category, CACHE_TTL_MS);
  }
  return category;
};

const createCategory = async (data) => {
  cache.delete('categories:list');
  cache.delete('categories:active');
  const slug = data.slug || data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return Category.create({ ...data, slug });
};

const updateCategory = async (id, data) => {
  cache.delete(`category:${id}`);
  cache.delete('categories:list');
  cache.delete('categories:active');
  return Category.findByIdAndUpdate(id, data, { new: true, runValidators: true });
};

const deleteCategory = async (id) => {
  cache.delete(`category:${id}`);
  cache.delete('categories:list');
  cache.delete('categories:active');
  return Category.findByIdAndDelete(id);
};

const getActiveCategories = async () => {
  const cached = cache.get('categories:active');
  if (cached) return cached;

  const categories = await Category.find({ status: 'Active' }).sort({ displayOrder: 1, createdAt: -1 });
  cache.set('categories:active', categories, CACHE_TTL_MS);
  return categories;
};

const getCategoryNames = async (status = 'Active') => {
  const cacheKey = `categories:names:${status}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const query = status ? { status } : {};
  const categories = await Category.find(query).sort({ name: 1 });
  const names = categories.map((c) => c.name);
  cache.set(cacheKey, names, CACHE_TTL_MS);
  return names;
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

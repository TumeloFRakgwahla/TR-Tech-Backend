const Brand = require('../models/Brand');
const cache = require('../utils/cache');

const CACHE_TTL_MS = 5 * 60 * 1000;

const getBrands = async (query = {}, page = 1, limit = 50) => {
  if (Object.keys(query).length === 0 && !page && !limit) {
    const cached = cache.get('brands:list');
    if (cached) return cached;
  }

  const skip = (Math.max(1, parseInt(page, 10) || 1) - 1) * limit;
  const [items, total] = await Promise.all([
    Brand.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Brand.countDocuments(query),
  ]);
  const result = { items, total };

  if (Object.keys(query).length === 0 && !page && !limit) {
    cache.set('brands:list', result, CACHE_TTL_MS);
  }

  return result;
};

const getBrandById = async (id) => {
  const cacheKey = `brand:${id}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const brand = await Brand.findById(id);
  if (brand) {
    cache.set(cacheKey, brand, CACHE_TTL_MS);
  }
  return brand;
};

const createBrand = async (data) => {
  cache.delete('brands:list');
  cache.delete('brands:names');
  const slug = data.slug || data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return Brand.create({ ...data, slug });
};

const updateBrand = async (id, data) => {
  cache.delete(`brand:${id}`);
  cache.delete('brands:list');
  cache.delete('brands:names');
  return Brand.findByIdAndUpdate(id, data, { new: true, runValidators: true });
};

const deleteBrand = async (id) => {
  cache.delete(`brand:${id}`);
  cache.delete('brands:list');
  cache.delete('brands:names');
  return Brand.findByIdAndDelete(id);
};

const getBrandNames = async (status = 'Active') => {
  const cacheKey = `brands:names:${status}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const query = status ? { status } : {};
  const brands = await Brand.find(query).sort({ name: 1 });
  const names = brands.map((b) => b.name);
  cache.set(cacheKey, names, CACHE_TTL_MS);
  return names;
};

module.exports = {
  getBrands,
  getBrandById,
  createBrand,
  updateBrand,
  deleteBrand,
  getBrandNames,
};

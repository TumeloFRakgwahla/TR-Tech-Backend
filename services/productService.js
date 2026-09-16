const Product = require('../models/Product');
const cache = require('../utils/cache');

// Maps sort query param values to Mongoose sort objects.
const SORT_MAP = {
  featured: { createdAt: -1 },
  newest: { createdAt: -1 },
  'price-asc': { price: 1 },
  'price-desc': { price: -1 },
  rating: { rating: -1 },
};

const CACHE_TTL_MS = 5 * 60 * 1000;

const createProduct = async (productData) => {
  cache.delete('products:list');
  return Product.create(productData);
};

const getProducts = async (query = {}, page = 1, limit = 20, sort = 'newest') => {
  if (Object.keys(query).length === 0 && !page && !limit) {
    const cached = cache.get('products:list');
    if (cached) return cached;
  }

  const skip = (Math.max(1, parseInt(page, 10) || 1) - 1) * limit;
  const sortOption = SORT_MAP[sort] || SORT_MAP.newest;
  const [products, total] = await Promise.all([
    Product.find(query).sort(sortOption).skip(skip).limit(limit),
    Product.countDocuments(query),
  ]);
  const result = { products, total };

  if (Object.keys(query).length === 0 && !page && !limit) {
    cache.set('products:list', result, CACHE_TTL_MS);
  }

  return result;
};

const getProductById = async (id) => {
  const cacheKey = `product:${id}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const product = await Product.findById(id);
  if (product) {
    cache.set(cacheKey, product, CACHE_TTL_MS);
  }
  return product;
};

const updateProduct = async (id, updateData) => {
  cache.delete(`product:${id}`);
  cache.delete('products:list');
  return Product.findByIdAndUpdate(id, updateData, { new: true, runValidators: true });
};

const deleteProduct = async (id) => {
  cache.delete(`product:${id}`);
  cache.delete('products:list');
  return Product.findByIdAndDelete(id);
};

module.exports = {
  createProduct,
  getProducts,
  getProductById,
  updateProduct,
  deleteProduct,
};

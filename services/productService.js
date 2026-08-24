const Product = require('../models/Product');

const createProduct = async (productData) => {
  return Product.create(productData);
};

const getProducts = async (query = {}, page = 1, limit = 20) => {
  const skip = (Math.max(1, parseInt(page, 10) || 1) - 1) * limit;
  const [products, total] = await Promise.all([
    Product.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Product.countDocuments(query),
  ]);
  return { products, total };
};

const getProductById = async (id) => {
  return Product.findById(id);
};

const updateProduct = async (id, updateData) => {
  return Product.findByIdAndUpdate(id, updateData, { new: true, runValidators: true });
};

const deleteProduct = async (id) => {
  return Product.findByIdAndDelete(id);
};

module.exports = {
  createProduct,
  getProducts,
  getProductById,
  updateProduct,
  deleteProduct,
};

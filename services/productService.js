const Product = require('../models/Product');

// Creates a new product document in the database.
const createProduct = async (productData) => {
  return Product.create(productData);
};

// Retrieves a paginated list of products matching the given query filter.
// Sorts by newest first (createdAt descending).
const getProducts = async (query = {}, page = 1, limit = 20) => {
  const skip = (Math.max(1, parseInt(page, 10) || 1) - 1) * limit;
  const [products, total] = await Promise.all([
    Product.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Product.countDocuments(query),
  ]);
  return { products, total };
};

// Finds a single product by its MongoDB ObjectId.
const getProductById = async (id) => {
  return Product.findById(id);
};

// Updates a product by ID. runValidators: true ensures schema validation runs on updates.
const updateProduct = async (id, updateData) => {
  return Product.findByIdAndUpdate(id, updateData, { new: true, runValidators: true });
};

// Permanently deletes a product by ID.
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

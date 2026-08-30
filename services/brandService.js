const Brand = require('../models/Brand');

// Retrieves a paginated list of brands matching the query filter.
const getBrands = async (query = {}, page = 1, limit = 50) => {
  const skip = (Math.max(1, parseInt(page, 10) || 1) - 1) * limit;
  const [items, total] = await Promise.all([
    Brand.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Brand.countDocuments(query),
  ]);
  return { items, total };
};

// Finds a single brand by its MongoDB ObjectId.
const getBrandById = async (id) => {
  return Brand.findById(id);
};

// Creates a new brand. Auto-generates a URL-friendly slug from the name if not provided.
const createBrand = async (data) => {
  const slug = data.slug || data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return Brand.create({ ...data, slug });
};

// Updates a brand by ID. runValidators: true ensures schema validation runs on updates.
const updateBrand = async (id, data) => {
  return Brand.findByIdAndUpdate(id, data, { new: true, runValidators: true });
};

// Permanently deletes a brand by ID.
const deleteBrand = async (id) => {
  return Brand.findByIdAndDelete(id);
};

// Returns an array of brand names, optionally filtered by status.
// Used for dropdown filters in the shop and admin panels.
const getBrandNames = async (status = 'Active') => {
  const query = status ? { status } : {};
  const brands = await Brand.find(query).sort({ name: 1 });
  return brands.map((b) => b.name);
};

module.exports = {
  getBrands,
  getBrandById,
  createBrand,
  updateBrand,
  deleteBrand,
  getBrandNames,
};

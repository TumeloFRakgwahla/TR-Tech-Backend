const Brand = require('../models/Brand');

const getBrands = async (query = {}, page = 1, limit = 50) => {
  const skip = (Math.max(1, parseInt(page, 10) || 1) - 1) * limit;
  const [items, total] = await Promise.all([
    Brand.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Brand.countDocuments(query),
  ]);
  return { items, total };
};

const getBrandById = async (id) => {
  return Brand.findById(id);
};

const createBrand = async (data) => {
  const slug = data.slug || data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return Brand.create({ ...data, slug });
};

const updateBrand = async (id, data) => {
  return Brand.findByIdAndUpdate(id, data, { new: true, runValidators: true });
};

const deleteBrand = async (id) => {
  return Brand.findByIdAndDelete(id);
};

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

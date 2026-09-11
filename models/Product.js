/**
 * TR-Tech — Product Mongoose Model
 *
 * Represents a product in the e-commerce catalog.
 *
 * Key fields:
 * - name, description, category, brand: product identity and classification
 * - price: selling price in ZAR
 * - condition: New, Used, or Refurbished
 * - image / images: primary image URL and array of additional images
 * - stock: available quantity; 0 means out of stock
 * - status: Active, Inactive, or Out of Stock
 *
 * Indexes optimize common queries:
 * - category, brand, status for filter pages
 * - compound category + status for filtered listings
 * - text index on name + description for search
 */

const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Product name is required'],
    trim: true,
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  sku: {
    type: String,
    required: [true, 'SKU is required'],
    unique: true,
    trim: true,
    uppercase: true,
    maxlength: [50, 'SKU cannot exceed 50 characters']
  },
  description: {
    type: String,
    required: [true, 'Product description is required'],
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  category: {
    type: String,
    required: [true, 'Category is required'],
    trim: true,
    default: 'Other'
  },
  brand: {
    type: String,
    required: [true, 'Brand is required'],
    trim: true,
    default: 'Other'
  },
  price: {
    type: Number,
    required: [true, 'Price is required'],
    min: [0, 'Price cannot be negative']
  },
  condition: {
    type: String,
    required: [true, 'Condition is required'],
    enum: ['New', 'Used', 'Refurbished']
  },
  image: {
    type: String,
    default: 'https://placehold.co/100x100/3b82f6/white?text=TR'
  },
  images: {
    type: [{
      type: String,
    }],
    validate: {
      validator: (v) => v.length <= 20,
      message: 'A product cannot have more than 20 images',
    },
  },
  stock: {
    type: Number,
    required: [true, 'Stock quantity is required'],
    min: [0, 'Stock cannot be negative'],
    default: 0
  },
  status: {
    type: String,
    enum: ['Active', 'Inactive', 'Out of Stock'],
    default: 'Active'
  },
  originalPrice: {
    type: Number,
    min: [0, 'Original price cannot be negative']
  },
  compareAtPrice: {
    type: Number,
    min: [0, 'Compare at price cannot be negative']
  },
  rating: {
    type: Number,
    min: [0, 'Rating cannot be negative'],
    max: [5, 'Rating cannot exceed 5'],
    default: 0
  },
  reviews: {
    type: Number,
    min: [0, 'Reviews count cannot be negative'],
    default: 0
  },
  inStock: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true,
  indexes: [
    { key: { category: 1 } },
    { key: { brand: 1 } },
    { key: { status: 1 } },
    { key: { category: 1, status: 1 } },
    { key: { name: 'text', description: 'text' } }
  ]
});

module.exports = mongoose.model('Product', productSchema);

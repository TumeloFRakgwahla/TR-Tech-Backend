const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Product name is required'],
    trim: true,
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  description: {
    type: String,
    required: [true, 'Product description is required'],
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  category: {
    type: String,
    required: [true, 'Category is required'],
    enum: ['Smartphones', 'Laptops', 'Laptop Accessories', 'Mobile Accessories', 'Gaming', 'Networking', 'Printers', 'Storage Devices', 'Other'],
    default: 'Other'
  },
  brand: {
    type: String,
    required: [true, 'Brand is required'],
    enum: ['Apple', 'Samsung', 'HP', 'Dell', 'Lenovo', 'Asus', 'Huawei', 'Xiaomi', 'Sony', 'LG', 'Microsoft', 'Google', 'Other'],
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

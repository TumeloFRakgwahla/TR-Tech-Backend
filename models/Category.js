const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Category name is required'],
    trim: true,
    unique: true,
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  slug: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  icon: {
    type: String,
    default: 'MoreHorizontal',
    trim: true,
    maxlength: [50, 'Icon name cannot exceed 50 characters']
  },
  displayOrder: {
    type: Number,
    default: 0,
    index: true
  },
  status: {
    type: String,
    enum: ['Active', 'Inactive'],
    default: 'Active'
  }
}, {
  timestamps: true,
  indexes: [
    { key: { name: 1 } },
    { key: { slug: 1 } },
    { key: { status: 1 } },
    { key: { displayOrder: 1 } }
  ]
});

module.exports = mongoose.model('Category', categorySchema);

const mongoose = require('mongoose');

const brandSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Brand name is required'],
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
  status: {
    type: String,
    enum: ['Active', 'Inactive'],
    default: 'Active'
  },
  logo: {
    type: String,
    default: null
  }
}, {
  timestamps: true,
  indexes: [
    { key: { name: 1 } },
    { key: { slug: 1 } },
    { key: { status: 1 } }
  ]
});

module.exports = mongoose.model('Brand', brandSchema);

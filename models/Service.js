const mongoose = require('mongoose');

const serviceSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Service name is required'],
    trim: true,
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  description: {
    type: String,
    required: [true, 'Service description is required'],
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  category: {
    type: String,
    required: [true, 'Category is required'],
    enum: ['Phone Repair', 'Computer Repair', 'Tablet Repair', 'Other']
  },
  price: {
    type: Number,
    required: [true, 'Price is required'],
    min: [0, 'Price cannot be negative']
  },
  estimatedTime: {
    type: String,
    default: '1-2 hours'
  },
  image: {
    type: String,
    default: 'https://via.placeholder.com/100'
  },
  icon: {
    type: String,
    default: 'Wrench'
  },
  features: {
    type: [String],
    default: []
  },
  status: {
    type: String,
    enum: ['Active', 'Inactive'],
    default: 'Active'
  }
}, {
  timestamps: true,
  indexes: [
    { key: { category: 1 } },
    { key: { status: 1 } },
    { key: { category: 1, status: 1 } }
  ]
});

module.exports = mongoose.model('Service', serviceSchema);

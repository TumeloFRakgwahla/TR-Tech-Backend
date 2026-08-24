const mongoose = require('mongoose');

const addressSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  label: {
    type: String,
    enum: ['Home', 'Work', 'Other'],
    default: 'Home'
  },
  street: {
    type: String,
    required: [true, 'Street is required'],
    trim: true
  },
  city: {
    type: String,
    required: [true, 'City is required'],
    trim: true
  },
  province: {
    type: String,
    required: [true, 'Province is required'],
    trim: true
  },
  postalCode: {
    type: String,
    required: [true, 'Postal code is required'],
    trim: true
  },
  country: {
    type: String,
    required: [true, 'Country is required'],
    trim: true,
    default: 'South Africa'
  },
  isDefault: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true,
  indexes: [
    { key: { userId: 1 } },
    { key: { userId: 1, isDefault: 1 } }
  ]
});

module.exports = mongoose.model('Address', addressSchema);

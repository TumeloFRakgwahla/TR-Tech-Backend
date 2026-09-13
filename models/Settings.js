const mongoose = require('mongoose');

const businessSettingsSchema = new mongoose.Schema({
  businessName: { type: String, default: 'TR-Tech Repairs & Designs' },
  tagline: { type: String, default: 'Professional Tech Repairs & Designs' },
  email: { type: String, default: 'info@trtech.co.za' },
  phone: { type: String, default: '+27 79 100 2552' },
  whatsapp: { type: String, default: '+27 79 100 2552' },
  website: { type: String, default: 'https://www.trtech.co.za' },
  vatNumber: { type: String, default: '' },
  registrationNumber: { type: String, default: '' },
  currency: { type: String, default: 'ZAR (R)' },
  timezone: { type: String, default: 'Africa/Johannesburg' },
  address: { type: String, default: '123 Main Street, Johannesburg, South Africa' }
}, { _id: false });

const generalSettingsSchema = new mongoose.Schema({
  siteName: { type: String, default: 'TR-Tech Repairs & Designs' },
  siteEmail: { type: String, default: 'info@trtech.co.za' },
  phone: { type: String, default: '+27 79 100 2552' },
  address: { type: String, default: '123 Main Street, Johannesburg, South Africa' },
  currency: { type: String, default: 'ZAR' },
  timezone: { type: String, default: 'Africa/Johannesburg' }
}, { _id: false });

const notificationSettingsSchema = new mongoose.Schema({
  newOrderReceived: { type: Boolean, default: true },
  lowStockAlert: { type: Boolean, default: true },
  repairJobCompleted: { type: Boolean, default: true },
  paymentReceived: { type: Boolean, default: true },
  newCustomerRegistration: { type: Boolean, default: false },
  dailySummaryReport: { type: Boolean, default: false }
}, { _id: false });

const securitySettingsSchema = new mongoose.Schema({
  twoFactorAuth: { type: Boolean, default: false },
  sessionTimeout: { type: Number, default: 30 },
  ipWhitelist: { type: String, default: '' },
  loginAlerts: { type: Boolean, default: true }
}, { _id: false });

const appearanceSettingsSchema = new mongoose.Schema({
  theme: { type: String, enum: ['dark', 'light'], default: 'dark' },
  sidebarCollapsed: { type: Boolean, default: false },
  compactMode: { type: Boolean, default: false },
  language: { type: String, default: 'en' }
}, { _id: false });

const settingsSchema = new mongoose.Schema({
  business: businessSettingsSchema,
  general: generalSettingsSchema,
  notifications: notificationSettingsSchema,
  security: securitySettingsSchema,
  appearance: appearanceSettingsSchema
}, { timestamps: true });

settingsSchema.set('toJSON', { virtuals: true });
settingsSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Settings', settingsSchema);

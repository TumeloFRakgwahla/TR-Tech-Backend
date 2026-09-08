const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  business: {
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
    address: { type: String, default: '' },
  },
  general: {
    siteName: { type: String, default: 'TR-Tech Repairs & Designs' },
    siteEmail: { type: String, default: 'info@trtech.co.za' },
    phone: { type: String, default: '+27 79 100 2552' },
    address: { type: String, default: '' },
    currency: { type: String, default: 'ZAR' },
    timezone: { type: String, default: 'Africa/Johannesburg' },
  },
  notifications: {
    newOrderReceived: { type: Boolean, default: true },
    lowStockAlert: { type: Boolean, default: true },
    repairJobCompleted: { type: Boolean, default: true },
    paymentReceived: { type: Boolean, default: true },
    newCustomerRegistration: { type: Boolean, default: false },
    dailySummaryReport: { type: Boolean, default: false },
  },
  security: {
    twoFactorAuth: { type: Boolean, default: false },
    sessionTimeout: { type: Number, default: 30 },
    ipWhitelist: { type: String, default: '' },
    loginAlerts: { type: Boolean, default: true },
  },
  appearance: {
    theme: { type: String, default: 'dark', enum: ['dark', 'light'] },
    sidebarCollapsed: { type: Boolean, default: false },
    compactMode: { type: Boolean, default: false },
    language: { type: String, default: 'en' },
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('Settings', settingsSchema);

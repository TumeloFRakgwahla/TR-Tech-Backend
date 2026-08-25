const mongoose = require('mongoose');

const paymentMethodSchema = new mongoose.Schema({
  // Owner of the saved method (scoped per user — never return another user's methods).
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

  // PCI-DSS: we NEVER store the raw card number, CVV, or full PAN.
  // The client obtains a token from the payment gateway's JS SDK (Stripe/Paystack/Flutterwave)
  // using the real card data, and only that opaque token reaches this server.
  gateway: { type: String, required: true, enum: ['stripe', 'paystack', 'flutterwave', 'manual'] },
  gatewayToken: { type: String, required: true },

  // Display-only metadata (safe to store).
  brand: { type: String, trim: true },
  last4: { type: String, trim: true, maxlength: 4 },
  expMonth: { type: Number, min: 1, max: 12 },
  expYear: { type: Number },

   isDefault: { type: Boolean, default: false },
  }, {
  timestamps: true,
  indexes: [
    { key: { userId: 1 } },
    { key: { userId: 1, isDefault: 1 } }
  ]
});

module.exports = mongoose.model('PaymentMethod', paymentMethodSchema);

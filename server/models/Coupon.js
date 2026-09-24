const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },

    type: { type: String, enum: ['percent', 'fixed'], required: true },
    // percent: 1-100 (percentage off). fixed: a flat Naira amount off.
    value: { type: Number, required: true, min: 0 },

    // Optional cap on the discount a percent coupon can give (irrelevant for "fixed").
    maxDiscount: { type: Number, default: null },
    // Food subtotal must be at least this much for the code to apply.
    minOrderAmount: { type: Number, default: 0 },

    // Total number of times this code can ever be used, across all customers.
    // null = unlimited.
    usageLimit: { type: Number, default: null },
    timesUsed: { type: Number, default: 0 },
    // How many times the SAME customer may use this code.
    perUserLimit: { type: Number, default: 1 },

    expiresAt: { type: Date, default: null },
    active: { type: Boolean, default: true },

    description: { type: String, trim: true }, // shown to admins in the list, not customers
  },
  { timestamps: true }
);

module.exports = mongoose.model('Coupon', couponSchema);

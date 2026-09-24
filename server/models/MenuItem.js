const mongoose = require('mongoose');

const menuItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    images: [{ type: String }],
    category: { type: String, required: true, trim: true }, // e.g. "Always Available", "Specials", "Drinks"

    currentPrice: { type: Number, required: true },
    previousPrice: { type: Number, default: null }, // null until the price has changed at least once
    priceUpdatedAt: { type: Date, default: Date.now },

    // "always have" staple vs a rotating/limited item
    isAlwaysOnMenu: { type: Boolean, default: true },

    // Admin-picked "Chef's Special" — shown in the persuasive popup on
    // the customer dashboard whenever it's also available.
    isSpecial: { type: Boolean, default: false },

    // whether it can be ordered right now (kitchen ran out, etc.)
    isAvailable: { type: Boolean, default: true },

    tags: [{ type: String }],

    // Cached from the Review collection whenever a review is added, so
    // listing the menu doesn't need a separate aggregation query per item.
    ratingAvg: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },

    // Admin-defined extras/add-ons a customer can toggle on the item page,
    // e.g. { name: 'Kpomo', price: 300 }. Priced independently of the base item.
    extras: [
      {
        _id: false,
        name: { type: String, required: true, trim: true },
        price: { type: Number, required: true, min: 0 },
      },
    ],
  },
  { timestamps: true }
);

// Virtual: is the current price higher than the previous one?
menuItemSchema.virtual('priceIncreased').get(function () {
  if (this.previousPrice == null) return false;
  return this.currentPrice > this.previousPrice;
});

menuItemSchema.set('toJSON', { virtuals: true });
menuItemSchema.set('toObject', { virtuals: true });

/**
 * Use this instead of item.currentPrice = x directly, so previousPrice
 * and priceUpdatedAt stay correct automatically.
 */
menuItemSchema.methods.updatePrice = function (newPrice) {
  if (newPrice !== this.currentPrice) {
    this.previousPrice = this.currentPrice;
    this.currentPrice = newPrice;
    this.priceUpdatedAt = new Date();
  }
};

module.exports = mongoose.model('MenuItem', menuItemSchema);

const mongoose = require('mongoose');

// A single selected extra/add-on, snapshot at the time it was added
// (e.g. { name: 'Kpomo', price: 300, quantity: 2 }).
const cartExtraSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    price: { type: Number, required: true },
    quantity: { type: Number, required: true, min: 1, default: 1 },
  },
  { _id: false }
);

const cartItemSchema = new mongoose.Schema(
  {
    // Unique per cart LINE (not per menu item) so the same dish with two
    // different sets of extras can exist as two separate rows in the cart.
    lineId: { type: String, required: true, default: () => new mongoose.Types.ObjectId().toString() },
    menuItem: { type: mongoose.Schema.Types.ObjectId, ref: 'MenuItem', required: true },
    quantity: { type: Number, required: true, min: 1, default: 1 },
    priceAtAdd: { type: Number, required: true }, // snapshot, so cart total doesn't silently change if price updates
    extras: [cartExtraSchema],
  },
  { _id: false }
);

const cartSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    items: [cartItemSchema],
  },
  { timestamps: true }
);

module.exports = mongoose.model('Cart', cartSchema);

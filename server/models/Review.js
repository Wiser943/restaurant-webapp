const mongoose = require('mongoose');

// A customer's rating + optional comment for one menu item, tied to the
// specific completed order it came from (so we can enforce "you can only
// review something you've actually ordered and received").
const reviewSchema = new mongoose.Schema(
  {
    menuItem: { type: mongoose.Schema.Types.ObjectId, ref: 'MenuItem', required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
    userName: { type: String, required: true }, // snapshot, in case the account is later renamed/removed
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, trim: true, maxlength: 500 },
    hidden: { type: Boolean, default: false }, // admin-moderated out of public view
  },
  { timestamps: true }
);

// One review per (menu item, order) — a customer can review each dish once
// per order it appeared in, not once ever, since they might order it again
// and have a different experience.
reviewSchema.index({ menuItem: 1, order: 1, user: 1 }, { unique: true });

module.exports = mongoose.model('Review', reviewSchema);

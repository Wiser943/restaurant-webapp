const mongoose = require('mongoose');

const bannerSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    imageUrl: { type: String, required: true },
    linkTo: { type: String }, // e.g. a menu item id or an external promo link
    isActive: { type: Boolean, default: true },
    priority: { type: Number, default: 0 }, // higher shows first
    startDate: { type: Date, default: Date.now },
    endDate: { type: Date },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Banner', bannerSchema);

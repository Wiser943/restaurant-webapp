const mongoose = require('mongoose');

// Each customer has ONE ongoing support conversation with the restaurant
// (kept simple - no ticket-per-issue system). Any message in that thread can
// optionally reference an order, so the admin sees exactly which order a
// complaint is about without the customer needing to explain it.
const supportMessageSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
    orderNumber: { type: String }, // snapshot, so it still displays even if the order is ever removed

    sender: { type: String, enum: ['customer', 'admin', 'supplier'], required: true },
    senderName: { type: String, required: true }, // snapshot of the name at send time

    message: { type: String, required: true, trim: true },

    // Whether this message has been seen by the "other side" yet, used for unread badges.
    // A thread is either a customer<->admin thread or a supplier<->admin thread
    // (never both), so only the relevant one of readByCustomer/readBySupplier
    // is ever meaningfully used for a given `user` — the other stays false
    // and unused, which is harmless.
    readByAdmin: { type: Boolean, default: false },
    readByCustomer: { type: Boolean, default: false },
    readBySupplier: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model('SupportMessage', supportMessageSchema);

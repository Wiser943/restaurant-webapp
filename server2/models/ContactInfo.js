const mongoose = require('mongoose');

// Single-document collection, same pattern as PaymentInfo: there's only ever
// one active set of contact details. Admin edits it, everyone (including
// guests) can read it - shown on the support page as a fallback to chat.
const contactInfoSchema = new mongoose.Schema(
  {
    phone: { type: String, default: '' },
    whatsapp: { type: String, default: '' },
    email: { type: String, default: '' },
    address: { type: String, default: '' },
    hours: { type: String, default: '' }, // e.g. "Mon–Sat, 9am – 9pm"
  },
  { timestamps: true }
);

module.exports = mongoose.model('ContactInfo', contactInfoSchema);

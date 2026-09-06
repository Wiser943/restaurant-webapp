const mongoose = require('mongoose');

// Single-document collection: there's only ever one active set of bank
// details. Admin edits it, everyone (including guests) can read it.
const paymentInfoSchema = new mongoose.Schema(
  {
    bankName: { type: String, required: true },
    accountNumber: { type: String, required: true },
    accountName: { type: String, required: true },
    instructions: { type: String, default: 'Transfer the exact order total, then submit your order with your transfer reference or the name it was sent under.' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('PaymentInfo', paymentInfoSchema);

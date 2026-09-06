const mongoose = require('mongoose');

// One document per (user, browser/device). A user can have several - e.g.
// phone + laptop both subscribed - so we key on the push endpoint itself
// (it's unique per browser installation) rather than per user.
const pushSubscriptionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    role: { type: String, enum: ['customer', 'admin', 'supplier'], required: true }, // snapshot at subscribe time

    endpoint: { type: String, required: true, unique: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },

    userAgent: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model('PushSubscription', pushSubscriptionSchema);

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['customer', 'admin', 'supplier'], default: 'customer' },
    isActive: { type: Boolean, default: true },
    avatarUrl: { type: String, default: '' },
    addresses: [
      {
        label: { type: String, trim: true, default: 'Home' },
        address: { type: String, trim: true, required: true },
        isDefault: { type: Boolean, default: false },
      },
    ],
    favorites: [{ type: mongoose.Schema.Types.ObjectId, ref: 'MenuItem' }],

    // Push notification preferences - both default on (opt-out, not opt-in),
    // matching what people expect from an order-tracking app.
    notifyOrderUpdates: { type: Boolean, default: true },
    notifyPromotions: { type: Boolean, default: true },
  },
  { timestamps: true }
);

userSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.passwordHash);
};

userSchema.statics.hashPassword = function (plain) {
  return bcrypt.hash(plain, 10);
};

module.exports = mongoose.model('User', userSchema);

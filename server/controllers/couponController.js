const Coupon = require('../models/Coupon');
const Order = require('../models/Order');

// Shared discount math, used both by the /validate preview endpoint at
// checkout and (again, independently) by placeOrder — the client-side
// number is only ever a preview, never trusted for the actual charge.
function computeDiscount(coupon, subtotal) {
  let discount = coupon.type === 'percent' ? (subtotal * coupon.value) / 100 : coupon.value;
  if (coupon.maxDiscount != null) discount = Math.min(discount, coupon.maxDiscount);
  discount = Math.min(discount, subtotal); // never discount below ₦0
  return Math.round(discount);
}

// Looks up a code and checks every rule EXCEPT per-user usage (which needs
// a userId). Throws a plain Error with a customer-facing message on failure.
async function findValidCoupon(rawCode, subtotal) {
  const code = (rawCode || '').trim().toUpperCase();
  if (!code) throw new Error('Please enter a promo code.');

  const coupon = await Coupon.findOne({ code });
  if (!coupon || !coupon.active) throw new Error('That promo code is not valid.');
  if (coupon.expiresAt && coupon.expiresAt < new Date()) throw new Error('That promo code has expired.');
  if (coupon.usageLimit != null && coupon.timesUsed >= coupon.usageLimit) {
    throw new Error('That promo code has reached its usage limit.');
  }
  if (subtotal < coupon.minOrderAmount) {
    throw new Error(`This code needs a minimum order of ${new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(coupon.minOrderAmount)}.`);
  }
  return coupon;
}

// Exported so orderController can re-validate + apply at the moment an
// order is actually placed (see placeOrder in orderController.js).
async function validateCouponForUser({ code, subtotal, userId }) {
  const coupon = await findValidCoupon(code, subtotal);

  if (coupon.perUserLimit != null) {
    const usedByUser = await Order.countDocuments({
      user: userId,
      couponCode: coupon.code,
      orderStatus: { $ne: 'cancelled' },
    });
    if (usedByUser >= coupon.perUserLimit) {
      throw new Error("You've already used this promo code.");
    }
  }

  const discount = computeDiscount(coupon, subtotal);
  return { coupon, discount };
}

exports.computeDiscount = computeDiscount;
exports.validateCouponForUser = validateCouponForUser;

// POST /api/coupons/validate  { code, subtotal }  (logged in)
// Preview-only: tells the checkout page what the discount WOULD be. The
// real application happens again, server-side, inside placeOrder.
exports.validateCoupon = async (req, res, next) => {
  try {
    const { code, subtotal } = req.body;
    const { coupon, discount } = await validateCouponForUser({
      code,
      subtotal: Number(subtotal) || 0,
      userId: req.user._id,
    });
    res.json({
      valid: true,
      discount,
      coupon: { code: coupon.code, type: coupon.type, value: coupon.value },
    });
  } catch (err) {
    res.status(400).json({ valid: false, message: err.message });
  }
};

// --- Admin CRUD ---

// GET /api/admin/coupons
exports.getAllCoupons = async (req, res, next) => {
  try {
    const coupons = await Coupon.find().sort({ createdAt: -1 });
    res.json({ coupons });
  } catch (err) {
    next(err);
  }
};

// POST /api/admin/coupons
exports.createCoupon = async (req, res, next) => {
  try {
    const { code, type, value, maxDiscount, minOrderAmount, usageLimit, perUserLimit, expiresAt, description } = req.body;
    if (!code || !type || value == null) {
      return res.status(400).json({ message: 'Code, type, and value are required.' });
    }
    const coupon = await Coupon.create({
      code: code.trim().toUpperCase(),
      type,
      value,
      maxDiscount: maxDiscount || null,
      minOrderAmount: minOrderAmount || 0,
      usageLimit: usageLimit || null,
      perUserLimit: perUserLimit || 1,
      expiresAt: expiresAt || null,
      description,
    });
    res.status(201).json({ coupon });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: 'A coupon with that code already exists.' });
    next(err);
  }
};

// PATCH /api/admin/coupons/:id
exports.updateCoupon = async (req, res, next) => {
  try {
    const coupon = await Coupon.findById(req.params.id);
    if (!coupon) return res.status(404).json({ message: 'Coupon not found.' });

    const { type, value, maxDiscount, minOrderAmount, usageLimit, perUserLimit, expiresAt, active, description } = req.body;
    if (type !== undefined) coupon.type = type;
    if (value !== undefined) coupon.value = value;
    if (maxDiscount !== undefined) coupon.maxDiscount = maxDiscount || null;
    if (minOrderAmount !== undefined) coupon.minOrderAmount = minOrderAmount || 0;
    if (usageLimit !== undefined) coupon.usageLimit = usageLimit || null;
    if (perUserLimit !== undefined) coupon.perUserLimit = perUserLimit || 1;
    if (expiresAt !== undefined) coupon.expiresAt = expiresAt || null;
    if (active !== undefined) coupon.active = active;
    if (description !== undefined) coupon.description = description;

    await coupon.save();
    res.json({ coupon });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/admin/coupons/:id
exports.deleteCoupon = async (req, res, next) => {
  try {
    const coupon = await Coupon.findByIdAndDelete(req.params.id);
    if (!coupon) return res.status(404).json({ message: 'Coupon not found.' });
    res.json({ message: 'Coupon deleted.' });
  } catch (err) {
    next(err);
  }
};

const express = require('express');
const router = express.Router();
const { validateCoupon, getBestCoupon } = require('../controllers/couponController');
const { protect } = require('../middleware/auth');

// Logged in - previews the discount a code would give at checkout.
// Admin management of coupons themselves lives under /api/admin/coupons.
router.post('/validate', protect, validateCoupon);
router.get('/best', protect, getBestCoupon);

module.exports = router;

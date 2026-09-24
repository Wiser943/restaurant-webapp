const express = require('express');
const router = express.Router();
const { validateCoupon } = require('../controllers/couponController');
const { protect } = require('../middleware/auth');

// Logged in - previews the discount a code would give at checkout.
// Admin management of coupons themselves lives under /api/admin/coupons.
router.post('/validate', protect, validateCoupon);

module.exports = router;

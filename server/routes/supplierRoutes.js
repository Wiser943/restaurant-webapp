const express = require('express');
const router = express.Router();
const { protect, supplierOnly } = require('../middleware/auth');
const {
  getMyOrders,
  startDelivery,
  markDelivered,
  reportIssue,
} = require('../controllers/supplierController');
const { getMySupplierMessages, sendSupplierMessage } = require('../controllers/supportController');

router.use(protect, supplierOnly);

router.get('/orders', getMyOrders);
router.patch('/orders/:id/start', startDelivery);
router.patch('/orders/:id/deliver', markDelivered);
router.patch('/orders/:id/issue', reportIssue);

// Rider's own support chat with admin (account/payout questions etc.) —
// distinct from reportIssue() above, which drops a note into a specific
// CUSTOMER's thread about a specific order.
router.get('/support', getMySupplierMessages);
router.post('/support', sendSupplierMessage);

module.exports = router;

const express = require('express');
const router = express.Router();
const { protect, supplierOnly } = require('../middleware/auth');
const {
  getMyOrders,
  startDelivery,
  markDelivered,
  reportIssue,
} = require('../controllers/supplierController');

router.use(protect, supplierOnly);

router.get('/orders', getMyOrders);
router.patch('/orders/:id/start', startDelivery);
router.patch('/orders/:id/deliver', markDelivered);
router.patch('/orders/:id/issue', reportIssue);

module.exports = router;

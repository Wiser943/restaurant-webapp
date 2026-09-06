const express = require('express');
const router = express.Router();
const { protect, adminOnly } = require('../middleware/auth');
const {
  getAllOrders,
  approvePayment,
  rejectPayment,
  updateOrderStatus,
  adjustOrderPrice,
  getSuppliers,
  createSupplier,
  assignSupplier,
  dispatchOrder,
  getMarketplacePayout,
} = require('../controllers/adminController');
const { createBanner, updateBanner, deleteBanner } = require('../controllers/bannerController');
const { updatePaymentInfo } = require('../controllers/paymentInfoController');
const { updateContactInfo } = require('../controllers/contactInfoController');
const {
  getConversations,
  getConversationMessages,
  adminSendMessage,
} = require('../controllers/supportController');

router.use(protect, adminOnly); // everything below requires an admin session

// Order review / payment approval
router.get('/orders', getAllOrders);
router.patch('/orders/:id/approve', approvePayment);
router.patch('/orders/:id/reject', rejectPayment);
router.patch('/orders/:id/status', updateOrderStatus);
router.patch('/orders/:id/adjust-price', adjustOrderPrice);
router.patch('/orders/:id/assign', assignSupplier);
router.patch('/orders/:id/dispatch', dispatchOrder);

// Delivery staff (supplier) accounts
router.get('/suppliers', getSuppliers);
router.post('/suppliers', createSupplier);

// Banner/ad management
router.post('/banners', createBanner);
router.put('/banners/:id', updateBanner);
router.delete('/banners/:id', deleteBanner);

// Bank account details shown to customers at checkout
router.put('/payment-info', updatePaymentInfo);

// Contact details (phone/WhatsApp/email) shown to customers
router.put('/contact-info', updateContactInfo);

// Support chat — GET /admin/support accepts ?role=customer|supplier to
// switch between the two inbox tabs (see supportController.getConversations).
router.get('/support', getConversations);
router.get('/support/:userId', getConversationMessages);
router.post('/support/:userId', adminSendMessage);

// Marketplace bookkeeping (Section 4 helper)
router.post('/marketplace/payout', getMarketplacePayout);

module.exports = router;

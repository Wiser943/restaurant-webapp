const express = require('express');
const router = express.Router();
const { placeOrder, getMyOrders, getOrderById, getOrderByNumber, submitPaymentProof, cancelOrder } = require('../controllers/orderController');
const { protect } = require('../middleware/auth');

router.use(protect); // must be logged in to order

router.post('/', placeOrder);
router.get('/', getMyOrders);
router.get('/lookup/:orderNumber', getOrderByNumber); // before /:id so "lookup" isn't treated as an id
router.get('/:id', getOrderById);
router.post('/:id/payment-proof', submitPaymentProof);
router.post('/:id/cancel', cancelOrder);

module.exports = router;

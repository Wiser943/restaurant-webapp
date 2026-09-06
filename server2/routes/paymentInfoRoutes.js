const express = require('express');
const router = express.Router();
const { getPaymentInfo } = require('../controllers/paymentInfoController');

router.get('/', getPaymentInfo);

module.exports = router;

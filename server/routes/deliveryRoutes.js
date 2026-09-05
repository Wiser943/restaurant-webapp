const express = require('express');
const router = express.Router();
const { getQuote } = require('../controllers/deliveryController');
const { protect } = require('../middleware/auth');

router.use(protect); // must be logged in - matches the rest of checkout

router.post('/quote', getQuote);

module.exports = router;

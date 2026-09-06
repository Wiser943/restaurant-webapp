const express = require('express');
const router = express.Router();
const { getPublicKey, subscribe, unsubscribe } = require('../controllers/pushController');
const { protect } = require('../middleware/auth');

router.get('/public-key', getPublicKey); // no auth - needed before the client can subscribe

router.use(protect); // subscribing has to be tied to a logged-in user/role
router.post('/subscribe', subscribe);
router.post('/unsubscribe', unsubscribe);

module.exports = router;

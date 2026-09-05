const express = require('express');
const router = express.Router();
const { getMyMessages, sendMessage } = require('../controllers/supportController');
const { protect } = require('../middleware/auth');

router.use(protect); // must be logged in to use support chat

router.get('/', getMyMessages);
router.post('/', sendMessage);

module.exports = router;

const express = require('express');
const router = express.Router();
const { getMenuItemReviews, canReview, createReview } = require('../controllers/reviewController');
const { protect } = require('../middleware/auth');

// Public - anyone browsing an item can see its reviews
router.get('/menu/:menuItemId', getMenuItemReviews);

// Logged in - must have actually ordered (and received) the item
router.get('/can-review/:menuItemId', protect, canReview);
router.post('/', protect, createReview);

module.exports = router;

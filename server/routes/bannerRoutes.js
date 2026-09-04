const express = require('express');
const router = express.Router();
const { getActiveBanners } = require('../controllers/bannerController');

// Public - ads/banners visible to everyone, logged in or not
router.get('/', getActiveBanners);

module.exports = router;

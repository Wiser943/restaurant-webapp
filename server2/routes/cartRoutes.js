const express = require('express');
const router = express.Router();
const {
  getCart,
  addToCart,
  updateCartItem,
  removeFromCart,
  addFavorite,
  removeFavorite,
} = require('../controllers/cartController');
const { protect } = require('../middleware/auth');

router.use(protect); // everything below requires login

router.get('/', getCart);
router.post('/', addToCart);
router.put('/:lineId', updateCartItem);
router.delete('/:lineId', removeFromCart);

router.post('/favorites/:menuItemId', addFavorite);
router.delete('/favorites/:menuItemId', removeFavorite);

module.exports = router;

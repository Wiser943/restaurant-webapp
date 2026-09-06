const express = require('express');
const router = express.Router();
const {
  getMenu,
  getMenuItem,
  createMenuItem,
  updateMenuItem,
  toggleAvailability,
  deleteMenuItem,
} = require('../controllers/menuController');
const { protect, adminOnly } = require('../middleware/auth');

// Public - anyone can view the menu, prices, and availability without logging in
router.get('/', getMenu);
router.get('/:id', getMenuItem);

// Admin only - managing the menu
router.post('/', protect, adminOnly, createMenuItem);
router.put('/:id', protect, adminOnly, updateMenuItem);
router.patch('/:id/availability', protect, adminOnly, toggleAvailability);
router.delete('/:id', protect, adminOnly, deleteMenuItem);

module.exports = router;

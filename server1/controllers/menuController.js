const MenuItem = require('../models/MenuItem');
const { getIO } = require('../config/socket');

// GET /api/menu  (public - no auth required)
// Returns everything needed to render the menu for guests AND logged-in users:
// current price, previous price (so the UI can show a "price increased" badge),
// availability ("ready for order"), and the always-on-menu staples.
exports.getMenu = async (req, res, next) => {
  try {
    const { category, available } = req.query;
    const filter = {};
    if (category) filter.category = category;
    if (available === 'true') filter.isAvailable = true;

    const items = await MenuItem.find(filter).sort({ isAlwaysOnMenu: -1, category: 1 });
    res.json({ items });
  } catch (err) {
    next(err);
  }
};

// GET /api/menu/:id (public)
exports.getMenuItem = async (req, res, next) => {
  try {
    const item = await MenuItem.findById(req.params.id);
    if (!item) return res.status(404).json({ message: 'Menu item not found.' });
    res.json({ item });
  } catch (err) {
    next(err);
  }
};

// POST /api/menu (admin only)
exports.createMenuItem = async (req, res, next) => {
  try {
    const item = await MenuItem.create(req.body);
    getIO().emit('menu:created', item);
    res.status(201).json({ item });
  } catch (err) {
    next(err);
  }
};

// PUT /api/menu/:id (admin only)
// Handles price changes specially so previousPrice/priceUpdatedAt stay accurate.
exports.updateMenuItem = async (req, res, next) => {
  try {
    const item = await MenuItem.findById(req.params.id);
    if (!item) return res.status(404).json({ message: 'Menu item not found.' });

    const { currentPrice, ...rest } = req.body;
    Object.assign(item, rest);

    if (currentPrice !== undefined) {
      item.updatePrice(currentPrice);
    }

    await item.save();

    // Broadcast to every connected client (logged in or not) in real time
    getIO().emit('menu:updated', item);

    res.json({ item });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/menu/:id/availability (admin only) - quick toggle for "ready for order"
exports.toggleAvailability = async (req, res, next) => {
  try {
    const item = await MenuItem.findById(req.params.id);
    if (!item) return res.status(404).json({ message: 'Menu item not found.' });

    item.isAvailable = req.body.isAvailable ?? !item.isAvailable;
    await item.save();

    getIO().emit('menu:updated', item);
    res.json({ item });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/menu/:id (admin only)
exports.deleteMenuItem = async (req, res, next) => {
  try {
    const item = await MenuItem.findByIdAndDelete(req.params.id);
    if (!item) return res.status(404).json({ message: 'Menu item not found.' });

    getIO().emit('menu:deleted', { id: item._id });
    res.json({ message: 'Menu item deleted.' });
  } catch (err) {
    next(err);
  }
};

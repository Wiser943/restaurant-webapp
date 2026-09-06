const Cart = require('../models/Cart');
const MenuItem = require('../models/MenuItem');

// Builds a stable signature for a set of extras so we can tell whether two
// cart lines for the same menu item are actually "the same" (same add-ons)
// or need to stay as separate lines.
function extrasSignature(extras = []) {
  return JSON.stringify(
    [...extras]
      .map((e) => ({ name: e.name, price: e.price, quantity: e.quantity }))
      .sort((a, b) => a.name.localeCompare(b.name))
  );
}

function sanitizeExtras(rawExtras, menuItem) {
  if (!Array.isArray(rawExtras) || !rawExtras.length) return [];
  const available = new Map((menuItem.extras || []).map((e) => [e.name, e.price]));
  return rawExtras
    .filter((e) => e && e.name && available.has(e.name))
    .map((e) => ({
      name: e.name,
      price: available.get(e.name),
      quantity: Math.max(1, Number(e.quantity) || 1),
    }));
}

// GET /api/cart
exports.getCart = async (req, res, next) => {
  try {
    let cart = await Cart.findOne({ user: req.user._id }).populate('items.menuItem');
    if (!cart) cart = await Cart.create({ user: req.user._id, items: [] });
    res.json({ cart });
  } catch (err) {
    next(err);
  }
};

// POST /api/cart  { menuItemId, quantity, extras? }
exports.addToCart = async (req, res, next) => {
  try {
    const { menuItemId, quantity = 1, extras } = req.body;
    const menuItem = await MenuItem.findById(menuItemId);

    if (!menuItem) return res.status(404).json({ message: 'Menu item not found.' });
    if (!menuItem.isAvailable) {
      return res.status(400).json({ message: 'This item is not currently available.' });
    }

    const cleanExtras = sanitizeExtras(extras, menuItem);
    const sig = extrasSignature(cleanExtras);

    let cart = await Cart.findOne({ user: req.user._id });
    if (!cart) cart = new Cart({ user: req.user._id, items: [] });

    const existing = cart.items.find(
      (i) => i.menuItem.toString() === menuItemId && extrasSignature(i.extras) === sig
    );
    if (existing) {
      existing.quantity += quantity;
    } else {
      cart.items.push({
        menuItem: menuItemId,
        quantity,
        priceAtAdd: menuItem.currentPrice,
        extras: cleanExtras,
      });
    }

    await cart.save();
    await cart.populate('items.menuItem');
    res.json({ cart });
  } catch (err) {
    next(err);
  }
};

// PUT /api/cart/:lineId  { quantity }
exports.updateCartItem = async (req, res, next) => {
  try {
    const { quantity } = req.body;
    const cart = await Cart.findOne({ user: req.user._id });
    if (!cart) return res.status(404).json({ message: 'Cart not found.' });

    const item = cart.items.find((i) => i.lineId === req.params.lineId);
    if (!item) return res.status(404).json({ message: 'Item not in cart.' });

    if (quantity <= 0) {
      cart.items = cart.items.filter((i) => i.lineId !== req.params.lineId);
    } else {
      item.quantity = quantity;
    }

    await cart.save();
    await cart.populate('items.menuItem');
    res.json({ cart });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/cart/:lineId
exports.removeFromCart = async (req, res, next) => {
  try {
    const cart = await Cart.findOne({ user: req.user._id });
    if (!cart) return res.status(404).json({ message: 'Cart not found.' });

    cart.items = cart.items.filter((i) => i.lineId !== req.params.lineId);
    await cart.save();
    await cart.populate('items.menuItem');
    res.json({ cart });
  } catch (err) {
    next(err);
  }
};

// --- Favorites (kept simple, stored directly on User) ---

// POST /api/cart/favorites/:menuItemId
exports.addFavorite = async (req, res, next) => {
  try {
    const user = req.user;
    if (!user.favorites.includes(req.params.menuItemId)) {
      user.favorites.push(req.params.menuItemId);
      await user.save();
    }
    res.json({ favorites: user.favorites });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/cart/favorites/:menuItemId
exports.removeFavorite = async (req, res, next) => {
  try {
    const user = req.user;
    user.favorites = user.favorites.filter((id) => id.toString() !== req.params.menuItemId);
    await user.save();
    res.json({ favorites: user.favorites });
  } catch (err) {
    next(err);
  }
};

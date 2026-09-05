const Order = require('../models/Order');
const Cart = require('../models/Cart');
const MenuItem = require('../models/MenuItem');
const { getIO } = require('../config/socket');
const generateOrderNumber = require('../utils/generateOrderNumber');

// Generates an orderNumber and retries on the (very unlikely) chance of a
// collision, since it's a short code rather than a full UUID.
async function uniqueOrderNumber() {
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = generateOrderNumber();
    const exists = await Order.exists({ orderNumber: candidate });
    if (!exists) return candidate;
  }
  // Extremely unlikely fallback - append extra randomness.
  return `${generateOrderNumber()}${Date.now().toString(36).toUpperCase()}`;
}

// POST /api/orders
// Creates an order from the user's current cart (or a directly-passed item list).
// Always starts as paymentStatus: "pending" — the frontend must NOT show
// "order successful" until it receives an order:statusChanged event (or polls)
// showing paymentStatus === "approved".
exports.placeOrder = async (req, res, next) => {
  try {
    const { deliveryAddress, notes, paymentReference, paymentMethod } = req.body;

    const cart = await Cart.findOne({ user: req.user._id }).populate('items.menuItem');
    if (!cart || cart.items.length === 0) {
      return res.status(400).json({ message: 'Your cart is empty.' });
    }

    const orderItems = [];
    let totalAmount = 0;

    for (const cartItem of cart.items) {
      const menuItem = cartItem.menuItem;
      if (!menuItem || !menuItem.isAvailable) {
        return res.status(400).json({ message: `${menuItem?.name || 'An item'} is no longer available.` });
      }
      // Use the CURRENT price at checkout time, not the stale priceAtAdd,
      // so the customer is always charged the live price.
      const extras = (cartItem.extras || []).map((e) => ({
        name: e.name,
        price: e.price,
        quantity: e.quantity,
      }));
      const extrasTotal = extras.reduce((s, e) => s + e.price * e.quantity, 0);

      orderItems.push({
        menuItem: menuItem._id,
        name: menuItem.name,
        price: menuItem.currentPrice,
        quantity: cartItem.quantity,
        extras,
      });
      totalAmount += menuItem.currentPrice * cartItem.quantity + extrasTotal;
    }

    const orderNumber = await uniqueOrderNumber();

    const order = await Order.create({
      orderNumber,
      user: req.user._id,
      items: orderItems,
      totalAmount,
      originalTotalAmount: totalAmount,
      paymentReference,
      paymentMethod,
      deliveryAddress,
      notes,
      paymentStatus: 'pending',
      orderStatus: 'pending',
    });

    // Clear the cart now that the order has been placed
    cart.items = [];
    await cart.save();

    // Notify admins in real time that a new order needs review
    getIO().to('admins').emit('order:new', order);

    res.status(201).json({ order, message: 'Order submitted. Awaiting payment approval.' });
  } catch (err) {
    next(err);
  }
};

// GET /api/orders  (the logged-in user's own orders)
exports.getMyOrders = async (req, res, next) => {
  try {
    const orders = await Order.find({ user: req.user._id }).sort({ createdAt: -1 });
    res.json({ orders });
  } catch (err) {
    next(err);
  }
};

// GET /api/orders/lookup/:orderNumber
// Lets a customer (or admin) pull up an order by its short order number,
// e.g. when referencing it in support chat instead of a Mongo _id.
exports.getOrderByNumber = async (req, res, next) => {
  try {
    const order = await Order.findOne({ orderNumber: req.params.orderNumber.trim().toUpperCase() });
    if (!order) return res.status(404).json({ message: 'No order found with that order number.' });

    const isOwner = order.user.toString() === req.user._id.toString();
    if (!isOwner && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to view this order.' });
    }

    res.json({ order });
  } catch (err) {
    next(err);
  }
};

// GET /api/orders/:id (must belong to the requesting user, unless admin)
exports.getOrderById = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found.' });

    const isOwner = order.user.toString() === req.user._id.toString();
    if (!isOwner && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to view this order.' });
    }

    res.json({ order });
  } catch (err) {
    next(err);
  }
};

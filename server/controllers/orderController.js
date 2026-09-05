const Order = require('../models/Order');
const Cart = require('../models/Cart');
const MenuItem = require('../models/MenuItem');
const { getIO } = require('../config/socket');
const generateOrderNumber = require('../utils/generateOrderNumber');
const { resolveDelivery } = require('./deliveryController');
const { normalizeCoords } = require('../utils/geo');
const { sendPushToRole } = require('../utils/sendPush');

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
    const { deliveryAddress, notes, paymentReference, paymentMethod, customerLocation } = req.body;

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

    // --- Delivery routing (Dual-Delivery Proximity Logic) ---
    // Recomputed here from scratch, server-side, using the food subtotal
    // above — NEVER trust a fee/mode the client might have sent from an
    // earlier /api/delivery/quote call, since that's just a preview. This is
    // the one place a delivery fee actually gets attached to a real order.
    let delivery = { mode: 'IN_HOUSE', fee: 0 };
    if (customerLocation) {
      try {
        const { lat, lng } = normalizeCoords(customerLocation);
        const resolved = await resolveDelivery({
          customerLat: lat,
          customerLng: lng,
          orderSubtotal: totalAmount,
        });
        delivery = {
          mode: resolved.mode,
          customerLocation: { lat, lng },
          distanceKm: resolved.distanceKm,
          fee: resolved.fee,
          etaMinutes: resolved.etaMinutes,
          etaAt: resolved.etaAt,
          chowdeck: resolved.mode === 'CHOWDECK_RELAY' ? { feeId: resolved.chowdeck.feeId } : undefined,
        };
      } catch (err) {
        // Don't let a flaky Chowdeck quote or bad coordinates block checkout
        // entirely — fall back to in-house/₦0 and let an admin sort out
        // delivery manually, rather than losing the order altogether.
        console.error('[placeOrder] delivery resolution failed, falling back to IN_HOUSE:', err.message);
      }
    }
    // The delivery fee (₦0 for in-house, Chowdeck's exact fare for relay) is
    // added straight onto what the customer is asked to pay.
    totalAmount += delivery.fee;

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
      delivery,
      paymentStatus: 'pending',
      orderStatus: 'pending',
    });

    // Clear the cart now that the order has been placed
    cart.items = [];
    await cart.save();

    // Notify admins in real time that a new order needs review — both via
    // the socket (for an open dashboard tab) and a real push notification
    // (in case no admin currently has the tab open).
    getIO().to('admins').emit('order:new', order);
    sendPushToRole('admin', {
      title: 'New order received',
      body: `Order #${order.orderNumber} — ${currencyLabel(totalAmount)}`,
      url: `/admin/index.html`,
      tag: 'new-order',
    }).catch((err) => console.error('[placeOrder] push failed:', err.message));

    res.status(201).json({ order, message: 'Order submitted. Awaiting payment approval.' });
  } catch (err) {
    next(err);
  }
};

// Tiny local formatter so push payloads read like "₦4,500" without pulling
// in a frontend-only helper.
function currencyLabel(amount) {
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(
    amount
  );
}

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

const Order = require('../models/Order');
const SupportMessage = require('../models/SupportMessage');
const User = require('../models/User');
const { getIO } = require('../config/socket');
const chowdeck = require('../services/chowdeckClient');
const { sendPushToUser } = require('../utils/sendPush');
const { calculateVendorPayout, VALID_TIERS } = require('../utils/vendorPayout');

// POST /api/admin/marketplace/payout  { subtotal, tier, chowsmart? }
// Bookkeeping helper (Section 4) — NOT tied to the in-house/Relay checkout
// flow above. Use this to reconcile what Chowdeck should be paying out per
// order when it comes through the main Chowdeck Vendor Dashboard/marketplace
// rather than through your own site.
exports.getMarketplacePayout = (req, res) => {
  try {
    const { subtotal, tier, chowsmart } = req.body;
    const result = calculateVendorPayout(subtotal, tier, { chowsmart: Boolean(chowsmart) });
    res.json({ payout: result });
  } catch (err) {
    res.status(400).json({ message: err.message, validTiers: VALID_TIERS });
  }
};

// GET /api/admin/orders?status=pending&orderNumber=MT-260902-8F3K1A
exports.getAllOrders = async (req, res, next) => {
  try {
    const { paymentStatus, orderStatus, orderNumber } = req.query;
    const filter = {};
    if (paymentStatus) filter.paymentStatus = paymentStatus;
    if (orderStatus) filter.orderStatus = orderStatus;
    // Partial, case-insensitive match so the admin can paste in whatever the
    // customer sent them (with or without the "MT-" prefix, wrong case, etc.)
    if (orderNumber) filter.orderNumber = { $regex: orderNumber.trim(), $options: 'i' };

    const orders = await Order.find(filter)
      .populate('user', 'name email phone')
      .populate('assignedSupplier', 'name phone')
      .sort({ createdAt: -1 });

    // Flatten a convenience field the admin UI can read directly.
    const withNames = orders.map((o) => {
      const obj = o.toObject();
      obj.assignedSupplierName = o.assignedSupplier?.name || null;
      return obj;
    });

    res.json({ orders: withNames });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/admin/orders/:id/approve
// This is the ONLY action that flips paymentStatus to "approved" -
// that's what the customer's app treats as "order successful".
exports.approvePayment = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id).populate('user', 'name phone email');
    if (!order) return res.status(404).json({ message: 'Order not found.' });

    order.paymentStatus = 'approved';
    order.orderStatus = 'confirmed';
    order.reviewedBy = req.user._id;
    order.reviewedAt = new Date();

    // --- Scenario B trigger point ---
    // Per spec: only once the customer has actually paid do we summon the
    // Chowdeck rider. Everything before now was just a quote (a fee_id that
    // expires) — this is the one place Create Delivery gets called.
    if (order.delivery?.mode === 'CHOWDECK_RELAY' && order.delivery?.chowdeck?.feeId && !order.delivery.chowdeck.deliveryReference) {
      try {
        const deliveryReference = `MT-${order.orderNumber}`; // must be unique per Chowdeck's docs
        const result = await chowdeck.createDelivery({
          feeId: order.delivery.chowdeck.feeId,
          reference: deliveryReference,
          itemType: 'Food',
          customerDeliveryNote: order.notes || undefined,
          estimatedOrderAmount: order.totalAmount,
          destination: {
            name: order.user.name,
            phone: order.user.phone || '',
            email: order.user.email,
          },
        });

        order.delivery.chowdeck.deliveryReference = result.deliveryReference || deliveryReference;
        order.delivery.chowdeck.deliveryId = result.deliveryId;
        order.delivery.chowdeck.status = result.status;
        order.delivery.chowdeck.friendlyStatus = 'A Chowdeck rider has been requested for this order.';
      } catch (err) {
        // Payment approval should still succeed even if Chowdeck is briefly
        // down — the admin sees the failure and can retry, rather than the
        // whole approval failing because of a third-party outage.
        console.error(`[approvePayment] Chowdeck Create Delivery failed for ${order.orderNumber}:`, err.message);
        order.delivery.chowdeck.friendlyStatus = 'Could not reach Chowdeck to request a rider — retry from the order.';
      }
    }

    await order.save();

    // Push the update straight to the customer who placed it
    getIO().to(`user:${order.user._id}`).emit('order:statusChanged', order);
    getIO().to('admins').emit('order:updated', order);
    sendPushToUser(order.user._id, {
      title: `Order #${order.orderNumber} confirmed`,
      body: 'Your payment was approved — your order is being prepared.',
      url: `/order.html?id=${order._id}`,
      tag: `order-${order._id}`,
    }).catch((err) => console.error('[approvePayment] push failed:', err.message));

    res.json({ order });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/admin/orders/:id/reject  { reason }
exports.rejectPayment = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found.' });

    order.paymentStatus = 'rejected';
    order.orderStatus = 'cancelled';
    order.reviewedBy = req.user._id;
    order.reviewedAt = new Date();
    order.rejectionReason = req.body.reason || 'Payment could not be verified.';
    await order.save();

    getIO().to(`user:${order.user}`).emit('order:statusChanged', order);
    getIO().to('admins').emit('order:updated', order);
    sendPushToUser(order.user, {
      title: `Order #${order.orderNumber}`,
      body: 'We could not confirm your payment — open the app for details.',
      url: `/order.html?id=${order._id}`,
      tag: `order-${order._id}`,
    }).catch((err) => console.error('[rejectPayment] push failed:', err.message));

    res.json({ order });
  } catch (err) {
    next(err);
  }
};
// For moving an already-approved order through preparing -> completed, etc.
exports.updateOrderStatus = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found.' });

    order.orderStatus = req.body.orderStatus;
    await order.save();

    getIO().to(`user:${order.user}`).emit('order:statusChanged', order);
    res.json({ order });
  } catch (err) {
    next(err);
  }
};

// GET /api/admin/suppliers - delivery staff accounts, for the assignment dropdown
exports.getSuppliers = async (req, res, next) => {
  try {
    const suppliers = await User.find({ role: 'supplier' }).select('name email phone');
    res.json({ suppliers });
  } catch (err) {
    next(err);
  }
};

// POST /api/admin/suppliers  { name, email, password, phone }
// Creates a delivery-staff login. Kept minimal — same account model as
// customers/admins, just with role: 'supplier'.
exports.createSupplier = async (req, res, next) => {
  try {
    const { name, email, password, phone } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email and password are required.' });
    }
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(409).json({ message: 'An account with this email already exists.' });

    const passwordHash = await User.hashPassword(password);
    const supplier = await User.create({ name, email, phone, passwordHash, role: 'supplier' });
    res.status(201).json({ supplier: { _id: supplier._id, name: supplier.name, email: supplier.email, phone: supplier.phone } });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/admin/orders/:id/assign  { supplierId }
// Hands the order to a delivery person without starting the delivery clock yet.
exports.assignSupplier = async (req, res, next) => {
  try {
    const { supplierId } = req.body;
    const supplier = await User.findOne({ _id: supplierId, role: 'supplier' });
    if (!supplier) return res.status(404).json({ message: 'Supplier not found.' });

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found.' });

    order.assignedSupplier = supplier._id;
    if (order.orderStatus === 'confirmed') order.orderStatus = 'preparing';
    await order.save();

    getIO().to(`user:${supplier._id}`).emit('order:assigned', order);
    getIO().to(`user:${order.user}`).emit('order:statusChanged', order);
    getIO().to('admins').emit('order:updated', order);
    sendPushToUser(supplier._id, {
      title: 'New delivery assigned',
      body: `Order #${order.orderNumber} needs pickup.`,
      url: `/supplier/index.html`,
      tag: 'new-delivery',
    }).catch((err) => console.error('[assignSupplier] push failed:', err.message));

    res.json({ order });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/admin/orders/:id/dispatch  { etaMinutes }
// Starts the delivery clock: flips status to "out_for_delivery" and stores
// an estimated arrival time the customer sees on their order page.
exports.dispatchOrder = async (req, res, next) => {
  try {
    const etaMinutes = Number(req.body.etaMinutes) || 30;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found.' });
    if (!order.assignedSupplier) {
      return res.status(400).json({ message: 'Assign a delivery rider before dispatching.' });
    }

    order.orderStatus = 'out_for_delivery';
    order.dispatchedAt = new Date();
    order.estimatedDeliveryAt = new Date(Date.now() + etaMinutes * 60 * 1000);
    await order.save();

    getIO().to(`user:${order.user}`).emit('order:statusChanged', order);
    getIO().to(`user:${order.assignedSupplier}`).emit('order:assigned', order);
    getIO().to('admins').emit('order:updated', order);

    res.json({ order });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/admin/orders/:id/adjust-price  { newTotal, reason }
// Used when the customer's checkout note changes what the order should cost
// (e.g. "extra portion of meat please" - admin reviews, then updates the
// total here). Keeps the original total for the "was X, now Y" display, and
// drops a message into the support chat so the customer sees WHY it changed.
exports.adjustOrderPrice = async (req, res, next) => {
  try {
    const { newTotal, reason } = req.body;
    const amount = Number(newTotal);
    if (!Number.isFinite(amount) || amount < 0) {
      return res.status(400).json({ message: 'newTotal must be a valid non-negative number.' });
    }

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found.' });

    if (order.originalTotalAmount == null) order.originalTotalAmount = order.totalAmount;
    order.totalAmount = amount;
    order.priceAdjustmentReason = reason || '';
    await order.save();

    getIO().to(`user:${order.user}`).emit('order:statusChanged', order);
    getIO().to('admins').emit('order:updated', order);

    // Auto-post a note in the support thread so the customer has a record
    // of why the price changed, right where they'd go to ask about it.
    const note = await SupportMessage.create({
      user: order.user,
      order: order._id,
      orderNumber: order.orderNumber,
      sender: 'admin',
      senderName: req.user.name,
      message: reason
        ? `Your order total was updated to reflect: ${reason}. New total is ${amount}.`
        : `Your order total was updated. New total is ${amount}.`,
      readByAdmin: true,
      readByCustomer: false,
    });
    getIO().to(`user:${order.user}`).emit('support:message', note);
    getIO().to('admins').emit('support:message', note);

    res.json({ order });
  } catch (err) {
    next(err);
  }
};

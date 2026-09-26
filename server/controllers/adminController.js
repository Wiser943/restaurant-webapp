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

// GET /api/admin/orders?reviewStatus=pending&paymentStatus=&orderStatus=&orderNumber=MT-260902-8F3K1A
exports.getAllOrders = async (req, res, next) => {
  try {
    const { reviewStatus, paymentStatus, orderStatus, orderNumber } = req.query;
    const filter = {};
    if (reviewStatus) filter.reviewStatus = reviewStatus;
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

// PATCH /api/admin/orders/:id/review-approve  { }
// The FIRST stamp: admin has looked at the order (and adjusted the price via
// adjustOrderPrice below, if needed) and approved it. No account number or
// "preparing" status is ever shown to the customer before this fires.
//  - bank_transfer orders move to "awaiting_payment" — the customer now sees
//    the bank details and can pay (and optionally upload a screenshot).
//  - pay_on_delivery orders (only ever offered for nearby/IN_HOUSE addresses)
//    skip the payment screen entirely and go straight to "preparing" — this
//    stamp IS the admin's required sign-off on letting them pay on arrival.
exports.reviewApproveOrder = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id).populate('user', 'name phone email');
    if (!order) return res.status(404).json({ message: 'Order not found.' });
    if (order.reviewStatus === 'approved') {
      return res.status(400).json({ message: 'This order has already been approved.' });
    }

    order.reviewStatus = 'approved';
    order.reviewedBy = req.user._id;
    order.reviewedAt = new Date();

    if (order.paymentMethod === 'pay_on_delivery') {
      order.paymentStatus = 'not_required';
      order.orderStatus = 'preparing';
    } else {
      order.paymentStatus = 'awaiting_payment';
      order.orderStatus = 'awaiting_payment';
    }

    await order.save();

    getIO().to(`user:${order.user._id}`).emit('order:statusChanged', order);
    getIO().to('admins').emit('order:updated', order);
    sendPushToUser(order.user._id, {
      title: `Order #${order.orderNumber} approved`,
      body: order.paymentMethod === 'pay_on_delivery'
        ? 'Your order was approved and is now being prepared. Pay when it arrives.'
        : 'Your order was approved — open the app to complete payment.',
      url: `/order.html?id=${order._id}`,
      tag: `order-${order._id}`,
    }, { category: 'order' }).catch((err) => console.error('[reviewApproveOrder] push failed:', err.message));

    res.json({ order });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/admin/orders/:id/approve
// The SECOND stamp, for bank_transfer orders only: confirms the money the
// customer said they sent (paymentStatus was "proof_submitted") actually
// landed. This is the ONLY action that flips paymentStatus to "approved" and
// moves the order into "preparing" for that flow.
exports.approvePayment = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id).populate('user', 'name phone email');
    if (!order) return res.status(404).json({ message: 'Order not found.' });

    order.paymentStatus = 'approved';
    order.orderStatus = 'preparing';
    order.paymentReviewedBy = req.user._id;
    order.paymentReviewedAt = new Date();

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
    }, { category: 'order' }).catch((err) => console.error('[approvePayment] push failed:', err.message));

    res.json({ order });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/admin/orders/:id/reject  { reason }
// Works at either gate: rejecting a not-yet-reviewed order (bad/impossible
// order) or rejecting a submitted payment proof that couldn't be verified.
// Either way the order is cancelled and the customer sees the reason.
exports.rejectPayment = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found.' });

    const rejectingPayment = order.reviewStatus === 'approved';
    if (rejectingPayment) {
      order.paymentStatus = 'rejected';
      order.paymentReviewedBy = req.user._id;
      order.paymentReviewedAt = new Date();
    } else {
      order.reviewStatus = 'rejected';
      order.reviewedBy = req.user._id;
      order.reviewedAt = new Date();
    }
    order.orderStatus = 'cancelled';
    order.rejectionReason = req.body.reason || (rejectingPayment ? 'Payment could not be verified.' : 'This order could not be accepted.');
    await order.save();

    getIO().to(`user:${order.user}`).emit('order:statusChanged', order);
    getIO().to('admins').emit('order:updated', order);
    sendPushToUser(order.user, {
      title: `Order #${order.orderNumber}`,
      body: 'We could not confirm your payment — open the app for details.',
      url: `/order.html?id=${order._id}`,
      tag: `order-${order._id}`,
    }, { category: 'order' }).catch((err) => console.error('[rejectPayment] push failed:', err.message));

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

    const STATUS_COPY = {
      preparing: { title: `Order #${order.orderNumber} is being prepared`, body: 'Your food is on the stove — we\'ll let you know when it\'s on its way.' },
      out_for_delivery: { title: `Order #${order.orderNumber} is out for delivery`, body: 'Your rider is on the way.' },
      completed: { title: `Order #${order.orderNumber} delivered`, body: 'Enjoy your meal! Tap to leave a review.' },
      cancelled: { title: `Order #${order.orderNumber} cancelled`, body: 'Open the app for details.' },
    };
    const copy = STATUS_COPY[order.orderStatus];
    if (copy) {
      sendPushToUser(order.user, {
        title: copy.title,
        body: copy.body,
        url: `/order.html?id=${order._id}`,
        tag: `order-${order._id}`,
      }, { category: 'order' }).catch((err) => console.error('[updateOrderStatus] push failed:', err.message));
    }

    res.json({ order });
  } catch (err) {
    next(err);
  }
};

// GET /api/admin/users?role=&search=&status=&page=&limit=&sort=
// Powers the admin "Users Management" page: stat cards + a searchable,
// paginated table covering BOTH customers and suppliers (role tells them apart).
exports.getUsersOverview = async (req, res, next) => {
  try {
    const { role, search, status, page = 1, limit = 10, sort = 'newest' } = req.query;

    const filter = { role: { $ne: 'admin' } }; // admins aren't "users" for this table
    if (role && ['customer', 'supplier'].includes(role)) filter.role = role;
    if (status === 'active') filter.isActive = true;
    if (status === 'inactive') filter.isActive = false;
    if (search && search.trim()) {
      const re = { $regex: search.trim(), $options: 'i' };
      filter.$or = [{ name: re }, { email: re }, { phone: re }];
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));

    const sortMap = {
      newest: { createdAt: -1 },
      oldest: { createdAt: 1 },
      name: { name: 1 },
    };

    const [totalMatching, users] = await Promise.all([
      User.countDocuments(filter),
      User.find(filter)
        .select('name email phone role isActive createdAt')
        .sort(sortMap[sort] || sortMap.newest)
        .skip((pageNum - 1) * pageSize)
        .limit(pageSize),
    ]);

    // Per-user order count + total spent, computed in one aggregation pass
    // rather than N queries. Only meaningful for customers, but harmless
    // (and always 0) for suppliers.
    const userIds = users.map((u) => u._id);
    const orderStats = await Order.aggregate([
      { $match: { user: { $in: userIds } } },
      {
        $group: {
          _id: '$user',
          totalOrders: { $sum: 1 },
          totalSpent: {
            // Confirmed bank-transfer payments AND approved pay-on-delivery
            // orders both count as real revenue for this customer — only
            // still-pending/rejected orders are excluded.
            $sum: { $cond: [{ $in: ['$paymentStatus', ['approved', 'not_required']] }, '$totalAmount', 0] },
          },
        },
      },
    ]);
    const statsByUser = new Map(orderStats.map((s) => [String(s._id), s]));

    const rows = users.map((u) => {
      const stats = statsByUser.get(String(u._id));
      return {
        _id: u._id,
        name: u.name,
        email: u.email,
        phone: u.phone || '',
        role: u.role,
        isActive: u.isActive !== false,
        createdAt: u.createdAt,
        totalOrders: stats?.totalOrders || 0,
        totalSpent: stats?.totalSpent || 0,
      };
    });

    // Site-wide stat cards (independent of the current search/filter/page).
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const [totalCustomers, totalSuppliers, newThisMonth, newLastMonth, totalOrdersAllTime] = await Promise.all([
      User.countDocuments({ role: 'customer' }),
      User.countDocuments({ role: 'supplier' }),
      User.countDocuments({ role: { $ne: 'admin' }, createdAt: { $gte: startOfMonth } }),
      User.countDocuments({ role: { $ne: 'admin' }, createdAt: { $gte: startOfLastMonth, $lt: startOfMonth } }),
      Order.countDocuments({}),
    ]);

    const growth = (current, previous) => {
      if (!previous) return current > 0 ? 100 : 0;
      return Math.round(((current - previous) / previous) * 1000) / 10;
    };

    res.json({
      stats: {
        totalUsers: totalCustomers + totalSuppliers,
        totalCustomers,
        totalSuppliers,
        newThisMonth,
        newThisMonthGrowthPct: growth(newThisMonth, newLastMonth),
        totalOrders: totalOrdersAllTime,
        averageOrdersPerUser: totalCustomers ? Math.round((totalOrdersAllTime / totalCustomers) * 100) / 100 : 0,
      },
      users: rows,
      pagination: {
        page: pageNum,
        limit: pageSize,
        total: totalMatching,
        totalPages: Math.max(1, Math.ceil(totalMatching / pageSize)),
      },
    });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/admin/users/:id/status  { isActive }
exports.setUserStatus = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found.' });
    if (user.role === 'admin') return res.status(400).json({ message: 'Cannot change status of an admin account.' });

    user.isActive = Boolean(req.body.isActive);
    await user.save();
    res.json({ user: { _id: user._id, isActive: user.isActive } });
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
    if (order.orderStatus === 'awaiting_payment') order.orderStatus = 'preparing';
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

    sendPushToUser(order.user, {
      title: `Order #${order.orderNumber} is out for delivery`,
      body: `Estimated arrival in about ${etaMinutes} minutes.`,
      url: `/order.html?id=${order._id}`,
      tag: `order-${order._id}`,
    }, { category: 'order' }).catch((err) => console.error('[dispatchOrder] push failed:', err.message));

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

    sendPushToUser(order.user, {
      title: `Order #${order.orderNumber} total updated`,
      body: reason ? `New total is ${amount} — ${reason}` : `New total is ${amount}.`,
      url: `/order.html?id=${order._id}`,
      tag: `order-${order._id}`,
    }, { category: 'order' }).catch((err) => console.error('[adjustOrderPrice] push failed:', err.message));

    res.json({ order });
  } catch (err) {
    next(err);
  }
};

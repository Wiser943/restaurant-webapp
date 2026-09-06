const Order = require('../models/Order');
const SupportMessage = require('../models/SupportMessage');
const { getIO } = require('../config/socket');
const { sendPushToUser, sendPushToRole } = require('../utils/sendPush');

// GET /api/supplier/orders
// Everything ever assigned to this rider, most recent first. The frontend
// splits this into "To deliver" (preparing/out_for_delivery) vs "Delivered".
exports.getMyOrders = async (req, res, next) => {
  try {
    const orders = await Order.find({ assignedSupplier: req.user._id })
      .populate('user', 'name phone email')
      .sort({ createdAt: -1 });
    res.json({ orders });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/supplier/orders/:id/start
// Rider confirms they've picked the order up and are on the way, in case it
// wasn't already dispatched by an admin.
exports.startDelivery = async (req, res, next) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, assignedSupplier: req.user._id });
    if (!order) return res.status(404).json({ message: 'Order not found.' });

    order.orderStatus = 'out_for_delivery';
    order.dispatchedAt = order.dispatchedAt || new Date();
    if (!order.estimatedDeliveryAt) {
      order.estimatedDeliveryAt = new Date(Date.now() + 30 * 60 * 1000);
    }
    await order.save();

    getIO().to(`user:${order.user}`).emit('order:statusChanged', order);
    getIO().to('admins').emit('order:updated', order);
    res.json({ order });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/supplier/orders/:id/deliver
exports.markDelivered = async (req, res, next) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, assignedSupplier: req.user._id });
    if (!order) return res.status(404).json({ message: 'Order not found.' });

    order.orderStatus = 'completed';
    order.deliveredAt = new Date();
    await order.save();

    getIO().to(`user:${order.user}`).emit('order:statusChanged', order);
    getIO().to('admins').emit('order:updated', order);
    res.json({ order });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/supplier/orders/:id/issue  { message }
// Lets a rider flag a problem (can't reach customer, wrong address, etc).
// Drops a note in the support thread so admin + customer both see it.
exports.reportIssue = async (req, res, next) => {
  try {
    const { message } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ message: 'Describe the issue first.' });
    }

    const order = await Order.findOne({ _id: req.params.id, assignedSupplier: req.user._id });
    if (!order) return res.status(404).json({ message: 'Order not found.' });

    order.deliveryIssue = message.trim();
    await order.save();

    const note = await SupportMessage.create({
      user: order.user,
      order: order._id,
      orderNumber: order.orderNumber,
      sender: 'supplier',
      senderName: req.user.name,
      message: `Delivery update from ${req.user.name}: ${message.trim()}`,
      readByAdmin: false,
      readByCustomer: false,
    });

    getIO().to(`user:${order.user}`).emit('support:message', note);
    getIO().to(`user:${order.user}`).emit('order:statusChanged', order);
    getIO().to('admins').emit('support:message', note);
    getIO().to('admins').emit('order:updated', order);

    sendPushToUser(order.user, {
      title: `Order #${order.orderNumber} · Delivery update`,
      body: note.message,
      url: `/support.html?order=${encodeURIComponent(order.orderNumber)}`,
      tag: `support-${order.user}`,
    }).catch((err) => console.error('[reportIssue] customer push failed:', err.message));
    sendPushToRole('admin', {
      title: `Delivery issue · Order #${order.orderNumber}`,
      body: note.message,
      url: `/admin/support.html`,
      tag: 'delivery-issue',
    }).catch((err) => console.error('[reportIssue] admin push failed:', err.message));

    res.json({ order, message: note });
  } catch (err) {
    next(err);
  }
};

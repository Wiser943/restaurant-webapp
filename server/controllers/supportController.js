const SupportMessage = require('../models/SupportMessage');
const Order = require('../models/Order');
const User = require('../models/User');
const { getIO } = require('../config/socket');

// ---------- Customer side ----------

// GET /api/support
// The logged-in customer's own conversation with the restaurant. Marks any
// admin messages as read since the customer is now looking at them.
exports.getMyMessages = async (req, res, next) => {
  try {
    const messages = await SupportMessage.find({ user: req.user._id }).sort({ createdAt: 1 });

    await SupportMessage.updateMany(
      { user: req.user._id, sender: 'admin', readByCustomer: false },
      { readByCustomer: true }
    );

    res.json({ messages });
  } catch (err) {
    next(err);
  }
};

// POST /api/support  { message, orderNumber? }
// orderNumber is optional free text - if it matches a real order that
// belongs to this customer, we link it properly; otherwise we still store
// whatever they typed so the admin can search for it manually.
exports.sendMessage = async (req, res, next) => {
  try {
    const { message, orderNumber } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ message: 'Message cannot be empty.' });
    }

    let orderRef = null;
    let orderNumberSnapshot = orderNumber ? orderNumber.trim().toUpperCase() : undefined;

    if (orderNumberSnapshot) {
      const order = await Order.findOne({ orderNumber: orderNumberSnapshot, user: req.user._id });
      if (order) orderRef = order._id;
    }

    const doc = await SupportMessage.create({
      user: req.user._id,
      order: orderRef,
      orderNumber: orderNumberSnapshot,
      sender: 'customer',
      senderName: req.user.name,
      message: message.trim(),
      readByCustomer: true,
      readByAdmin: false,
    });

    getIO().to('admins').emit('support:message', doc);

    res.status(201).json({ message: doc });
  } catch (err) {
    next(err);
  }
};

// ---------- Admin side ----------

// GET /api/admin/support
// One row per customer who has ever messaged in, with their last message
// and how many of the customer's messages are still unread by admin.
exports.getConversations = async (req, res, next) => {
  try {
    const conversations = await SupportMessage.aggregate([
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: '$user',
          lastMessage: { $first: '$message' },
          lastSender: { $first: '$sender' },
          lastAt: { $first: '$createdAt' },
          unreadCount: {
            $sum: { $cond: [{ $and: [{ $eq: ['$sender', 'customer'] }, { $eq: ['$readByAdmin', false] }] }, 1, 0] },
          },
        },
      },
      { $sort: { lastAt: -1 } },
    ]);

    const users = await User.find({ _id: { $in: conversations.map((c) => c._id) } }).select('name email phone');
    const userMap = Object.fromEntries(users.map((u) => [u._id.toString(), u]));

    const result = conversations.map((c) => ({
      user: userMap[c._id.toString()] || { _id: c._id, name: 'Unknown customer' },
      lastMessage: c.lastMessage,
      lastSender: c.lastSender,
      lastAt: c.lastAt,
      unreadCount: c.unreadCount,
    }));

    res.json({ conversations: result });
  } catch (err) {
    next(err);
  }
};

// GET /api/admin/support/:userId
// Full thread with one customer. Marks the customer's messages as read.
exports.getConversationMessages = async (req, res, next) => {
  try {
    const messages = await SupportMessage.find({ user: req.params.userId }).sort({ createdAt: 1 });

    await SupportMessage.updateMany(
      { user: req.params.userId, sender: 'customer', readByAdmin: false },
      { readByAdmin: true }
    );

    res.json({ messages });
  } catch (err) {
    next(err);
  }
};

// POST /api/admin/support/:userId  { message, orderNumber? }
exports.adminSendMessage = async (req, res, next) => {
  try {
    const { message, orderNumber } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ message: 'Message cannot be empty.' });
    }

    let orderRef = null;
    let orderNumberSnapshot = orderNumber ? orderNumber.trim().toUpperCase() : undefined;
    if (orderNumberSnapshot) {
      const order = await Order.findOne({ orderNumber: orderNumberSnapshot, user: req.params.userId });
      if (order) orderRef = order._id;
    }

    const doc = await SupportMessage.create({
      user: req.params.userId,
      order: orderRef,
      orderNumber: orderNumberSnapshot,
      sender: 'admin',
      senderName: req.user.name,
      message: message.trim(),
      readByAdmin: true,
      readByCustomer: false,
    });

    getIO().to(`user:${req.params.userId}`).emit('support:message', doc);
    getIO().to('admins').emit('support:message', doc);

    res.status(201).json({ message: doc });
  } catch (err) {
    next(err);
  }
};

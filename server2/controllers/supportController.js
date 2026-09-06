const SupportMessage = require('../models/SupportMessage');
const Order = require('../models/Order');
const { getIO } = require('../config/socket');
const { sendPushToUser, sendPushToRole } = require('../utils/sendPush');

// ---------- Shared helpers ----------

// Each of "customer" and "supplier" has their own private thread with admin,
// keyed by their own user id, using the SAME SupportMessage collection - the
// only thing that separates a "customer thread" from a "supplier thread" is
// the role of the User the messages are attached to. That's what lets the
// admin inbox split into two tabs without needing two collections.
async function createThreadMessage({ user, sender, senderName, message, orderNumber, ownReadField }) {
  let orderRef = null;
  let orderNumberSnapshot = orderNumber ? orderNumber.trim().toUpperCase() : undefined;

  if (orderNumberSnapshot) {
    // A customer can only attach an order that's actually theirs (prevents
    // referencing someone else's order number in their own thread). Admin
    // and supplier senders are trusted staff/riders, and a rider's own
    // order reference legitimately belongs to a DIFFERENT user (the
    // customer who placed it) — so for them we look it up by number alone.
    const query = sender === 'customer' ? { orderNumber: orderNumberSnapshot, user } : { orderNumber: orderNumberSnapshot };
    const order = await Order.findOne(query);
    if (order) orderRef = order._id;
  }

  const readFlags = { readByAdmin: false, readByCustomer: false, readBySupplier: false };
  if (ownReadField) readFlags[ownReadField] = true; // you've obviously "read" your own message

  return SupportMessage.create({
    user,
    order: orderRef,
    orderNumber: orderNumberSnapshot,
    sender,
    senderName,
    message: message.trim(),
    ...readFlags,
  });
}

function requireMessage(req, res) {
  const { message } = req.body;
  if (!message || !message.trim()) {
    res.status(400).json({ message: 'Message cannot be empty.' });
    return null;
  }
  return message;
}

// ---------- Customer side (public/js/support-page.js) ----------

// GET /api/support
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
exports.sendMessage = async (req, res, next) => {
  try {
    const message = requireMessage(req, res);
    if (!message) return;

    const doc = await createThreadMessage({
      user: req.user._id,
      sender: 'customer',
      senderName: req.user.name,
      message,
      orderNumber: req.body.orderNumber,
      ownReadField: 'readByCustomer',
    });

    getIO().to('admins').emit('support:message', doc);

    sendPushToRole('admin', {
      title: `${req.user.name} · Support`,
      body: doc.message,
      url: `/admin/support.html?userId=${req.user._id}`,
      tag: `support-${req.user._id}`,
    }).catch((err) => console.error('[support:customer] push failed:', err.message));

    res.status(201).json({ message: doc });
  } catch (err) {
    next(err);
  }
};

// ---------- Supplier side (supplier/js/supplier-support.js) ----------
// Mirrors the customer flow exactly, just scoped to sender: 'supplier' and
// its own readBySupplier flag, so a rider's own account-level questions to
// admin ("my payout looks wrong", "can't log an issue on this order") have
// somewhere to go that isn't piggybacking on a customer's thread the way
// reportIssue() in supplierController does for order-specific problems.

// GET /api/supplier/support
exports.getMySupplierMessages = async (req, res, next) => {
  try {
    const messages = await SupportMessage.find({ user: req.user._id }).sort({ createdAt: 1 });

    await SupportMessage.updateMany(
      { user: req.user._id, sender: 'admin', readBySupplier: false },
      { readBySupplier: true }
    );

    res.json({ messages });
  } catch (err) {
    next(err);
  }
};

// POST /api/supplier/support  { message, orderNumber? }
exports.sendSupplierMessage = async (req, res, next) => {
  try {
    const message = requireMessage(req, res);
    if (!message) return;

    const doc = await createThreadMessage({
      user: req.user._id,
      sender: 'supplier',
      senderName: req.user.name,
      message,
      orderNumber: req.body.orderNumber,
      ownReadField: 'readBySupplier',
    });

    getIO().to('admins').emit('support:message', doc);

    sendPushToRole('admin', {
      title: `${req.user.name} · Rider support`,
      body: doc.message,
      url: `/admin/support.html?userId=${req.user._id}`,
      tag: `support-${req.user._id}`,
    }).catch((err) => console.error('[support:supplier] push failed:', err.message));

    res.status(201).json({ message: doc });
  } catch (err) {
    next(err);
  }
};

// ---------- Admin side (admin/js/admin-support.js) ----------

// GET /api/admin/support?role=customer|supplier
// One row per person who has ever messaged in, scoped to either the
// customer inbox or the supplier inbox (defaults to customer, so any old
// bookmarked/linked URL without ?role= keeps working exactly as before).
exports.getConversations = async (req, res, next) => {
  try {
    const role = req.query.role === 'supplier' ? 'supplier' : 'customer';

    const conversations = await SupportMessage.aggregate([
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: '$user',
          lastMessage: { $first: '$message' },
          lastSender: { $first: '$sender' },
          lastAt: { $first: '$createdAt' },
          unreadCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$sender', role] },
                    { $eq: [role === 'supplier' ? '$readBySupplier' : '$readByCustomer', false] },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
      // Join in the User so we can filter to only customers or only
      // suppliers - this is what actually separates the two tabs.
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'userDoc',
        },
      },
      { $unwind: { path: '$userDoc', preserveNullAndEmptyArrays: false } },
      { $match: { 'userDoc.role': role } },
      { $sort: { lastAt: -1 } },
    ]);

    const result = conversations.map((c) => ({
      user: { _id: c.userDoc._id, name: c.userDoc.name, email: c.userDoc.email, phone: c.userDoc.phone },
      lastMessage: c.lastMessage,
      lastSender: c.lastSender,
      lastAt: c.lastAt,
      unreadCount: c.unreadCount,
    }));

    res.json({ conversations: result, role });
  } catch (err) {
    next(err);
  }
};

// GET /api/admin/support/:userId
// Full thread with one person (customer OR supplier — same shape either
// way). Marks their messages as read on whichever flag applies to them.
exports.getConversationMessages = async (req, res, next) => {
  try {
    const messages = await SupportMessage.find({ user: req.params.userId }).sort({ createdAt: 1 });

    await SupportMessage.updateMany({ user: req.params.userId, sender: 'customer', readByAdmin: false }, { readByAdmin: true });
    await SupportMessage.updateMany({ user: req.params.userId, sender: 'supplier', readByAdmin: false }, { readByAdmin: true });

    res.json({ messages });
  } catch (err) {
    next(err);
  }
};

// POST /api/admin/support/:userId  { message, orderNumber? }
// Works identically whether :userId belongs to a customer or a supplier —
// the recipient's own thread-fetch (getMyMessages / getMySupplierMessages)
// is what marks it read on their side, so this doesn't need to know which
// kind of person it's replying to.
exports.adminSendMessage = async (req, res, next) => {
  try {
    const message = requireMessage(req, res);
    if (!message) return;

    const doc = await createThreadMessage({
      user: req.params.userId,
      sender: 'admin',
      senderName: req.user.name,
      message,
      orderNumber: req.body.orderNumber,
      ownReadField: 'readByAdmin',
    });

    getIO().to(`user:${req.params.userId}`).emit('support:message', doc);
    getIO().to('admins').emit('support:message', doc);

    sendPushToUser(req.params.userId, {
      title: 'New message from the restaurant',
      body: doc.message,
      url: `/support.html`,
      tag: `support-admin-${req.params.userId}`,
    }).catch((err) => console.error('[support:admin] push failed:', err.message));

    res.status(201).json({ message: doc });
  } catch (err) {
    next(err);
  }
};

const PushSubscription = require('../models/PushSubscription');
const { PUBLIC_KEY } = require('../config/push');

// GET /api/push/public-key (no auth - the frontend needs this before it can
// even ask the browser to subscribe)
exports.getPublicKey = (req, res) => {
  if (!PUBLIC_KEY) {
    return res.status(503).json({ message: 'Push notifications are not configured on this server yet.' });
  }
  res.json({ publicKey: PUBLIC_KEY });
};

// POST /api/push/subscribe  { subscription }
// `subscription` is exactly what PushManager.subscribe() returns in the
// browser (endpoint + keys.p256dh + keys.auth) - see public/js/push.js.
exports.subscribe = async (req, res, next) => {
  try {
    const { subscription } = req.body;
    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return res.status(400).json({ message: 'A valid push subscription object is required.' });
    }

    await PushSubscription.findOneAndUpdate(
      { endpoint: subscription.endpoint },
      {
        user: req.user._id,
        role: req.user.role,
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
        userAgent: req.headers['user-agent'],
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.status(201).json({ message: 'Subscribed to push notifications.' });
  } catch (err) {
    next(err);
  }
};

// POST /api/push/unsubscribe  { endpoint }
exports.unsubscribe = async (req, res, next) => {
  try {
    const { endpoint } = req.body;
    if (!endpoint) return res.status(400).json({ message: 'endpoint is required.' });
    await PushSubscription.deleteOne({ endpoint, user: req.user._id });
    res.json({ message: 'Unsubscribed.' });
  } catch (err) {
    next(err);
  }
};

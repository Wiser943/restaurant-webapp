const { webpush, ensureConfigured } = require('../config/push');
const PushSubscription = require('../models/PushSubscription');
const User = require('../models/User');

/**
 * Sends one push payload to every subscription belonging to a set of
 * subscription documents, removing any that the push service reports as
 * gone (410 Gone / 404 Not Found = the user uninstalled, cleared data, or
 * revoked permission - keep our table clean instead of retrying forever).
 */
async function pushToSubscriptions(subs, payload) {
  if (!ensureConfigured() || !subs.length) return;

  const body = JSON.stringify(payload);

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          body
        );
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          await PushSubscription.deleteOne({ _id: sub._id }).catch(() => {});
        } else {
          console.error('[push] send failed:', err.statusCode, err.body || err.message);
        }
      }
    })
  );
}

/**
 * Push to every device a specific user has subscribed from.
 * `category` lets the customer's own notification preferences (set in
 * Account settings) silently opt them out of that kind of push - 'order'
 * covers order-status/price/delivery updates, 'promo' covers marketing
 * pushes. Anything else (e.g. a direct admin support reply) always sends.
 */
async function sendPushToUser(userId, payload, { category } = {}) {
  if (category === 'order' || category === 'promo') {
    const user = await User.findById(userId).select('notifyOrderUpdates notifyPromotions');
    if (user) {
      if (category === 'order' && user.notifyOrderUpdates === false) return;
      if (category === 'promo' && user.notifyPromotions === false) return;
    }
  }
  const subs = await PushSubscription.find({ user: userId });
  await pushToSubscriptions(subs, payload);
}

/** Push to every device belonging to every user with a given role (e.g. all admins). */
async function sendPushToRole(role, payload) {
  const subs = await PushSubscription.find({ role });
  await pushToSubscriptions(subs, payload);
}

module.exports = { sendPushToUser, sendPushToRole };

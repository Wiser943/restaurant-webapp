const { webpush, ensureConfigured } = require('../config/push');
const PushSubscription = require('../models/PushSubscription');

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

/** Push to every device a specific user has subscribed from. */
async function sendPushToUser(userId, payload) {
  const subs = await PushSubscription.find({ user: userId });
  await pushToSubscriptions(subs, payload);
}

/** Push to every device belonging to every user with a given role (e.g. all admins). */
async function sendPushToRole(role, payload) {
  const subs = await PushSubscription.find({ role });
  await pushToSubscriptions(subs, payload);
}

module.exports = { sendPushToUser, sendPushToRole };

const Order = require('../models/Order');
const { getIO } = require('../config/socket');
const { sendPushToUser } = require('../utils/sendPush');
const chowdeck = require('../services/chowdeckClient');

// Chowdeck sends one of these `category` values per webhook event (see
// https://chowdeck-api.readme.io/docs/events). We collapse them down to the
// four rider-lifecycle stages the spec asks for — ASSIGNED / IN_TRANSIT /
// COMPLETED / CANCELLED — so the switch statement below reads simply, while
// still keeping the exact original category on the order for debugging.
//
// NOTE: Chowdeck's documented event list doesn't currently show a
// cancellation category explicitly, even though Relay deliveries can be
// cancelled (POST /relay/delivery/{reference}/cancel). We defensively match
// a couple of likely names below - confirm the exact category Chowdeck
// sends for cancellations in your Dashboard's webhook log the first time
// one happens, and adjust CATEGORY_TO_STAGE if needed.
const CATEGORY_TO_STAGE = {
  ORDER_ASSIGNED: 'ASSIGNED',
  ORDER_AWAITING_PICKUP: 'ASSIGNED', // rider is at the restaurant but hasn't left yet
  ORDER_PICKED_UP: 'IN_TRANSIT',
  ORDER_ARRIVED_AT_CUSTOMER_LOCATION: 'IN_TRANSIT',
  ORDER_COMPLETE: 'COMPLETED',
  ORDER_CANCELLED: 'CANCELLED',
  DELIVERY_CANCELLED: 'CANCELLED',
};

// POST /api/chowdeck-webhook
// Mounted in server.js with express.raw() (NOT express.json()) so we have
// access to the exact raw bytes Chowdeck signed - see chowdeckWebhookRoutes.js.
exports.handleWebhook = async (req, res, next) => {
  try {
    // --- 1. Verify the signature BEFORE trusting anything in the body ---
    // req.body is a raw Buffer here (see route-level express.raw()).
    const rawBody = req.body;
    const signature = req.headers['x-chowdeck-signature'];

    let isValid;
    try {
      isValid = chowdeck.verifyWebhookSignature(rawBody, signature);
    } catch (err) {
      // CHOWDECK_WEBHOOK_SECRET missing - fail loudly in logs, but still
      // reject the request rather than silently trusting an unverified body.
      console.error('[chowdeck-webhook] signature verification unavailable:', err.message);
      return res.status(500).send('Webhook not configured');
    }

    if (!isValid) {
      console.warn('[chowdeck-webhook] rejected - signature mismatch');
      return res.status(401).send('Invalid signature');
    }

    // --- 2. Now safe to parse ---
    const event = JSON.parse(rawBody.toString('utf8'));
    const { category, payload } = event;

    if (!payload?.reference) {
      // Acknowledge anyway (200) so Chowdeck doesn't retry a malformed event
      // forever - just log it for us to look at.
      console.warn('[chowdeck-webhook] event missing payload.reference:', category);
      return res.status(200).json({ received: true });
    }

    // --- 3. Find the order this delivery belongs to ---
    const order = await Order.findOne({ 'delivery.chowdeck.deliveryReference': payload.reference });
    if (!order) {
      console.warn(`[chowdeck-webhook] no order found for delivery reference ${payload.reference}`);
      return res.status(200).json({ received: true }); // still 200 - not Chowdeck's fault
    }

    // --- 4. Idempotency guard ---
    // Chowdeck retries with backoff if we don't 200 fast enough, and the same
    // event can legitimately arrive twice. If we've already recorded this
    // exact category for this order, just acknowledge and stop - re-applying
    // it would be harmless here anyway, but this keeps behavior predictable.
    if (order.delivery.chowdeck.lastWebhookCategory === category) {
      return res.status(200).json({ received: true, duplicate: true });
    }

    // --- 5. Translate status -> friendly text + update the order ---
    const stage = CATEGORY_TO_STAGE[category];
    let friendlyStatus = null;

    switch (stage) {
      case 'ASSIGNED':
        friendlyStatus = 'A Chowdeck rider has been assigned and is heading to pick up your order.';
        break;

      case 'IN_TRANSIT':
        friendlyStatus =
          category === 'ORDER_ARRIVED_AT_CUSTOMER_LOCATION'
            ? 'Your rider has arrived — please meet them outside.'
            : 'Your order is on the way!';
        order.orderStatus = 'out_for_delivery';
        order.dispatchedAt = order.dispatchedAt || new Date();
        break;

      case 'COMPLETED':
        friendlyStatus = 'Delivered! Enjoy your meal.';
        order.orderStatus = 'completed';
        order.deliveredAt = new Date();
        break;

      case 'CANCELLED':
        friendlyStatus = 'Your Chowdeck delivery was cancelled. We are looking into it — check Support for updates.';
        order.deliveryIssue = payload.cancellation_reason || 'Chowdeck delivery cancelled.';
        break;

      default:
        // Unrecognized/future category - store the raw status so it's
        // visible in the admin dashboard, but don't guess at a customer
        // message or change orderStatus.
        friendlyStatus = null;
        console.log(`[chowdeck-webhook] unhandled category "${category}" for order ${order.orderNumber}`);
    }

    order.delivery.chowdeck.status = payload.status || order.delivery.chowdeck.status;
    order.delivery.chowdeck.lastWebhookCategory = category;
    order.delivery.chowdeck.lastWebhookAt = new Date();
    if (friendlyStatus) order.delivery.chowdeck.friendlyStatus = friendlyStatus;
    if (payload.driver?.name) order.delivery.chowdeck.riderName = payload.driver.name;
    if (payload.driver?.phone) order.delivery.chowdeck.riderPhone = payload.driver.phone;
    if (payload.tracking_url) order.delivery.chowdeck.trackingUrl = payload.tracking_url;

    await order.save();

    // --- 6. Push the update to the customer's tracker screen in real time ---
    getIO().to(`user:${order.user}`).emit('order:statusChanged', order);
    getIO().to('admins').emit('order:updated', order);

    // Also fire a real (OS-level) push notification, since the customer may
    // not have the tab open right now.
    if (friendlyStatus) {
      sendPushToUser(order.user, {
        title: `Order #${order.orderNumber}`,
        body: friendlyStatus,
        url: `/order.html?id=${order._id}`,
        tag: `order-${order._id}`, // collapses rapid updates into one notification
      }).catch((err) => console.error('[chowdeck-webhook] push failed:', err.message));
    }

    // --- 7. Acknowledge quickly, as Chowdeck's docs require ---
    res.status(200).json({ received: true });
  } catch (err) {
    // Still try to 200 where reasonable is tempting, but a genuinely broken
    // handler should surface as a 500 so it shows up in logs/retries rather
    // than silently swallowing a real bug.
    next(err);
  }
};

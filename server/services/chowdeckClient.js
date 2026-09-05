// Thin wrapper around the Chowdeck Relay API.
//
// Built against Chowdeck's published API reference (api.chowdeck.com,
// /relay/delivery/fee, /relay/delivery, /relay/delivery/{reference}) —
// https://chowdeck-api.readme.io. Endpoint paths, field names, and the
// webhook signature scheme below match that documentation as of this
// writing. Chowdeck's API can change, and some accounts may have extra
// requirements (e.g. a merchantReference on certain routes) — double check
// against your own Dashboard -> API Reference before going live, and watch
// your error logs for 400s the first few times you hit these endpoints.

const crypto = require('crypto');
const deliveryConfig = require('../config/deliveryConfig');

class ChowdeckError extends Error {
  constructor(message, { status, data } = {}) {
    super(message);
    this.name = 'ChowdeckError';
    this.status = status;
    this.data = data;
  }
}

function assertConfigured() {
  if (!deliveryConfig.chowdeck.apiKey) {
    throw new ChowdeckError('CHOWDECK_API_KEY is not set. Add it to your .env before using Chowdeck Relay.');
  }
}

async function chowdeckRequest(path, { method = 'POST', body } = {}) {
  assertConfigured();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), deliveryConfig.chowdeck.requestTimeoutMs);

  let res;
  try {
    res = await fetch(`${deliveryConfig.chowdeck.baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${deliveryConfig.chowdeck.apiKey}`,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new ChowdeckError('Chowdeck API request timed out.');
    }
    throw new ChowdeckError(`Could not reach Chowdeck API: ${err.message}`);
  } finally {
    clearTimeout(timeout);
  }

  let json = null;
  try {
    json = await res.json();
  } catch (e) {
    // non-JSON response - fall through, res.ok check below will handle it
  }

  if (!res.ok || json?.status === 'failed') {
    throw new ChowdeckError(json?.message || `Chowdeck API returned ${res.status}`, {
      status: res.status,
      data: json,
    });
  }

  return json?.data ?? json;
}

/**
 * Step 1 of the Relay flow: get a delivery fee quote for a route.
 * POST /relay/delivery/fee
 *
 * @param {{ lat: number, lng: number }} source - pickup point (your restaurant)
 * @param {{ lat: number, lng: number }} destination - customer's location
 * @param {number} [estimatedOrderAmount] - order subtotal in Naira, used for
 *        Chowdeck's optional package-protection/safety fee calculation
 * @returns {Promise<{ feeId: number, totalAmountKobo: number, deliveryAmountKobo: number, safetyFeeKobo: number }>}
 */
async function getRelayQuote({ source, destination, estimatedOrderAmount = 0 }) {
  const data = await chowdeckRequest('/relay/delivery/fee', {
    body: {
      source_address: { latitude: source.lat, longitude: source.lng },
      destination_address: { latitude: destination.lat, longitude: destination.lng },
      // Chowdeck expects amounts in kobo (the smallest NGN unit) - Naira × 100.
      estimated_order_amount: Math.round(estimatedOrderAmount * 100),
    },
  });

  return {
    feeId: data.id,
    totalAmountKobo: data.total_amount,
    deliveryAmountKobo: data.delivery_amount,
    safetyFeeKobo: data.safety_fee,
    serviceAmountKobo: data.service_amount,
  };
}

/**
 * Step 2 of the Relay flow: actually summon a rider, using the fee ID from
 * getRelayQuote(). Only call this AFTER the customer has paid - a fee quote
 * has a short expiry window on Chowdeck's side.
 * POST /relay/delivery
 */
async function createDelivery({
  feeId,
  reference,
  itemType = 'Food',
  customerDeliveryNote,
  estimatedOrderAmount,
  destination,
}) {
  const data = await chowdeckRequest('/relay/delivery', {
    body: {
      fee_id: feeId,
      reference,
      item_type: itemType,
      // "sending": we (the restaurant) are the ones initiating the request.
      user_action: 'sending',
      estimated_order_amount: estimatedOrderAmount != null ? Math.round(estimatedOrderAmount * 100) : undefined,
      customer_delivery_note: customerDeliveryNote,
      source_contact: {
        name: deliveryConfig.restaurant.contactName,
        phone: deliveryConfig.restaurant.contactPhone,
        country_code: deliveryConfig.chowdeck.countryCode,
      },
      destination_contact: {
        name: destination.name,
        phone: destination.phone,
        country_code: deliveryConfig.chowdeck.countryCode,
        email: destination.email,
      },
    },
  });

  return {
    deliveryReference: data.reference,
    deliveryId: data.id,
    deliveryPriceKobo: data.delivery_price,
    status: data.status,
    madePayment: data.made_payment,
  };
}

/** GET /relay/delivery/{reference} - poll current status/tracking info. */
async function getDelivery(reference) {
  const data = await chowdeckRequest(`/relay/delivery/${encodeURIComponent(reference)}`, { method: 'GET' });
  return data;
}

/** POST /relay/delivery/{reference}/cancel - cancel an active delivery. */
async function cancelDelivery(reference, reason) {
  return chowdeckRequest(`/relay/delivery/${encodeURIComponent(reference)}/cancel`, {
    body: { reason },
  });
}

/**
 * Verifies the `x-chowdeck-signature` header on an incoming webhook.
 * Per Chowdeck's docs: HMAC-SHA256 of the RAW request body, using your
 * webhook secret, compared with a timing-safe equality check.
 *
 * IMPORTANT: `rawBody` must be the exact raw bytes/string Chowdeck sent -
 * NOT a re-serialized JSON object, since re-serializing can change
 * whitespace/key order and break the signature match. See
 * chowdeckWebhookRoutes.js for how the raw body is captured.
 */
function verifyWebhookSignature(rawBody, signatureHeader) {
  if (!deliveryConfig.chowdeck.webhookSecret) {
    throw new ChowdeckError('CHOWDECK_WEBHOOK_SECRET is not set - cannot verify webhook signatures.');
  }
  if (!signatureHeader) return false;

  const computed = crypto
    .createHmac('sha256', deliveryConfig.chowdeck.webhookSecret)
    .update(rawBody)
    .digest('hex');

  const a = Buffer.from(computed, 'utf8');
  const b = Buffer.from(signatureHeader, 'utf8');
  if (a.length !== b.length) return false; // timingSafeEqual requires equal-length buffers
  return crypto.timingSafeEqual(a, b);
}

/** kobo -> Naira, rounded to the nearest whole Naira (matches currency() on the frontend). */
function koboToNaira(kobo) {
  return Math.round((kobo || 0) / 100);
}

module.exports = {
  ChowdeckError,
  getRelayQuote,
  createDelivery,
  getDelivery,
  cancelDelivery,
  verifyWebhookSignature,
  koboToNaira,
};

const deliveryConfig = require('../config/deliveryConfig');
const { haversineKm, normalizeCoords } = require('../utils/geo');
const { calculateEta } = require('../utils/etaCalculator');
const chowdeck = require('../services/chowdeckClient');

/**
 * Given the customer's coordinates, decides IN_HOUSE vs CHOWDECK_RELAY and
 * returns everything checkout needs to show/charge: fee, ETA, distance.
 * This is intentionally the ONLY place distance is computed — the frontend
 * only ever displays what this returns, it never computes or sends a fee
 * itself, so nobody can tamper with the delivery fee from devtools.
 */
async function resolveDelivery({ customerLat, customerLng, orderSubtotal = 0 }) {
  const distanceKm = haversineKm(
    deliveryConfig.restaurant.latitude,
    deliveryConfig.restaurant.longitude,
    customerLat,
    customerLng
  );

  // --- Scenario A: NEAR -> in-house, free, bypass Chowdeck entirely ---
  if (distanceKm <= deliveryConfig.nearRadiusKm) {
    const eta = calculateEta('IN_HOUSE');
    return {
      mode: 'IN_HOUSE',
      distanceKm: Number(distanceKm.toFixed(2)),
      fee: 0,
      etaMinutes: eta.minutes,
      etaAt: eta.etaAt,
      etaBreakdown: eta.breakdown,
    };
  }

  // --- Scenario B: FAR -> quote Chowdeck Relay, customer pays the exact fare ---
  const quote = await chowdeck.getRelayQuote({
    source: { lat: deliveryConfig.restaurant.latitude, lng: deliveryConfig.restaurant.longitude },
    destination: { lat: customerLat, lng: customerLng },
    estimatedOrderAmount: orderSubtotal,
  });

  const eta = calculateEta('CHOWDECK_RELAY', distanceKm);
  const feeNaira = chowdeck.koboToNaira(quote.totalAmountKobo);

  return {
    mode: 'CHOWDECK_RELAY',
    distanceKm: Number(distanceKm.toFixed(2)),
    fee: feeNaira, // 100% passed through, no markup
    etaMinutes: eta.minutes,
    etaAt: eta.etaAt,
    etaBreakdown: eta.breakdown,
    chowdeck: {
      feeId: quote.feeId,
      deliveryAmountKobo: quote.deliveryAmountKobo,
      safetyFeeKobo: quote.safetyFeeKobo,
    },
  };
}

// POST /api/delivery/quote  { lat, lng, orderSubtotal? }
// Called by the checkout page BEFORE the order is placed, purely to show
// the customer what they'll pay for delivery and how it'll arrive. The
// authoritative recompute (that actually gets stored on the order) happens
// again server-side in orderController.placeOrder — this endpoint never
// itself commits anything.
exports.getQuote = async (req, res, next) => {
  try {
    const { lat, lng } = normalizeCoords(req.body);
    const orderSubtotal = Number(req.body.orderSubtotal) || 0;

    const result = await resolveDelivery({ customerLat: lat, customerLng: lng, orderSubtotal });
    res.json({ delivery: result, nearRadiusKm: deliveryConfig.nearRadiusKm });
  } catch (err) {
    if (err.name === 'ChowdeckError') {
      return res.status(502).json({ message: `Could not get a delivery quote right now: ${err.message}` });
    }
    if (err.message?.includes('coordinates')) {
      return res.status(400).json({ message: err.message });
    }
    next(err);
  }
};

module.exports.resolveDelivery = resolveDelivery;

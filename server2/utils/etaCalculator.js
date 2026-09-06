const deliveryConfig = require('../config/deliveryConfig');

/**
 * Estimates delivery time in minutes, since Chowdeck's Relay fee endpoint
 * only returns a price - not a live countdown. Two formulas, per spec:
 *
 *   IN_HOUSE        = kitchen prep + fixed walking/biking buffer
 *   CHOWDECK_RELAY   = kitchen prep + rider pickup window + (distanceKm × traffic min/km)
 *
 * @param {'IN_HOUSE'|'CHOWDECK_RELAY'} mode
 * @param {number} distanceKm - required for CHOWDECK_RELAY, ignored for IN_HOUSE
 * @returns {{ minutes: number, etaAt: Date, breakdown: object }}
 */
function calculateEta(mode, distanceKm = 0) {
  const { kitchenPrepMinutes, inHouseWalkingBufferMinutes, riderPickupWindowMinutes, trafficMinutesPerKm } =
    deliveryConfig.eta;

  let minutes;
  let breakdown;

  if (mode === 'IN_HOUSE') {
    minutes = kitchenPrepMinutes + inHouseWalkingBufferMinutes;
    breakdown = {
      kitchenPrepMinutes,
      inHouseWalkingBufferMinutes,
    };
  } else if (mode === 'CHOWDECK_RELAY') {
    const travelMinutes = Math.max(0, distanceKm) * trafficMinutesPerKm;
    minutes = kitchenPrepMinutes + riderPickupWindowMinutes + travelMinutes;
    breakdown = {
      kitchenPrepMinutes,
      riderPickupWindowMinutes,
      distanceKm: Number(distanceKm.toFixed(2)),
      trafficMinutesPerKm,
      travelMinutes: Number(travelMinutes.toFixed(1)),
    };
  } else {
    throw new Error(`Unknown delivery mode: ${mode}`);
  }

  minutes = Math.ceil(minutes);

  return {
    minutes,
    etaAt: new Date(Date.now() + minutes * 60 * 1000),
    breakdown,
  };
}

module.exports = { calculateEta };

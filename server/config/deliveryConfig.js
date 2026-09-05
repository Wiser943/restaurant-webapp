// Single source of truth for every number/knob the delivery-routing system
// needs. Keeping it here (instead of scattered through controllers) means
// you can retune "how close counts as near" or "how long prep takes" from
// one place — or override any of it per-environment via .env — without
// touching logic anywhere else.

function num(envVal, fallback) {
  const n = Number(envVal);
  return Number.isFinite(n) ? n : fallback;
}

const deliveryConfig = {
  // --- Your restaurant's fixed location (used as the pickup point for every
  // distance check and every Chowdeck quote). Get these from Google Maps:
  // right-click your spot -> click the lat/lng that pops up to copy it.
  restaurant: {
    latitude: num(process.env.RESTAURANT_LAT, 6.601838),
    longitude: num(process.env.RESTAURANT_LNG, 3.3514863),
    address: process.env.RESTAURANT_ADDRESS || "Mama Tolu's Kitchen",
    contactName: process.env.RESTAURANT_CONTACT_NAME || "Mama Tolu's Kitchen",
    contactPhone: process.env.RESTAURANT_CONTACT_PHONE || '',
  },

  // --- Scenario A / B split ---
  // Distance (km) within which delivery is handled in-house, for free.
  // Anything farther than this gets routed through Chowdeck Relay and the
  // rider fare is passed on to the customer at checkout.
  nearRadiusKm: num(process.env.NEAR_RADIUS_KM, 1.0),

  // --- ETA calculator inputs (all in minutes) ---
  eta: {
    kitchenPrepMinutes: num(process.env.ETA_KITCHEN_PREP_MIN, 20),
    inHouseWalkingBufferMinutes: num(process.env.ETA_INHOUSE_BUFFER_MIN, 10),
    riderPickupWindowMinutes: num(process.env.ETA_RIDER_PICKUP_WINDOW_MIN, 15),
    trafficMinutesPerKm: num(process.env.ETA_TRAFFIC_MIN_PER_KM, 3.5),
  },

  // --- Chowdeck API ---
  chowdeck: {
    baseUrl: process.env.CHOWDECK_API_BASE_URL || 'https://api.chowdeck.com',
    // Secret API key from Chowdeck Dashboard -> API Settings / Developers.
    // Sent as `Authorization: Bearer <key>` on every request. Same key works
    // for the core Chowdeck API and for Relay.
    apiKey: process.env.CHOWDECK_API_KEY || '',
    // Some core (non-Relay) endpoints require this in the URL - not needed
    // for the /relay/* endpoints used here, but kept available in case you
    // wire up the vendor-order side of the API later too.
    merchantReference: process.env.CHOWDECK_MERCHANT_REFERENCE || '',
    // Webhook signing secret from Dashboard -> Settings -> Developers.
    // Used to verify the `x-chowdeck-signature` header on incoming webhooks.
    webhookSecret: process.env.CHOWDECK_WEBHOOK_SECRET || '',
    // Country code Chowdeck expects on contact objects.
    countryCode: process.env.CHOWDECK_COUNTRY_CODE || 'NG',
    // How many ms to wait before giving up on a Chowdeck API call.
    requestTimeoutMs: num(process.env.CHOWDECK_TIMEOUT_MS, 12000),
  },

  // --- Marketplace commission tiers (Section 4) ---
  // Percent taken by Chowdeck on marketplace orders that arrive through the
  // Vendor Dashboard (i.e. NOT the in-house / Relay flow above). Confirm the
  // exact current rates for your account in Dashboard -> Settings -> Payouts
  // before relying on these for real accounting - they're configurable here
  // specifically so you can correct them without touching code.
  vendorTiers: {
    basic: num(process.env.CHOWDECK_TIER_BASIC_PCT, 15),
    premium: num(process.env.CHOWDECK_TIER_PREMIUM_PCT, 20),
    agba: num(process.env.CHOWDECK_TIER_AGBA_PCT, 30),
    chowsmart: num(process.env.CHOWDECK_TIER_CHOWSMART_PCT, 35),
  },
};

module.exports = deliveryConfig;

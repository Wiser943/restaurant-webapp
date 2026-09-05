const deliveryConfig = require('../config/deliveryConfig');

const VALID_TIERS = ['basic', 'premium', 'agba'];

/**
 * Internal ledger helper for marketplace orders placed through the main
 * Chowdeck Vendor Dashboard (i.e. NOT the in-house/Relay checkout flow
 * elsewhere in this file set — this is for reconciling what Chowdeck
 * actually pays out per order against your own records).
 *
 * @param {number} subtotal - the order subtotal in Naira, before commission
 * @param {'basic'|'premium'|'agba'} tier - your standard vendor tier
 * @param {object} [options]
 * @param {boolean} [options.chowsmart] - true if this specific order was
 *        placed under a Chowsmart promo, which overrides your normal tier
 *        rate with the (higher) Chowsmart commission rate
 * @returns {{ tier: string, subtotal: number, commissionPct: number, commissionAmount: number, payoutAmount: number, chowsmartApplied: boolean }}
 */
function calculateVendorPayout(subtotal, tier, { chowsmart = false } = {}) {
  const amount = Number(subtotal);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error('subtotal must be a non-negative number.');
  }

  const normalizedTier = String(tier || '').toLowerCase();
  if (!VALID_TIERS.includes(normalizedTier)) {
    throw new Error(`tier must be one of: ${VALID_TIERS.join(', ')} (got "${tier}")`);
  }

  // A Chowsmart-promoted order always uses the Chowsmart rate, regardless
  // of the vendor's normal tier - it's a per-order override, not a tier.
  const commissionPct = chowsmart ? deliveryConfig.vendorTiers.chowsmart : deliveryConfig.vendorTiers[normalizedTier];

  const commissionAmount = round2((amount * commissionPct) / 100);
  const payoutAmount = round2(amount - commissionAmount);

  return {
    tier: normalizedTier,
    subtotal: amount,
    commissionPct,
    commissionAmount,
    payoutAmount,
    chowsmartApplied: Boolean(chowsmart),
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

module.exports = { calculateVendorPayout, VALID_TIERS };

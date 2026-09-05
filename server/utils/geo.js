// Pure geo math - no I/O, no dependencies, easy to unit test.

const EARTH_RADIUS_KM = 6371;

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

/**
 * Great-circle distance between two lat/lng points, in kilometres.
 * This is the standard Haversine formula.
 */
function haversineKm(lat1, lon1, lat2, lon2) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

/**
 * Validates a { lat, lng } (or { latitude, longitude }) pair coming from the
 * client. Returns a normalized { lat, lng } or throws with a message safe to
 * send straight back to the frontend.
 */
function normalizeCoords(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('Location coordinates are required.');
  }
  const lat = Number(input.lat ?? input.latitude);
  const lng = Number(input.lng ?? input.longitude);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error('Location coordinates must be valid numbers.');
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw new Error('Location coordinates are out of range.');
  }
  return { lat, lng };
}

module.exports = { haversineKm, normalizeCoords };

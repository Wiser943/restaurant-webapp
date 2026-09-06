const crypto = require('crypto');

// Produces something like "MT-260902-8F3K1A" — a short code that's easy for a
// customer to read out over the phone or paste into the support chat, and easy
// for an admin to search for. Not a security token, just a human-friendly ID.
function generateOrderNumber() {
  const now = new Date();
  const datePart =
    String(now.getFullYear()).slice(2) +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0');
  const randomPart = crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 6);
  return `MT-${datePart}-${randomPart}`;
}

module.exports = generateOrderNumber;

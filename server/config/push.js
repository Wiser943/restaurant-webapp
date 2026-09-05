// Configures the `web-push` library with your VAPID keypair. VAPID is what
// lets a browser trust that push messages are really coming from you, even
// while your app is closed - it's what makes the "notify even when the app
// isn't open" part of the ask possible at all (Socket.io only reaches a tab
// that's actually open and connected; Web Push reaches the browser/OS itself).
//
// Generate a keypair ONCE with:  npx web-push generate-vapid-keys
// then put the values in .env as VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY.
// The public key is also exposed to the frontend via GET /api/push/public-key.

const webpush = require('web-push');

const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';

let configured = false;

function ensureConfigured() {
  if (configured) return true;
  if (!PUBLIC_KEY || !PRIVATE_KEY) {
    console.warn('[push] VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY not set - push notifications are disabled.');
    return false;
  }
  webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);
  configured = true;
  return true;
}

module.exports = { webpush, ensureConfigured, PUBLIC_KEY };

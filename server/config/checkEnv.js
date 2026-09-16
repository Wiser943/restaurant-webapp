// Startup environment-variable check.
//
// This does NOT stop the server from booting - the menu, cart, and basic
// browsing should still work even if a merchant hasn't finished setup.
// It just prints one clear list at boot (and exposes the same list on
// GET /api/health) so a missing CHOWDECK_API_KEY, VAPID key, etc. shows
// up immediately at deploy time instead of only surfacing later, buried
// in a 500 error when a real customer tries to check out or a push
// notification silently fails to send.
//
// Add a key here (REQUIRED or RECOMMENDED) any time a new .env value is
// introduced - see exampleen for the full reference list of what each
// one is for and where to get it.

const REQUIRED = [
  { key: 'MONGO_URI', hint: 'MongoDB connection string' },
  { key: 'JWT_SECRET', hint: 'any long random string' },
];

const RECOMMENDED = [
  { key: 'CHOWDECK_API_KEY', hint: 'Chowdeck Dashboard -> Settings -> Developers', feature: 'Chowdeck Relay delivery' },
  { key: 'CHOWDECK_MERCHANT_REFERENCE', hint: 'Chowdeck Dashboard -> Settings -> Developers', feature: 'Chowdeck Relay delivery' },
  { key: 'CHOWDECK_WEBHOOK_SECRET', hint: 'Chowdeck Dashboard -> Settings -> Developers', feature: 'Chowdeck webhook signature verification' },
  { key: 'VAPID_PUBLIC_KEY', hint: 'run: npm run generate-vapid-keys', feature: 'web push notifications' },
  { key: 'VAPID_PRIVATE_KEY', hint: 'run: npm run generate-vapid-keys', feature: 'web push notifications' },
];

function checkEnv({ silent = false } = {}) {
  const missingRequired = REQUIRED.filter((v) => !process.env[v.key]);
  const missingRecommended = RECOMMENDED.filter((v) => !process.env[v.key]);

  if (!silent) {
    if (missingRequired.length) {
      console.error('\n[env] Missing REQUIRED environment variables - the app will not work correctly:');
      missingRequired.forEach((v) => console.error(`  - ${v.key}  (${v.hint})`));
      console.error('');
    }

    if (missingRecommended.length) {
      const byFeature = {};
      missingRecommended.forEach((v) => {
        byFeature[v.feature] = byFeature[v.feature] || [];
        byFeature[v.feature].push(v.key);
      });

      console.warn('\n[env] Missing optional environment variables - these features are disabled until set:');
      Object.entries(byFeature).forEach(([feature, keys]) => {
        console.warn(`  - ${feature}: missing ${keys.join(', ')}`);
      });
      console.warn('  Copy exampleen to .env (or add these in your Vercel project settings) to enable them.\n');
    }
  }

  return {
    ok: missingRequired.length === 0,
    missingRequired: missingRequired.map((v) => v.key),
    missingRecommended: missingRecommended.map((v) => v.key),
  };
}

module.exports = checkEnv;

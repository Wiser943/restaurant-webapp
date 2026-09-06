// Shared across public/, admin/, and supplier/ (they each already load a
// compatible `api` object from an api.js — this file just needs api.get/post
// and the service worker to already be registered, which nav.js/admin-nav.js/
// supplier-nav.js each do on load).
//
// IMPORTANT, and worth being upfront about: a push notification can pop up
// and make a sound while the app is fully closed, but the sound itself comes
// from the OS/browser's own notification sound — a website cannot ship or
// force a *custom* audio file to play while it isn't open (no page ==
// no JS running to play one). What you get instead is the same system
// "ding" the phone/OS already uses for every other app's notifications,
// which for "so it rings instead of being silently missed" is exactly what
// solves the problem described. The custom Sound.ping() in ui.js still
// covers the in-app case (open tab, app in foreground).

const Push = {
  // Call once, after you know who's logged in. Silently does nothing if the
  // browser doesn't support push, the user denies permission, or the server
  // hasn't configured VAPID keys yet — none of that should block the app.
  async subscribe() {
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return;

      const registration = await navigator.serviceWorker.ready;

      // Reuse an existing subscription if the browser already has one for
      // this app, instead of creating (and then having to dedupe) a new one.
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        const { publicKey } = await api.get('/push/public-key');
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true, // required by Chrome/Firefox: every push must show a visible notification
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      }

      await api.post('/push/subscribe', { subscription: subscription.toJSON() });
    } catch (err) {
      // Never let a push-setup failure break the page around it.
      console.warn('[push] subscribe skipped:', err.message);
    }
  },
};

// PushManager wants the VAPID key as a Uint8Array, but we transmit it as the
// base64url string web-push generates — this is the standard conversion.
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

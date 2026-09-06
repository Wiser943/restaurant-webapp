// Very small service worker. Its only job is to exist and register,
// which is one of the requirements browsers check before showing the
// "Install app" prompt. It caches the basic shell so the app opens
// instantly even on a slow connection (menu data still loads live).

const CACHE_NAME = 'mama-rose-shell-v1';
const SHELL_FILES = [
  '/index.html',
  '/css/style.css',
  '/js/api.js',
  '/js/nav.js',
  '/js/home.js',
  '/manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
});

// Network-first for API calls (always want fresh data), cache-first for the shell files.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io/')) return; // let these go straight to network

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});

// --- Web Push ---
// This is what lets a notification show up (and "ring", using the OS/
// browser's own notification sound) even while nobody has the app open —
// Socket.io only reaches a tab that's already connected, this reaches the
// device itself. The payload shape ({ title, body, url, tag }) is set by
// server/utils/sendPush.js.
self.addEventListener('push', (event) => {
  let data = { title: "Mama Tolu's Kitchen", body: 'You have a new notification.' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (e) { /* fall back to the default above */ }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      // vibrate is what makes it "ring"/buzz on mobile even if the phone is
      // on silent-but-not-DND — desktop browsers ignore this harmlessly.
      vibrate: [200, 100, 200],
      data: { url: data.url || '/' },
      // Using the same `tag` for related updates (e.g. repeated order status
      // changes) replaces the old notification instead of stacking a pile of
      // them - see the `tag` values sent from the backend.
      tag: data.tag,
      renotify: Boolean(data.tag),
    })
  );
});

// Clicking the notification focuses an already-open tab if there is one,
// otherwise opens a new one at the relevant page.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsArr) => {
      const existing = clientsArr.find((c) => c.url.includes(targetUrl.split('?')[0]));
      if (existing) return existing.focus();
      return self.clients.openWindow(targetUrl);
    })
  );
});

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

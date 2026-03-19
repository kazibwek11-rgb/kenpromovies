/* Kenmovies Service Worker v9 - force fresh cache */
const CACHE = 'km-v9';
const ASSETS = ['/', '/index.html', '/app3.js', '/style.css', '/manifest.json'];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS).catch(()=>{})));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  /* Always go network first, fall back to cache */
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});

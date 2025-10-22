const CACHE_NAME = 'aj-cache-v2';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => k!==CACHE_NAME && caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});

self.addEventListener('message', (event) => {
  if(event.data?.type === 'force-refresh'){
    const respond = event.ports?.[0];
    event.waitUntil((async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
        const cache = await caches.open(CACHE_NAME);
        await cache.addAll(ASSETS);
        respond?.postMessage({status: 'ok'});
      } catch (err) {
        respond?.postMessage({status: 'error', error: err?.message || 'Failed to refresh cache'});
        throw err;
      }
    })());
  }
});

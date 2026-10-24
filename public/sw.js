const CACHE_NAME = 'flash-fm-pwa-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icone-192.png',
  '/icone-512.png',
  '/icone-maskable-192.png',
  '/icone-maskable-512.png',
  '/apple-touch-icon.png',
  '/img/logoFM.jpg'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (
    e.request.url.includes('/musicas/') || 
    e.request.url.includes('/voz_stream/') || 
    e.request.url.includes('.php') || 
    e.request.url.includes('firebaseio.com') ||
    e.request.url.includes('streamlabs.com')
  ) {
    return;
  }
  e.respondWith(
    caches.match(e.request).then((res) => res || fetch(e.request))
  );
});

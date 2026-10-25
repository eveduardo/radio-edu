const CACHE_NAME = 'flash-fm-pwa-v3';
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
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
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
  // Ignora áudio, streaming, backend PHP, Firebase e métodos não-GET
  if (
    e.request.method !== 'GET' ||
    e.request.url.includes('/musicas/') || 
    e.request.url.includes('/voz_stream/') || 
    e.request.url.includes('/vinhetas/') ||
    e.request.url.includes('.php') || 
    e.request.url.includes('firebaseio.com') ||
    e.request.url.includes('streamlabs.com')
  ) {
    return;
  }

  // Para navegação HTML (index.html): NETWORK-FIRST
  // Garante que o usuário SEMPRE receba a versão mais recente ao recarregar
  if (e.request.mode === 'navigate' || e.request.headers.get('accept')?.includes('text/html')) {
    e.respondWith(
      fetch(e.request)
        .then((networkRes) => {
          if (networkRes && networkRes.status === 200) {
            const clone = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
          }
          return networkRes;
        })
        .catch(() => caches.match(e.request).then((res) => res || caches.match('/index.html')))
    );
    return;
  }

  // Para demais recursos (JS, CSS, imagens): Network-first com fallback para cache
  e.respondWith(
    fetch(e.request)
      .then((networkRes) => {
        if (networkRes && networkRes.status === 200) {
          const clone = networkRes.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
        }
        return networkRes;
      })
      .catch(() => caches.match(e.request))
  );
});

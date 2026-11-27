const CACHE_VERSION = 'mercado-jesi-shell-v1';
const SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/assets/css/styles.css',
  '/assets/imagens/favicon.webp',
  '/assets/imagens/pwa-192.png',
  '/assets/imagens/pwa-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_VERSION).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('mercado-jesi-') && key !== CACHE_VERSION).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // Nunca intercepta Supabase, Mercado Pago, ViaCEP ou outras APIs externas.
  if (url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then(response => {
      if (response.ok) caches.open(CACHE_VERSION).then(cache => cache.put(request, response.clone()));
      return response;
    }).catch(async () => (await caches.match(request)) || caches.match('/index.html')));
    return;
  }
  if (!url.pathname.startsWith('/assets/') && url.pathname !== '/manifest.webmanifest') return;
  event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
    if (response.ok) caches.open(CACHE_VERSION).then(cache => cache.put(request, response.clone()));
    return response;
  })));
});

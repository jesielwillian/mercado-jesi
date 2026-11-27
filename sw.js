const CACHE_VERSION = 'mercado-jesi-shell-v3';
const CACHE_PREFIX = 'mercado-jesi-';
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
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_VERSION)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // O painel administrativo nunca deve receber HTML da loja como fallback
  // nem arquivos antigos do cache do PWA.
  const isAdminRequest = url.pathname === '/admin' ||
    url.pathname.startsWith('/admin/') ||
    request.referrer.includes('/admin');
  if (isAdminRequest) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request, { cache: 'no-store' });
        if (response.ok) {
          const cache = await caches.open(CACHE_VERSION);
          await cache.put(request, response.clone());
        }
        return response;
      } catch {
        // Só usa o documento exato que foi solicitado; nunca troca uma rota
        // desconhecida por /index.html.
        return (await caches.match(request)) || Response.error();
      }
    })());
    return;
  }

  if (!url.pathname.startsWith('/assets/') && url.pathname !== '/manifest.webmanifest') return;

  // Network-first evita que CSS/JS antigos persistam após uma publicação.
  event.respondWith((async () => {
    try {
      const response = await fetch(request, { cache: 'no-store' });
      if (response.ok) {
        const cache = await caches.open(CACHE_VERSION);
        await cache.put(request, response.clone());
      }
      return response;
    } catch {
      return (await caches.match(request)) || Response.error();
    }
  })());
});

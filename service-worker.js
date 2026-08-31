const CACHE = 'money-pwa-v8.4.0';
const ASSETS = [
  './',
  './index.html',
  './style.css?v=8.4.0',
  './app.js?v=8.4.0',
  './manifest.json',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('money-pwa-') && k !== CACHE).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    try {
      const isShell =
        event.request.mode === 'navigate' ||
        /\/(?:index\.html|app\.js|style\.css|manifest\.json|version\.json)$/.test(url.pathname);
      const request = isShell ? new Request(event.request, {cache:'no-store'}) : event.request;
      const fresh = await fetch(request);
      const cache = await caches.open(CACHE);
      if(url.pathname.endsWith('/version.json') === false) cache.put(event.request, fresh.clone());
      return fresh;
    } catch (error) {
      const cached = await caches.match(event.request);
      if (cached) return cached;
      if (event.request.mode === 'navigate') return caches.match('./index.html');
      throw error;
    }
  })());
});

self.addEventListener('message', event => {
  if (!event.data) return;
  if (event.data.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data.type === 'PURGE_APP_CACHE') {
    event.waitUntil(
      caches.keys().then(keys =>
        Promise.all(keys.filter(k => k.startsWith('money-pwa-')).map(k => caches.delete(k)))
      )
    );
  }
});

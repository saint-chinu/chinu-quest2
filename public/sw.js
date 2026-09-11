const CACHE_NAME = 'chinuquest2-v287';
const APP_SHELL = ['./', './manifest.webmanifest', './icons/danballman-icon-192.png', './icons/danballman-icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;

  // HTML and JavaScript must never be served from an obsolete app-shell cache
  // while online. This is especially important for authentication fixes.
  const destination = event.request.destination;
  const isApplicationCode = event.request.mode === 'navigate' || destination === 'script' || destination === 'style';
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // status 206（音声のシークで飛んでくるRange応答）はcache.putが必ず投げる。
        // 握らないとSWが未処理のPromise拒否を出し続けるので、保存は素直に諦める。
        if (response.ok && response.status !== 206) {
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response.clone())).catch(() => {});
        }
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || (isApplicationCode ? caches.match('./') : undefined)))
  );
});

const CACHE_NAME = 'al-omda-shell-v4-__OMDA_ASSET_VERSION__';
const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest', '/favicon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(async (cache) => {
        await cache.addAll(APP_SHELL);
        // Cache every built route while online. Initial page assets may have
        // loaded before this worker first gained control of the page.
        const response = await fetch('/asset-manifest.json', { cache: 'no-store' });
        if (!response.ok) throw new Error('Offline asset manifest is unavailable');
        const manifest = await response.json();
        const paths = Object.values(manifest).flatMap((entry) => [entry.file, ...(entry.css || []), ...(entry.assets || [])]);
        const assets = [...new Set(paths.filter((path) => typeof path === 'string' && path.startsWith('assets/')).map((path) => '/' + path))];
        await cache.addAll(assets);
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('al-omda-shell-') && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            void caches.open(CACHE_NAME).then((cache) => cache.put('/', copy));
          }
          return response;
        })
        .catch(async () => (await caches.match(request)) || (await caches.match('/')) || Response.error())
    );
    return;
  }

  if (url.pathname.startsWith('/assets/') || APP_SHELL.includes(url.pathname)) {
    event.respondWith(
      caches.match(request).then(async (cached) => {
        // A missing old bundle can receive the SPA HTML fallback with status 200.
        // Never keep that HTML under a script/style asset key after deployment.
        const validAsset = response => !url.pathname.startsWith('/assets/') || !(response.headers.get('content-type') || '').includes('text/html');
        if (cached && validAsset(cached)) return cached;
        if (cached) await (await caches.open(CACHE_NAME)).delete(request);
        return fetch(request).then((response) => {
        if (!validAsset(response)) return Response.error();
        if (response.ok) {
          const copy = response.clone();
          void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      });
      })
    );
  }
});

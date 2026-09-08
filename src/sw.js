/* A user opts in from the help dialog. This caches only this app's static shell. */
const APP_BASE = new URL('./', self.location.href);
const CACHE_PREFIX = 'lucky-draw-' + encodeURIComponent(APP_BASE.pathname) + '-';
const CACHE_NAME = CACHE_PREFIX + '__BUILD_ID__';
const APP_HTML = new URL('index.html', APP_BASE).href;
const ASSETS = ['index.html', 'app.webmanifest', 'icon.svg'].map(path => new URL(path, APP_BASE).href);

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const responses = await Promise.all(ASSETS.map(async url => {
      const response = await fetch(url, { cache: 'reload', credentials: 'same-origin' });
      if (!response.ok || response.redirected) throw new Error('The app files were not available.');
      if (url === APP_HTML && !(await response.clone().text()).includes('name="lucky-draw-shell"')) throw new Error('Received a login or preview page instead of the app.');
      return [url, response];
    }));
    const cache = await caches.open(CACHE_NAME);
    for (const [url, response] of responses) await cache.put(url, response);
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME) await caches.delete(key);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== APP_BASE.origin) return;
  const isAppPage = request.mode === 'navigate' && (url.pathname === APP_BASE.pathname || url.pathname === new URL(APP_HTML).pathname);
  if (isAppPage) {
    event.respondWith((async () => {
      const cache=await caches.open(CACHE_NAME);
      const response=await cache.match(APP_HTML);
      return response || fetch(request);
    })());
  } else if (ASSETS.includes(url.href)) {
    event.respondWith((async () => {const cache=await caches.open(CACHE_NAME);return await cache.match(request) || fetch(request);})());
  }
});

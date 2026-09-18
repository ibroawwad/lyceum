// Lyceum service worker: the page itself is network-first (a refresh always gets the latest deploy; the
// cache is only the offline fallback). Fonts, CDN libraries and icons are cache-first.
const CACHE = 'lyceum-shell-v9';
const SHELL = ['./', './index.html', './lyceum.html', './icon-512.png', './icon-180.png'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(SHELL.map((u) => c.add(new Request(u, { cache: 'reload' })).catch(() => null)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.hostname === 'openrouter.ai' || url.hostname === 'r.jina.ai') return;
  const sameOrigin = url.origin === self.location.origin;
  const cdn = /fonts\.(googleapis|gstatic)\.com|cdnjs\.cloudflare\.com/.test(url.hostname);
  if (!sameOrigin && !cdn) return;
  const isPage = sameOrigin && (e.request.mode === 'navigate' || /\.html$|\/$/.test(url.pathname));
  if (isPage) {
    e.respondWith(fetch(new Request(e.request, { cache: 'no-cache' })).then((res) => { if (res && res.ok) caches.open(CACHE).then((c) => c.put(e.request, res.clone())); return res; }).catch(() => caches.match(e.request).then((hit) => hit || caches.match('./'))));
    return;
  }
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => { if (res && res.ok) caches.open(CACHE).then((c) => c.put(e.request, res.clone())); return res; })));
});

// Lyceum service worker: cache the app shell so the installed app opens offline.
// The app is one file; fonts and CDN libraries are cached on first use.
const CACHE = 'lyceum-shell-v3';
const SHELL = ['./', './lyceum.html', './index.html', './icon-512.png', './icon-180.png'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL).catch(() => null)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.hostname === 'openrouter.ai' || url.hostname === 'r.jina.ai') return; // never cache the faculty or fetched pages
  const sameOrigin = url.origin === self.location.origin;
  const cdn = /fonts\.(googleapis|gstatic)\.com|cdnjs\.cloudflare\.com/.test(url.hostname);
  if (!sameOrigin && !cdn) return;
  e.respondWith(caches.match(e.request).then((hit) => {
    const fetching = fetch(e.request).then((res) => { if (res && res.ok) caches.open(CACHE).then((c) => c.put(e.request, res.clone())); return res; }).catch(() => hit);
    return hit || fetching;
  }));
});

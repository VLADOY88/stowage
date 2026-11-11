const CACHE = 'stowage-v21';
const ASSETS = ['./', './index.html', './app.css', './app.js', './plan.js', './sop.js', './pdf.min.mjs', './pdf.worker.min.mjs', './jszip.min.js', './manifest.webmanifest', './locode.json', './deck5.png', './deck1-mask.png', './deck2-mask.png', './deck3-mask.png', './deck4-mask.png', './deck6-mask.png', './deck7-mask.png', './deck8-mask.png', './deck9-mask.png', './deck10-mask.png', './deck11-mask.png', './deck12-mask.png', './deck1.png', './deck2.png', './deck3.png', './deck4.png', './deck6.png', './deck7.png', './deck8.png', './deck9.png', './deck10.png', './deck11.png', './deck12.png',
  './jspdf.umd.min.js', './jspdf.plugin.autotable.min.js', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];
// Cache each file on its own, so one missing file never breaks offline use
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => Promise.all(ASSETS.map(a => c.add(new Request(a, { cache: 'reload' })).catch(() => { })))).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
// Cached copy first (instant, works offline); refresh the cache in the background when online.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(e.request, { ignoreSearch: true });
    const net = fetch(e.request).then(res => { if (res.ok) c.put(e.request, res.clone()); return res; }).catch(() => null);
    if (hit) { e.waitUntil(net); return hit; }
    return (await net) || (await c.match('./index.html'));
  }));
});

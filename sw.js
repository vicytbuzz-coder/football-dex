// Football Dex : mode hors ligne (page, scripts, frontières et fond de carte gardés en mémoire)
const APP = 'fdex-app-v1';
const TILES = 'fdex-tiles-v1';
const MAX_TILES = 600;
const SCRIPTS = [
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/topojson/3.0.2/topojson.min.js'
];
const BORDERS = 'https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-50m.json';
const CDN_HOSTS = ['cdnjs.cloudflare.com', 'cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(APP);
    await Promise.allSettled([
      c.add('./'),
      ...SCRIPTS.map(u => fetch(u, { mode: 'no-cors' }).then(r => c.put(u, r))),
      fetch(BORDERS).then(r => { if (r.ok) return c.put(BORDERS, r); })
    ]);
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keep = [APP, TILES];
    for (const k of await caches.keys()) if (!keep.includes(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (req.mode === 'navigate') return e.respondWith(networkFirst(req));
  if (url.hostname.endsWith('arcgisonline.com')) return e.respondWith(cacheFirst(req, TILES, true));
  if (url.origin === self.location.origin) return e.respondWith(staleWhileRevalidate(req));
  if (CDN_HOSTS.includes(url.hostname)) return e.respondWith(cacheFirst(req, APP, false));
});

// Page : toujours la version la plus récente si le réseau répond, sinon la copie gardée
async function networkFirst(req) {
  const c = await caches.open(APP);
  const net = fetch(req).then(r => { if (r.ok) c.put(req, r.clone()); return r; });
  const timeout = new Promise(res => setTimeout(() => res(null), 5000));
  try {
    const r = await Promise.race([net, timeout]);
    if (r) return r;
  } catch (err) {}
  const cached = (await c.match(req, { ignoreSearch: true })) || (await c.match('./'));
  if (cached) return cached;
  return net;
}

async function cacheFirst(req, name, trim) {
  const c = await caches.open(name);
  const hit = await c.match(req);
  if (hit) return hit;
  const r = await fetch(req);
  if (r.ok || r.type === 'opaque') {
    c.put(req, r.clone());
    if (trim && Math.random() < 0.05) trimCache(c);
  }
  return r;
}

async function staleWhileRevalidate(req) {
  const c = await caches.open(APP);
  const hit = await c.match(req);
  const net = fetch(req).then(r => { if (r.ok) c.put(req, r.clone()); return r; }).catch(() => hit);
  return hit || net;
}

async function trimCache(c) {
  const keys = await c.keys();
  if (keys.length > MAX_TILES) {
    await Promise.all(keys.slice(0, keys.length - MAX_TILES).map(k => c.delete(k)));
  }
}

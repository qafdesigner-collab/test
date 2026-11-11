/* Knowledge Gate service worker: installable app + offline reading.
 * - App code (/_next/static) is cached as it is used.
 * - Pages and a few read-only API answers are network-first, with the last copy kept for offline use.
 * - Books saved for offline use live in their own cache (written by the page, see lib/offline.ts).
 * - Signing out removes every cached answer and saved book from this device. */
const VERSION = 'v1';
const STATIC = `kg-static-${VERSION}`, PAGES = 'kg-pages', API = 'kg-api', BOOKS = 'kg-books';
const API_KEEP = [/^\/api\/auth\/me$/, /^\/api\/branding$/, /^\/api\/library$/, /^\/api\/reader\/editions\/[0-9a-f-]+$/, /^\/api\/reader\/components\/[0-9a-f-]+\/hotspots$/, /^\/api\/timetable\/me$/, /^\/api\/student\/(home|achievements)$/];

self.addEventListener('install', (e) => { e.waitUntil(caches.open(STATIC).then((c) => c.addAll(['/offline.html', '/icon-192.png', '/pdf.worker.min.mjs']))); self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('kg-static-') && k !== STATIC).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

const wipe = () => Promise.all([API, BOOKS, PAGES].map((k) => caches.delete(k)));
self.addEventListener('message', (e) => { if (e.data === 'wipe') e.waitUntil(wipe()); });

async function networkFirst(req, cacheName, fallback) {
  try {
    const res = await fetch(req);
    if (res.ok) { const c = await caches.open(cacheName); c.put(req, res.clone()); }
    return res;
  } catch (err) {
    const hit = await caches.match(req, { ignoreVary: true });
    if (hit) return hit;
    if (fallback) return (await caches.match(fallback)) || Response.error();
    throw err;
  }
}

self.addEventListener('fetch', (e) => {
  const req = e.request; const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.method === 'POST' && url.pathname === '/api/auth/logout') { e.waitUntil(wipe()); return; }
  if (req.method !== 'GET') return;
  if (url.pathname.startsWith('/_next/static/') || /^\/(icon|apple-touch-icon|pdf\.worker)/.test(url.pathname)) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => { if (res.ok) caches.open(STATIC).then((c) => c.put(req, res.clone())); return res; })));
    return;
  }
  if (url.pathname.startsWith('/api/')) { if (API_KEEP.some((r) => r.test(url.pathname))) e.respondWith(networkFirst(req, API)); return; }
  if (req.mode === 'navigate') e.respondWith(networkFirst(req, PAGES, '/offline.html'));
});

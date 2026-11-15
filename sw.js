/* Mesh service worker: network first, cached app shell as the offline fallback.
   Only the app's own code is cached — never music, artwork or .mesh files (those are read from your folder). */
const CACHE = 'mesh-2.0.0';
const SHELL = ['./', 'index.html', 'css/mesh.css', 'js/util.js', 'js/keyrules.js', 'js/flactags.js', 'js/scheme.js', 'js/accent.js',
  'js/library.js', 'js/meshstore.js', 'js/suggest.js', 'js/app.js', 'js/views.js', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); } return r; })
    .catch(() => caches.match(e.request).then(r => r || caches.match('index.html'))));
});

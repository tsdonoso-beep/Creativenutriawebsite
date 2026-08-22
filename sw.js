// Service worker: cachea el armazón para que la app abra sin señal.
// Las llamadas a Supabase nunca se cachean — datos viejos servidos como
// frescos serían peor que un error honesto. De esos se encarga la cola.

const CACHE = 'nutria-v1';
const ARMAZON = [
  './', './index.html', './app.css', './manifest.json',
  './js/app.js', './js/api.js', './js/cola.js', './js/config.js', './js/iconos.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png',
];

self.addEventListener('install', (ev) => {
  ev.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ARMAZON))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (ev) => {
  const url = new URL(ev.request.url);

  // Todo lo que va a Supabase pasa de largo
  if (url.origin !== self.location.origin) return;
  if (ev.request.method !== 'GET') return;

  // Del caché primero, y de paso se refresca por detrás
  ev.respondWith(
    caches.match(ev.request).then((guardada) => {
      const red = fetch(ev.request).then((r) => {
        if (r.ok) caches.open(CACHE).then((c) => c.put(ev.request, r.clone()));
        return r;
      }).catch(() => guardada);
      return guardada || red;
    }),
  );
});

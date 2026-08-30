// Service worker: la app abre sin señal, pero sin quedarse atrás.
//
// La primera versión servía del caché y actualizaba por detrás, así que un
// arreglo recién publicado no se veía hasta la segunda apertura. Para una app
// en la que se corrigen cosas seguido eso es una trampa: pruebas algo que
// todavía no tienes. Ahora el armazón va primero a la red y el caché queda
// como respaldo para cuando no hay señal. Son cinco archivos de unos pocos KB;
// la frescura vale más que los milisegundos que ahorraría.
//
// Las llamadas a Supabase nunca se cachean: datos viejos servidos como frescos
// serían peor que un error honesto. De esos se encarga la cola.

const CACHE = 'nutria-v2';
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

  // Red primero, y si no hay, lo guardado
  ev.respondWith(
    fetch(ev.request)
      .then((r) => {
        if (r.ok) {
          const copia = r.clone();
          caches.open(CACHE).then((c) => c.put(ev.request, copia));
        }
        return r;
      })
      .catch(() => caches.match(ev.request).then((g) => g || caches.match('./index.html'))),
  );
});

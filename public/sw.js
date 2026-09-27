/*
 * Service worker de la app de escribir.
 *
 * Solo se ocupa de que el editor abra sin conexión y de que sus recursos no se
 * vuelvan a descargar en cada arranque. Todo lo demás —el sitio público, y
 * sobre todo `api.github.com`— pasa de largo hacia la red: cachear una
 * publicación o el listado de entradas serviría datos viejos.
 *
 * Al cambiar VERSION se descartan las cachés anteriores.
 */
const VERSION = 'v1';
const CACHE = `escribir-${VERSION}`;

// El esqueleto mínimo para que la app abra estando sin cobertura.
const ESQUELETO = [
  '/editor/',
  '/manifest.webmanifest',
  '/app/icono-192.png',
  '/app/icono-512.png',
  '/favicon.svg',
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(CACHE)
      // Si algo del esqueleto falla, la instalación sigue: es preferible una
      // app sin parte de la caché a una app que no se instala.
      .then((cache) => Promise.allSettled(ESQUELETO.map((u) => cache.add(u))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((nombres) => Promise.all(
        nombres.filter((n) => n.startsWith('escribir-') && n !== CACHE).map((n) => caches.delete(n)),
      ))
      .then(() => self.clients.claim()),
  );
});

/** Los recursos con huella en el nombre no cambian nunca: caché primero. */
const esEstatico = (url) =>
  url.pathname.startsWith('/_astro/') ||
  url.pathname.startsWith('/app/') ||
  url.pathname.startsWith('/assets/img/');

self.addEventListener('fetch', (evento) => {
  const peticion = evento.request;
  if (peticion.method !== 'GET') return;

  const url = new URL(peticion.url);
  if (url.origin !== self.location.origin) return;

  // Navegar: red primero, para no servir un editor viejo; la caché es el
  // paracaídas cuando no hay conexión.
  if (peticion.mode === 'navigate') {
    evento.respondWith(
      fetch(peticion)
        .then((respuesta) => {
          const copia = respuesta.clone();
          caches.open(CACHE).then((cache) => cache.put(peticion, copia));
          return respuesta;
        })
        .catch(() => caches.match(peticion).then((hit) => hit ?? caches.match('/editor/'))),
    );
    return;
  }

  if (esEstatico(url)) {
    evento.respondWith(
      caches.match(peticion).then((hit) => {
        if (hit) return hit;
        return fetch(peticion).then((respuesta) => {
          if (respuesta.ok) {
            const copia = respuesta.clone();
            caches.open(CACHE).then((cache) => cache.put(peticion, copia));
          }
          return respuesta;
        });
      }),
    );
  }
});

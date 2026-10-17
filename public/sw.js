// Service worker de El Fortín: permite instalar el sitio como app y verlo sin conexión (en la cancha no siempre hay señal).
// - Páginas y datos (data/…): primero la red (sin la copia del navegador); si no hay, lo último guardado.
// - JS, CSS, íconos y tipografías: lo guardado (los archivos de Vite llevan hash: uno nuevo es otra URL).
// - ESPN y el resto de los sitios externos no pasan por acá: los datos en vivo siempre son en vivo.
// Para forzar que todos borren lo guardado, cambiar VERSION.
const VERSION = 'v2';
const CACHE = `fortin-${VERSION}`;
const PAGES = ['./', 'partidos.html', 'plantel.html', 'historial.html', 'club.html', 'juegos.html'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll([...PAGES, 'manifest.webmanifest', 'assets/icons/icon-192.png'])).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('fortin-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    // cache: 'no-cache' = preguntarle siempre al servidor (GitHub Pages deja guardar 10 min): así un deploy nuevo se
    // ve enseguida, también en la app instalada.
    const res = await fetch(request, { cache: 'no-cache' });
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(request, { ignoreSearch: request.mode === 'navigate' });
    if (hit) return hit;
    if (request.mode === 'navigate') return (await cache.match('./')) ?? Response.error();
    throw err;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok || res.type === 'opaque') cache.put(request, res.clone());
  return res;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const fonts = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (url.origin !== self.location.origin && !fonts) return;
  if (fonts || /\/assets\//.test(url.pathname)) event.respondWith(cacheFirst(request));
  else event.respondWith(networkFirst(request));
});

// Service worker de El Fortín: permite instalar el sitio como app y verlo sin conexión o con mala señal (en la cancha).
// - Al instalarse guarda las 8 páginas, el manifest, los íconos y el JS/CSS de todas (PRECACHE): una página que nunca
//   se visitó también funciona sin conexión. La lista la escribe el build (scripts/prerender.mjs) entre los marcadores;
//   acá queda una mínima para que el archivo sirva sin procesar. El 3D del estadio (Three.js, ~590 KB) no se precarga:
//   se guarda recién cuando se visita Club › Estadio (ON_DEMAND = archivos vigentes que se guardan solo si se piden).
// - Páginas y datos (data/…): primero la red (sin la copia del navegador), con un límite de 3 s: si la red no contestó
//   y hay copia guardada, se muestra la copia y la red sigue de fondo actualizándola. Sin copia se espera a la red.
//   Sin conexión, o si el servidor falla (5xx): lo último guardado; para una página, como último recurso el Inicio.
// - Las páginas se guardan sin la query: jugador.html?id=… e historial.html?rival=… son una sola copia cada una.
// - JS, CSS, íconos, tipografías y miniaturas de noticias: lo guardado (los archivos de Vite llevan hash: uno nuevo es
//   otra URL). De las miniaturas quedan las últimas 40.
// - ESPN y el resto de los sitios externos no pasan por acá: los datos en vivo siempre son en vivo.
// - El nombre del caché no cambia con cada build (se perderían los datos guardados). Cuando cambian los hashes cambia
//   la lista, el navegador instala este archivo de nuevo y al activarse borra de assets/ lo que ya no está en la lista.
// Para forzar que todos borren lo guardado, cambiar VERSION.
const VERSION = 'v3';
const CACHE = `fortin-${VERSION}`;
const PRECACHE = /*precarga:*/ ['./', 'partidos.html', 'plantel.html', 'historial.html', 'juegos.html', 'club.html', 'jugador.html', 'vivo.html', 'manifest.webmanifest', 'assets/icons/icon-192.png'] /*:precarga*/;
const ON_DEMAND = /*a-pedido:*/ [] /*:a-pedido*/;

const TIMEOUT_MS = 3000;
const NEWS_IMG = 'data/generated/img/news/';
const NEWS_MAX = 40;
const SCOPE = new URL('./', self.location.href).href; // sw.js está en la raíz del sitio (…/el-fortin/)
const BUILT = PRECACHE.some((p) => /^assets\/[^/]+\.(js|css)$/.test(p)); // ¿la lista la escribió el build?
const MATCH = { ignoreVary: true }; // GitHub Pages manda «Vary: Accept-Encoding»: acá hay una sola copia por URL

// Baja lo que falta de PRECACHE. Tolera fallas (con mala señal se guarda lo que llegue) y avisa si quedó completa.
// Las páginas se bajan siempre: tienen que coincidir con el JS/CSS nuevo. Lo de assets/ que ya está no se vuelve a bajar.
let precaching;
function precache() {
  precaching ??= (async () => {
    const cache = await caches.open(CACHE);
    const done = await Promise.all(
      PRECACHE.map(async (path) => {
        try {
          if (path.startsWith('assets/') && (await cache.match(path, MATCH))) return true;
          const res = await fetch(path, { cache: 'no-cache' });
          if (!res.ok) return false;
          await cache.put(path, res);
          return true;
        } catch {
          return false;
        }
      }),
    );
    return done.every(Boolean);
  })();
  return precaching;
}

// JS/CSS con hash viejo (y cualquier otra cosa de assets/ que ya no exista). El 3D del estadio vigente se queda.
async function dropOldAssets(cache) {
  const keep = new Set([...PRECACHE, ...ON_DEMAND].map((p) => new URL(p, SCOPE).href));
  const keys = await cache.keys();
  await Promise.all(keys.filter((r) => r.url.startsWith(`${SCOPE}assets/`) && !keep.has(r.url)).map((r) => cache.delete(r)));
}

// Las miniaturas de noticias cambian todas las semanas: quedan las últimas (keys() las da en el orden en que entraron).
async function trimNews(cache) {
  const keys = (await cache.keys()).filter((r) => r.url.startsWith(SCOPE + NEWS_IMG));
  await Promise.all(keys.slice(0, Math.max(0, keys.length - NEWS_MAX)).map((r) => cache.delete(r)));
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache());
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const names = await caches.keys();
        await Promise.all(names.filter((k) => k.startsWith('fortin-') && k !== CACHE).map((k) => caches.delete(k)));
        const cache = await caches.open(CACHE);
        // Solo si la precarga quedó completa: si una página no se pudo bajar, la copia vieja todavía usa el JS viejo.
        if (BUILT && (await precache())) await dropOldAssets(cache);
        await trimNews(cache);
      } catch {
        // la limpieza puede esperar a la próxima versión
      }
      await self.clients.claim();
    })(),
  );
});

// Clave de una página: la ruta sin query, y el Inicio siempre como «./» (…/, …/index.html y …/?app=1 son lo mismo).
const pageKey = (url) => new URL(url).pathname.replace(/\/index\.html$/, '/');

async function networkFirst(event, timeoutMs = TIMEOUT_MS) {
  const { request } = event;
  const cache = await caches.open(CACHE);
  const nav = request.mode === 'navigate';
  const key = nav ? pageKey(request.url) : request;
  // cache: 'no-cache' = preguntarle siempre al servidor (GitHub Pages deja guardar 10 min): así un deploy nuevo se
  // ve enseguida, también en la app instalada. Una respuesta con error no pisa la copia buena.
  const fromNet = fetch(request, { cache: 'no-cache' }).then((res) => {
    if (res.ok) event.waitUntil(cache.put(key, res.clone()).catch(() => {}));
    return res;
  });
  event.waitUntil(fromNet.catch(() => {})); // si ganó la copia, la red sigue de fondo y la actualiza
  const copy = () => cache.match(key, MATCH);
  const slow = new Promise((resolve) => setTimeout(resolve, timeoutMs)).then(copy);
  try {
    const res = (await Promise.race([fromNet, slow])) ?? (await fromNet); // sin copia: esperar a la red
    if (res.status >= 500) return (await copy()) ?? res; // el servidor anda mal: mejor lo último guardado
    return res;
  } catch {
    // Sin conexión: la copia; una página que no está guardada cae en el Inicio (solo acá: con red lenta se espera).
    return (await copy()) ?? (nav ? await cache.match('./', MATCH) : undefined) ?? Response.error();
  }
}

async function cacheFirst(event) {
  const { request } = event;
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request, MATCH);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok || res.type === 'opaque') {
    const news = request.url.startsWith(SCOPE + NEWS_IMG);
    event.waitUntil(
      cache
        .put(request, res.clone())
        .then(() => news && trimNews(cache))
        .catch(() => {}),
    );
  }
  return res;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const fonts = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (url.origin !== self.location.origin && !fonts) return;
  // Las miniaturas llevan la clave de la nota en el nombre: no cambian, así que tampoco hace falta volver a pedirlas.
  if (fonts || /\/assets\//.test(url.pathname) || url.href.startsWith(SCOPE + NEWS_IMG)) event.respondWith(cacheFirst(event));
  else event.respondWith(networkFirst(event));
});

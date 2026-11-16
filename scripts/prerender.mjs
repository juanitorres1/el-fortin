// Prerender: después de `vite build`, escribe en dist/<página>.html el contenido ya dibujado con los datos que acaba
// de bajar el deploy, más esos datos en <script id="initial-data">. Así el contenido se ve apenas llega el HTML, sin
// esperar a React ni a ESPN; después React hidrata esa misma página y la actualiza en vivo.
// Si falta algún dato (por ejemplo, sin `npm run data`), esa parte sale como esqueleto y carga en el navegador.
// Al final escribe en dist/sw.js la lista de archivos que la app guarda al instalarse (los nombres con hash de este build).
// Uso: node scripts/prerender.mjs (lo corre `npm run build`).
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PAGES } from '../src/site.js';

const ROOT = new URL('../', import.meta.url);
const DIST = new URL('dist/', ROOT);
const GENERATED = 'data/generated/';

// Qué datos lleva cada página (los mismos que pide en el navegador). El historial no lleva nada: sus partidos pesan
// 570 KB y se siguen bajando aparte; su HTML trae la estructura y los esqueletos.
const PAGE_DATA = {
  inicio: { live: true, json: [`${GENERATED}facts.json`, `${GENERATED}news.json`, `${GENERATED}resumen.json`] },
  partidos: { live: true, json: [`${GENERATED}promedios.json`, `${GENERATED}games.json`, `${GENERATED}playoffs.json`] }, // games: Vélez en cifras; playoffs: el cuadro
  plantel: { json: [`${GENERATED}players.json`, `${GENERATED}games.json`], roster: true }, // games: vallas invictas
  historial: {},
  club: { json: ['data/club.json'] },
  juegos: { live: true, json: ['data/club.json', `${GENERATED}games.json`], roster: true }, // los juegos nuevos piden sus datos al abrirlos
  jugador: { json: [`${GENERATED}players.json`, `${GENERATED}games.json`], roster: true }, // el jugador sale de ?id= al abrir
  vivo: { live: true, json: [`${GENERATED}promedios.json`] },
};

async function readJson(path) {
  try {
    return JSON.parse(await readFile(new URL(`public/${path}`, ROOT), 'utf8'));
  } catch {
    return undefined;
  }
}

/** Datos iniciales de una página (lo que lee src/initial.js). */
export async function initialFor(key, renderedAt = Date.now()) {
  const spec = PAGE_DATA[key] ?? {};
  const snapshot = spec.live || spec.roster ? await readJson(`${GENERATED}snapshot.json`) : undefined;
  const json = {};
  for (const url of spec.json ?? []) {
    const data = await readJson(url);
    if (data !== undefined) json[url] = data;
  }
  const out = { renderedAt, json };
  if (spec.live && snapshot) {
    const { roster, ...live } = snapshot; // el plantel no hace falta en Inicio ni Partidos
    out.live = live;
  }
  if (spec.roster && snapshot?.roster) out.extra = { roster: snapshot.roster };
  return out;
}

// JSON dentro de <script>: «<» escapado para que un texto con «</script>» no pueda cortar la etiqueta.
const scriptJson = (data) => JSON.stringify(data).replace(/</g, '\\u003c');

/** Reemplaza el contenido de <div id="root"> por `body` y agrega los datos iniciales. */
export function inject(html, body, initial) {
  const re = /<div id="root">[\s\S]*?<\/div>(?=\s*<\/body>|\s*<script)/;
  if (!re.test(html)) throw new Error('No encontré <div id="root"> en el HTML');
  return html.replace(re, () => `<div id="root">${body}</div>\n    <script id="initial-data" type="application/json">${scriptJson(initial)}</script>`);
}

// Lo que no se precarga aunque esté en dist/assets/: el 3D del estadio (Three.js, ~590 KB, solo lo usa Club › Estadio)
// y la imagen para compartir (la piden las redes, no la página).
const NOT_PRECACHED = /^assets\/(estadio-scene-[^/]+\.js|og\.png)$/;

/**
 * Listas del service worker (public/sw.js) a partir de las páginas y de los archivos de dist/assets/ (rutas relativas
 * a dist, con «/»): `precache` = lo que se guarda al instalar la app (las páginas, el manifest, los íconos y el JS/CSS
 * de todas) y `onDemand` = archivos vigentes que se guardan recién cuando se piden.
 */
export function precacheLists(pages, assets) {
  const files = [...new Set(assets)].filter((f) => /^assets\/.+\.(js|css|png|svg|webp|woff2)$/.test(f)).sort();
  return {
    precache: [...pages.map((p) => (p.file === 'index.html' ? './' : p.file)), 'manifest.webmanifest', ...files.filter((f) => !NOT_PRECACHED.test(f))],
    onDemand: files.filter((f) => NOT_PRECACHED.test(f)),
  };
}

/** Escribe las listas en sw.js, entre los marcadores (que quedan: se puede volver a correr sobre el resultado). */
export function injectPrecache(sw, { precache, onDemand }) {
  const fill = (source, name, list) => {
    const re = new RegExp(`/\\*${name}:\\*/[\\s\\S]*?/\\*:${name}\\*/`);
    if (!re.test(source)) throw new Error(`No encontré el marcador /*${name}:*/ en sw.js`);
    return source.replace(re, () => `/*${name}:*/ ${JSON.stringify(list)} /*:${name}*/`);
  };
  return fill(fill(sw, 'precarga', precache), 'a-pedido', onDemand);
}

async function writeServiceWorker() {
  const assets = (await readdir(new URL('assets/', DIST), { recursive: true, withFileTypes: true }))
    .filter((e) => e.isFile())
    .map((e) => relative(fileURLToPath(DIST), join(e.parentPath ?? e.path, e.name)).replaceAll('\\', '/'));
  const lists = precacheLists(PAGES, assets);
  const file = new URL('sw.js', DIST);
  await writeFile(file, injectPrecache(await readFile(file, 'utf8'), lists));
  console.log(`prerender: sw.js (precarga: ${lists.precache.length} archivos; a pedido: ${lists.onDemand.join(', ') || 'ninguno'})`);
}

async function main() {
  const { renderPage } = await import(new URL('dist-ssr/prerender.js', ROOT).href);
  const renderedAt = Date.now();
  for (const page of PAGES) {
    const file = new URL(page.file, DIST);
    const initial = await initialFor(page.key, renderedAt);
    const body = renderPage(page.key, initial);
    await writeFile(file, inject(await readFile(file, 'utf8'), body, initial));
    console.log(`prerender: ${page.file} (${Math.round(body.length / 1024)} KB de HTML, datos: ${Object.keys(initial.json).length + (initial.live ? 1 : 0) + (initial.extra ? 1 : 0)})`);
  }
  await writeServiceWorker();
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

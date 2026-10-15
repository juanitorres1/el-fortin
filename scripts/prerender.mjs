// Prerender: después de `vite build`, escribe en dist/<página>.html el contenido ya dibujado con los datos que acaba
// de bajar el deploy, más esos datos en <script id="initial-data">. Así el contenido se ve apenas llega el HTML, sin
// esperar a React ni a ESPN; después React hidrata esa misma página y la actualiza en vivo.
// Si falta algún dato (por ejemplo, sin `npm run data`), esa parte sale como esqueleto y carga en el navegador.
// Uso: node scripts/prerender.mjs (lo corre `npm run build`).
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { PAGES } from '../src/site.js';

const ROOT = new URL('../', import.meta.url);
const DIST = new URL('dist/', ROOT);
const GENERATED = 'data/generated/';

// Qué datos lleva cada página (los mismos que pide en el navegador). El historial no lleva nada: sus partidos pesan
// 570 KB y se siguen bajando aparte; su HTML trae la estructura y los esqueletos.
const PAGE_DATA = {
  inicio: { live: true, json: [`${GENERATED}facts.json`, `${GENERATED}news.json`, `${GENERATED}resumen.json`] },
  partidos: { live: true, json: [`${GENERATED}promedios.json`, `${GENERATED}players.json`] },
  plantel: { json: [`${GENERATED}players.json`], roster: true },
  historial: {},
  club: { json: ['data/club.json'] },
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
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

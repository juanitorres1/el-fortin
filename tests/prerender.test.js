import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { initialFor, inject, injectPrecache, precacheLists } from '../scripts/prerender.mjs';
import { PAGES } from '../src/site.js';

const BUILT = `<!doctype html>
<html><head><script type="module" src="./assets/x.js"></script></head>
  <body>
    <div id="root"><noscript><p>Necesita JavaScript.</p></noscript></div>
  </body>
</html>`;

test('inject pone el contenido en #root y agrega los datos iniciales', () => {
  const out = inject(BUILT, '<main>hola</main>', { renderedAt: 1, json: {} });
  assert.match(out, /<div id="root"><main>hola<\/main><\/div>/);
  assert.match(out, /<script id="initial-data" type="application\/json">\{"renderedAt":1,"json":\{\}\}<\/script>/);
  assert.doesNotMatch(out, /noscript/);
  assert.match(out, /<script type="module" src="\.\/assets\/x\.js"><\/script>/); // el resto del HTML queda igual
});

test('inject: un «</script>» en los datos no puede cortar la etiqueta', () => {
  const out = inject(BUILT, '', { texto: '</script><script>alert(1)</script>' });
  assert.equal(out.match(/<\/script>/g).length, 2); // la del módulo y la de los datos, nada más
  assert.match(out, /\\u003c\/script>/);
});

test('inject: $ en el contenido no se interpreta como reemplazo', () => {
  assert.match(inject(BUILT, '<p>$& $1 US$7</p>', {}), /<p>\$& \$1 US\$7<\/p>/);
});

test('inject falla si el HTML no tiene #root', () => {
  assert.throws(() => inject('<html><body></body></html>', '', {}), /root/);
});

test('initialFor: cada página lleva solo sus datos; el historial ninguno', async () => {
  const club = await initialFor('club', 123);
  assert.equal(club.renderedAt, 123);
  assert.deepEqual(Object.keys(club.json), ['data/club.json']); // está en el repo
  assert.equal(club.live, undefined);
  const historial = await initialFor('historial', 123);
  assert.deepEqual(historial, { renderedAt: 123, json: {} });
});

// Como sale de recorrer dist/assets/ (con repetidos y desordenado a propósito).
const ASSETS = ['assets/ui-AAA.js', 'assets/ui-BBB.css', 'assets/club-CCC.js', 'assets/estadio-scene-DDD.js', 'assets/og.png', 'assets/v.svg', 'assets/icons/icon-192.png', 'assets/ui-AAA.js', 'assets/ui-AAA.js.map'];

test('precacheLists: las 8 páginas, el manifest, los íconos y el JS/CSS; el 3D del estadio queda a pedido', () => {
  const { precache, onDemand } = precacheLists(PAGES, ASSETS);
  assert.deepEqual(precache.slice(0, 9), ['./', 'partidos.html', 'plantel.html', 'historial.html', 'juegos.html', 'club.html', 'jugador.html', 'vivo.html', 'manifest.webmanifest']);
  assert.deepEqual(precache.slice(9), ['assets/club-CCC.js', 'assets/icons/icon-192.png', 'assets/ui-AAA.js', 'assets/ui-BBB.css', 'assets/v.svg']);
  assert.deepEqual(onDemand, ['assets/estadio-scene-DDD.js', 'assets/og.png']);
  assert.ok(precache.every((p) => !/^[/.]\S/.test(p) || p === './'), 'rutas relativas al sitio, sin «/» ni «./» adelante');
});

test('injectPrecache escribe las listas en el sw.js del repo, que sigue siendo JS válido', async () => {
  const sw = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
  new vm.Script(sw); // sin procesar también tiene que servir
  const lists = precacheLists(PAGES, ASSETS);
  const out = injectPrecache(sw, lists);
  new vm.Script(out);
  assert.ok(out.includes(`const PRECACHE = /*precarga:*/ ${JSON.stringify(lists.precache)} /*:precarga*/;`));
  assert.ok(out.includes('const ON_DEMAND = /*a-pedido:*/ ["assets/estadio-scene-DDD.js","assets/og.png"] /*:a-pedido*/;'));
  assert.equal(out.replace(/\/\*(precarga|a-pedido):\*\/.*?\/\*:\1\*\//g, ''), sw.replace(/\/\*(precarga|a-pedido):\*\/.*?\/\*:\1\*\//g, '')); // el resto queda igual
  // Con otro build (otros hashes) se puede correr sobre el resultado: no se acumula nada.
  const next = precacheLists(PAGES, ['assets/ui-ZZZ.js']);
  assert.equal(injectPrecache(out, next), injectPrecache(sw, next));
});

test('injectPrecache falla si sw.js no tiene los marcadores', () => {
  assert.throws(() => injectPrecache('const PRECACHE = [];', { precache: [], onDemand: [] }), /precarga/);
});

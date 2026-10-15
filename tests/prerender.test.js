import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialFor, inject } from '../scripts/prerender.mjs';

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

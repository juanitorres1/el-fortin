import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeBody, factsIn, noteLinks, parseNote, unsupportedFacts } from '../scripts/news.mjs';

test('noteLinks toma links a notas con su fecha y sin duplicados', () => {
  const html = `<a href="/futbol/notas/2026/10/13/164448_manu-lanzini">x</a>
    <a href="https://velez.com.ar/club/notas/2026/10/12/1_cuota">y</a><a href="/futbol/notas/2026/10/13/164448_manu-lanzini">z</a>
    <a href="/futbol">no</a>`;
  assert.deepEqual(noteLinks(html).map((l) => [l.section, l.date]), [['futbol', '2026-10-13'], ['club', '2026-10-12']]);
});

test('parseNote saca título sin «/ Vélez Sarsfield», bajada y párrafos del cuerpo', () => {
  const html = `<meta property="og:title" content="Manu Lanzini sigue en el Fort&iacute;n  / V&eacute;lez Sarsfield">
    <meta property="og:description" content="Renov&oacute; hasta 2027.">
    <p>Menú que no es parte de la nota pero es un texto bastante largo para pasar el filtro</p>
    <div class="nxl-noticia nxl-cuerpo"><p>Manuel Lanzini firm&oacute; su contrato hasta el 31 de diciembre de 2027 en Liniers.</p><p>corto</p></div>`;
  const n = parseNote(html);
  assert.equal(n.title, 'Manu Lanzini sigue en el Fortín');
  assert.equal(n.lead, 'Renovó hasta 2027.');
  assert.equal(n.body, 'Manuel Lanzini firmó su contrato hasta el 31 de diciembre de 2027 en Liniers.');
});

test('decodeBody respeta el charset de la cabecera HTTP', () => {
  const latin1 = Buffer.from('Vélez', 'latin1');
  assert.equal(decodeBody(latin1, 'text/html;charset=iso-8859-1'), 'Vélez');
});

test('factsIn encuentra montos, horas, fechas y resultados', () => {
  assert.deepEqual(factsIn('La cuota pasa a $15.000 desde el 1/11; juega a las 20:30 y ganó 3-1 en 2026.'), ['15.000', '1/11', '20:30', '3-1', '2026']);
});

test('unsupportedFacts descarta datos que no están en la nota y acepta variantes de formato', () => {
  const nota = 'La cuota social será de $ 15000 a partir del 1/11. Vélez ganó 3 a 1.';
  assert.deepEqual(unsupportedFacts('La cuota sube a $15.000 desde el 1/11 y Vélez ganó 3-1.', nota), []);
  assert.deepEqual(unsupportedFacts('La cuota sube a $18.000.', nota), ['18.000']);
  assert.deepEqual(unsupportedFacts('Sin números en este punto.', nota), []);
});

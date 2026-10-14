import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeBody, factsIn, noteLinks, numberWordsIn, parseNote, rankNotes, unsupportedFacts } from '../scripts/news.mjs';
import { isOfficialImageUrl, isOfficialNoteUrl, matchFacts, relativeDay } from '../js/news.js';

test('noteLinks toma links a notas con su fecha y sin duplicados', () => {
  const html = `<a href="/futbol/notas/2026/10/13/164448_manu-lanzini">x</a>
    <a href="https://velez.com.ar/club/notas/2026/10/12/1_cuota">y</a><a href="/futbol/notas/2026/10/13/164448_manu-lanzini">z</a>
    <a href="/futbol">no</a>`;
  assert.deepEqual(noteLinks(html).map((l) => [l.section, l.date]), [['futbol', '2026-10-13'], ['club', '2026-10-12']]);
});

test('parseNote saca título sin «/ Vélez Sarsfield», bajada y párrafos del cuerpo', () => {
  const html = `<meta property="og:title" content="Manu Lanzini sigue en el Fort&iacute;n  / V&eacute;lez Sarsfield">
    <meta property="og:description" content="Renov&oacute; hasta 2027.">
    <meta property="og:image" content="//velez.com.ar/img/noticias/26/1000794863.jpg" />
    <meta property="article:published_time" content="2026-10-13T16:41:00+00:00" />
    <p>Menú que no es parte de la nota pero es un texto bastante largo para pasar el filtro</p>
    <div class="nxl-noticia nxl-cuerpo"><p>Manuel Lanzini firm&oacute; su contrato hasta el 31 de diciembre de 2027 en Liniers.</p><p>corto</p></div>`;
  const n = parseNote(html);
  assert.equal(n.title, 'Manu Lanzini sigue en el Fortín');
  assert.equal(n.lead, 'Renovó hasta 2027.');
  assert.equal(n.body, 'Manuel Lanzini firmó su contrato hasta el 31 de diciembre de 2027 en Liniers.');
  assert.equal(n.image, 'https://velez.com.ar/img/noticias/26/1000794863.jpg');
  assert.equal(n.published, '2026-10-13T16:41:00+00:00');
});

test('isOfficialImageUrl solo acepta imágenes de velez.com.ar/img', () => {
  assert.equal(isOfficialImageUrl('https://velez.com.ar/img/noticias/26/1000794863.jpg'), true);
  assert.equal(isOfficialImageUrl('https://otro.com/img/x.jpg'), false);
  assert.equal(isOfficialImageUrl('https://velez.com.ar/img/x.jpg" onerror="alert(1)'), false);
  assert.equal(isOfficialImageUrl(null), false);
});

test('relativeDay: hoy, ayer, hace N días y fecha para lo más viejo', () => {
  const now = new Date('2026-10-14T15:00:00Z'); // 12:00 en Argentina
  assert.equal(relativeDay('2026-10-14', now), 'Hoy');
  assert.equal(relativeDay('2026-10-13', now), 'Ayer');
  assert.equal(relativeDay('2026-10-10', now), 'Hace 4 días');
  assert.equal(relativeDay('2026-10-01', now), '01/10');
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

test('números en palabras: se controlan contra la nota, en palabras o en cifras', () => {
  assert.deepEqual(numberWordsIn('Quedan cuatro partidos y Vélez está quinto; un gol en el primer tiempo.'), ['cuatro', 'quinto']);
  assert.deepEqual(unsupportedFacts('Quedan cuatro partidos.', 'apuntar a ganar los cuatro partidos que quedan'), []);
  assert.deepEqual(unsupportedFacts('Quedan cuatro partidos.', 'quedan 4 partidos'), []);
  assert.deepEqual(unsupportedFacts('Quedan 4 partidos.', 'quedan cuatro partidos'), []);
  assert.deepEqual(unsupportedFacts('Quedan cinco partidos.', 'quedan cuatro partidos'), ['cinco']);
  assert.deepEqual(unsupportedFacts('Terminó séptimo.', 'quedó en el quinto puesto'), ['septimo']);
});

test('rankNotes pone primero fútbol, DT y socios, y dentro de cada sección la más nueva', () => {
  const n = (section, date) => ({ section, date });
  const ranked = rankNotes([n('amateur', '2026-10-14'), n('futbol', '2026-10-12'), n('socios', '2026-10-10'), n('futbol', '2026-10-13'), n('columnadt', '2026-10-13')]);
  assert.deepEqual(ranked.map((x) => `${x.section} ${x.date}`), ['futbol 2026-10-13', 'futbol 2026-10-12', 'columnadt 2026-10-13', 'socios 2026-10-10', 'amateur 2026-10-14']);
});

test('matchFacts arma el último resultado de la semana y el próximo partido sin IA', () => {
  const side = (id, name, score) => ({ id, name, score });
  const now = new Date('2026-10-14T12:00:00Z');
  const results = [{ completed: true, date: '2026-10-12T19:00Z', comp: 'Liga Profesional', home: side('12', 'Lanús', 2), away: side('21', 'Vélez', 0) }];
  const fixture = [{ completed: false, date: '2026-10-17T23:00Z', timeValid: true, comp: 'Liga Profesional', venue: 'José Amalfitani', home: side('21', 'Vélez', null), away: side('11972', 'Gimnasia (Mendoza)', null) }];
  const [res, next] = matchFacts(fixture, results, now);
  assert.match(res.texto, /^Último resultado: Vélez perdió 2-0 con Lanús \(Liga Profesional, lunes 12\/10\)\.$/);
  assert.match(next.texto, /^Próximo partido: Vélez vs\. Gimnasia \(Mendoza\), sábado 17\/10 a las 20:00, en José Amalfitani \(Liga Profesional\)\.$/);
  // Un resultado de hace más de una semana no se informa.
  assert.equal(matchFacts([], results, new Date('2026-10-25T12:00:00Z')).length, 0);
});

test('isOfficialNoteUrl solo acepta notas de velez.com.ar', () => {
  assert.equal(isOfficialNoteUrl('https://velez.com.ar/futbol/notas/2026/10/13/164448_manu-lanzini-sigue-en-el-fortin'), true);
  assert.equal(isOfficialNoteUrl('https://velez.com.ar.evil.com/futbol/notas/2026/10/13/1_x'), false);
  assert.equal(isOfficialNoteUrl('javascript:alert(1)'), false);
  assert.equal(isOfficialNoteUrl('https://velez.com.ar/futbol/notas/2026/10/13/1_x"><script>'), false);
  assert.equal(isOfficialNoteUrl(undefined), false);
});

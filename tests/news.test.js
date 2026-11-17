import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPoints, canonFact, decodeBody, dropSuperseded, factsIn, magickArgs, mediumVariant, newNoteUrls, noteExcerpt, noteLinks, numberWordsIn, parseNote, rankNotes, resultRival, unsupportedFacts } from '../scripts/news.mjs';
import { isNewsImage, isOfficialImageUrl, isOfficialNoteUrl, matchFacts, newsPhotoSources, relativeDay } from '../src/lib/news.js';

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

test('mediumVariant pide la versión «md» de la foto y no la duplica', () => {
  assert.equal(mediumVariant('https://velez.com.ar/img/noticias/26/1000794863.jpg'), 'https://velez.com.ar/img/noticias/26/md/1000794863.jpg');
  assert.equal(mediumVariant('https://velez.com.ar/img/noticias/26/md/1000794863.jpg'), 'https://velez.com.ar/img/noticias/26/md/1000794863.jpg');
});

test('isNewsImage acepta miniaturas propias o imágenes oficiales, nada más', () => {
  assert.equal(isNewsImage('data/generated/img/news/0123456789abcdef-t.jpg'), true);
  assert.equal(isNewsImage('https://velez.com.ar/img/noticias/26/md/x.jpg'), true);
  assert.equal(isNewsImage('data/generated/img/news/../../club.json'), false);
  assert.equal(isNewsImage('https://evil.com/x.jpg'), false);
});

test('newNoteUrls: solo las notas que el resumen anterior no tuvo en cuenta', () => {
  const previous = { audit: { notes: [{ url: 'https://velez.com.ar/futbol/notas/2026/10/13/1_a' }] } };
  const urls = ['https://velez.com.ar/futbol/notas/2026/10/13/1_a', 'https://velez.com.ar/club/notas/2026/10/14/2_b'];
  assert.deepEqual(newNoteUrls(urls, previous), ['https://velez.com.ar/club/notas/2026/10/14/2_b']);
  assert.deepEqual(newNoteUrls(urls.slice(0, 1), previous), []);
  assert.deepEqual(newNoteUrls(urls, null), urls); // sin resumen anterior, todas son nuevas
});

// ---------- Informe nov-2026 ----------

// Párrafo real de la nota de la elección (velez.com.ar, 15/11/2026): la primera coma del texto no es la del 38,64.
const ELECCION = 'Cerca de 10.000 socias y socios participaron este domingo de las elecciones del Club, en una jornada en paz. '
  + 'En la elección de Comisión Directiva, Legado Velezano obtuvo 3.769 votos (38,64% de los votos a listas), seguido por ADN Azul y Blanco, con 2.978 (30,53%).';

test('unsupportedFacts: decimales con coma aunque la nota tenga otras comas antes (caso Pugliese)', () => {
  assert.deepEqual(unsupportedFacts('Legado Velezano ganó con 38,64% de los votos.', ELECCION), []);
  assert.deepEqual(unsupportedFacts('Legado Velezano ganó con 38.64 % de los votos.', ELECCION), []);
  assert.deepEqual(unsupportedFacts('Votaron 10000 socios y la lista sacó 3769 votos.', ELECCION), []);
  assert.deepEqual(unsupportedFacts('Legado Velezano sacó 38,46% de los votos.', ELECCION), ['38,46']);
  assert.deepEqual(unsupportedFacts('Obtuvo 3.796 votos.', ELECCION), ['3.796']);
});

test('canonFact iguala separadores de miles y decimales, y saca $ y %', () => {
  assert.equal(canonFact('15.000'), '15000');
  assert.equal(canonFact('15,000'), '15000');
  assert.equal(canonFact('$15.000'), '15000');
  assert.equal(canonFact('38,64'), '38.64');
  assert.equal(canonFact('38.64'), '38.64');
  assert.equal(canonFact('20:30'), '20:30');
  assert.equal(canonFact('3-1'), '3-1');
});

const note = (section, date, title, slug, extra = {}) => ({ section, date, title, url: `https://velez.com.ar/${section}/notas/${date.replaceAll('-', '/')}/${slug}`, lead: '', body: '', ...extra });

test('resultRival: el rival de una nota con marcador; sin marcador o sin Vélez, null', () => {
  assert.deepEqual(resultRival('Tigre 0-1 Vélez'), ['tigre']);
  assert.deepEqual(resultRival('Vélez 11-0 Huracán de Tres Arroyos'), ['huracan', 'tres', 'arroyos']);
  assert.equal(resultRival('En marcha la semana de playoffs'), null);
  assert.equal(resultRival('Boca 2-1 River'), null);
});

test('dropSuperseded: saca la previa del partido que ya tiene resultado y deja lo de después y lo de otras secciones', () => {
  const previa = note('reserva', '2026-11-09', 'Visita a Tigre por la Fecha 17', '1_se-viene-tigre', { published: '2026-11-09T15:00:00+00:00' });
  const resultado = note('reserva', '2026-11-11', 'Tigre 0-1 Vélez', '2_tigre-0-1-velez', { published: '2026-11-11T18:00:00+00:00' });
  const despues = note('reserva', '2026-11-11', 'Bravo: «Tigre nos exigió»', '3_bravo-tigre', { published: '2026-11-11T21:00:00+00:00' });
  const otraSeccion = note('futbol', '2026-11-10', 'Tigre, el rival del sábado', '4_tigre');
  const otroRival = note('reserva', '2026-11-10', 'Se viene Rosario Central', '5_central');
  const kept = dropSuperseded([previa, resultado, despues, otraSeccion, otroRival]);
  assert.deepEqual(kept.map((n) => n.url.split('/').pop()), ['2_tigre-0-1-velez', '3_bravo-tigre', '4_tigre', '5_central']);
  // Sin «published», alcanza con que la fecha sea anterior.
  const sinHora = [note('senior', '2026-11-10', 'Vélez recibe a Victoriano Arenas', '6_previa-victoriano-arenas'), note('senior', '2026-11-12', 'Vélez 2-1 Victoriano Arenas', '7_resultado')];
  assert.deepEqual(dropSuperseded(sinHora).map((n) => n.date), ['2026-11-12']);
});

test('noteExcerpt: bajada o primer párrafo, cortado en una oración si es largo', () => {
  assert.equal(noteExcerpt({ lead: 'Legado Velezano ganó las elecciones.', body: 'x' }), 'Legado Velezano ganó las elecciones.');
  assert.equal(noteExcerpt({ lead: '', body: 'Primer párrafo.\nSegundo.' }), 'Primer párrafo.');
  const largo = 'Una oración bastante larga sobre la Reserva y su partido. '.repeat(8);
  const corto = noteExcerpt({ lead: largo, body: '' });
  assert.ok(corto.length <= 300 && corto.endsWith('.'));
  assert.equal(noteExcerpt({ lead: '', body: '' }), '');
});

test('buildPoints: el punto que no pasa el control entra con la bajada de su nota, uno por nota, de la más nueva a la más vieja', () => {
  const notes = [
    note('club', '2026-11-15', 'Nelson Pugliese Presidente', '1_pugliese', { lead: 'Legado Velezano ganó las elecciones.', body: 'Obtuvo 3.769 votos.' }),
    note('entrenamiento', '2026-11-16', 'En marcha la semana de playoffs', '2_semana', { body: 'El plantel volvió a entrenar pensando en Belgrano.' }),
    note('reserva', '2026-11-11', 'Tigre 0-1 Vélez', '3_tigre', { body: 'Vélez venció 1-0 a Tigre por la Fecha 17.' }),
  ];
  const { checked, points, aiOk } = buildPoints([
    { nota: 1, texto: 'Pugliese ganó con el 41% de los votos.' }, // dato inventado: va la bajada
    { nota: 3, texto: 'La Reserva le ganó 1-0 a Tigre por la Fecha 17.' },
    { nota: 2, texto: 'El plantel arrancó la semana pensando en Belgrano.' },
    { nota: 3, texto: 'Otro punto de la misma nota.' },
    { nota: 9, texto: 'Nota que no existe.' },
  ], notes);
  assert.equal(checked.length, 5);
  assert.deepEqual(checked.filter((p) => !p.ok).map((p) => p.nota), [1, 9]);
  assert.equal(aiOk, 2);
  assert.deepEqual(points.map((p) => [p.fecha, p.origen, p.texto]), [
    ['2026-11-16', 'ia', 'El plantel arrancó la semana pensando en Belgrano.'],
    ['2026-11-15', 'nota', 'Legado Velezano ganó las elecciones.'],
    ['2026-11-11', 'ia', 'La Reserva le ganó 1-0 a Tigre por la Fecha 17.'],
  ]);
  assert.ok(points.every((p) => isOfficialNoteUrl(p.url) && p.titulo));
});

test('magickArgs: recorte centrado, JPEG progresivo y WebP sin -interlace', () => {
  assert.deepEqual(magickArgs('in.jpg', '400x225', 'out.jpg'), ['in.jpg', '-auto-orient', '-resize', '400x225^', '-gravity', 'center', '-extent', '400x225', '-strip', '-interlace', 'Plane', '-quality', '72', 'out.jpg']);
  const webp = magickArgs('in.jpg', '720x405', 'out.webp');
  assert.ok(!webp.includes('-interlace') && webp.at(-1) === 'out.webp' && webp.at(-2) === '70');
});

test('isNewsImage y newsPhotoSources: variantes de 400 y 720 en JPEG y WebP, y nada de afuera', () => {
  const base = 'data/generated/img/news/0123456789abcdef';
  assert.equal(isNewsImage(`${base}-m.webp`), true);
  assert.equal(isNewsImage(`${base}-f.webp`), true);
  assert.equal(isNewsImage(`${base}-x.webp`), false);
  const full = { photo: `${base}-f.jpg`, photoSm: `${base}-m.jpg`, photoWebp: `${base}-f.webp`, photoSmWebp: `${base}-m.webp` };
  assert.deepEqual(newsPhotoSources(full), { src: full.photo, srcSet: `${full.photoSm} 400w, ${full.photo} 720w`, webp: `${full.photoSmWebp} 400w, ${full.photoWebp} 720w` });
  // Sin ImageMagick: solo la imagen oficial, sin srcset.
  const oficial = { photo: 'https://velez.com.ar/img/noticias/26/md/x.jpg' };
  assert.deepEqual(newsPhotoSources(oficial), { src: oficial.photo, srcSet: null, webp: null });
  // WebP de 400 sin el de 720: no se usa (un celular lo estiraría).
  assert.equal(newsPhotoSources({ photo: full.photo, photoSmWebp: full.photoSmWebp }).webp, null);
  assert.equal(newsPhotoSources({ photo: 'https://evil.com/x.jpg' }), null);
  assert.equal(newsPhotoSources({ ...full, photoSm: 'https://evil.com/x.jpg' }).srcSet, null);
});

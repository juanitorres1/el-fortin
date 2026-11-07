import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseFile, parseLine } from '../scripts/import-copas.mjs';
import { hydrateCup } from '../src/lib/crests.js';
import { whereOf } from '../src/lib/facts.js';

const read = async (path) => readFile(new URL(path, import.meta.url), 'utf8');
const TXT = '../scripts/amateur-historico.txt';
const COMP = 'Primera División (amateur)';

// Tabla de posiciones de RSSSF de cada temporada (PJ, G, E, P, GF, GC de Vélez), contra la que se verificó la
// transcripción. 1919–1926: Asociación Amateurs de Football; 1927–1930: Asociación Amateurs Argentina de Football.
const TABLES = {
  1919: [13, 8, 2, 3, 21, 10],
  1920: [34, 17, 5, 12, 60, 32],
  1921: [38, 13, 10, 15, 53, 43],
  1922: [40, 16, 10, 14, 47, 43],
  1923: [20, 8, 3, 9, 20, 25],
  1924: [23, 6, 5, 12, 26, 35],
  1925: [24, 4, 12, 8, 19, 30],
  1926: [25, 10, 11, 4, 38, 27],
  1927: [33, 11, 5, 17, 42, 62],
  1928: [35, 9, 8, 18, 39, 75],
  1929: [16, 9, 2, 5, 23, 21],
  1930: [35, 13, 10, 12, 45, 49],
};
// Empates en la cancha que la tabla cuenta como triunfo de Vélez (partido suspendido, puntos para Vélez).
const AWARDED = { 1925: 1 };

/** Temporada (año del encabezado) → cuántos partidos ganó Vélez por no presentación del rival («# w.o.»). */
function walkovers(text) {
  const out = {};
  let season = null;
  for (const line of text.split('\n')) {
    const head = line.match(/^== .* (\d{4}) \|/);
    if (head) season = Number(head[1]);
    else if (line.startsWith('# w.o. ')) out[season] = (out[season] ?? 0) + 1;
  }
  return out;
}

test('amateur-historico.txt: se lee entero, cada partido con fecha, su temporada y el link de RSSSF', async () => {
  const matches = parseFile(await read(TXT), 'amateur-historico.txt');
  assert.ok(matches.length >= 300);
  for (const m of matches) {
    assert.equal(m.comp, COMP);
    assert.match(m.season, /^Primera División \(amateur\) (19(19|2\d|30))$/);
    const season = Number(m.season.slice(-4));
    assert.match(m.src, new RegExp(`^https://www\\.rsssf\\.org/tablesa/arg${String(season).slice(2)}\\.html$`));
    assert.ok(m.date, `${m.season}: falta la fecha`);
    // Las temporadas terminaban al año siguiente (la de 1930, en abril de 1931).
    assert.ok(m.year === season || m.year === season + 1, `${m.season}: ${m.date}`);
    assert.ok(!m.neutral && !m.pen, 'en la liga no hay canchas neutrales ni penales');
  }
});

test('amateur-historico: los totales de Vélez de cada temporada coinciden con la tabla de RSSSF', async () => {
  const text = await read(TXT);
  const matches = parseFile(text, 'amateur-historico.txt');
  const wo = walkovers(text);
  const got = {};
  for (const m of matches) {
    const y = Number(m.season.slice(-4));
    const t = (got[y] ??= [0, 0, 0, 0, 0, 0]);
    const [f, c] = m.home.name === 'Vélez' ? [m.home.score, m.away.score] : [m.away.score, m.home.score];
    t[0] += 1;
    t[f > c ? 1 : f === c ? 2 : 3] += 1;
    t[4] += f;
    t[5] += c;
  }
  for (const [y, t] of Object.entries(got)) {
    // RSSSF cuenta los w.o. como triunfo sin goles y los puntos ganados en mesa como triunfo.
    t[0] += wo[y] ?? 0;
    t[1] += (wo[y] ?? 0) + (AWARDED[y] ?? 0);
    t[2] -= AWARDED[y] ?? 0;
  }
  assert.deepEqual(Object.keys(got).map(Number), Object.keys(TABLES).map(Number), 'temporadas 1919 a 1930, todas');
  for (const y of Object.keys(TABLES)) assert.deepEqual(got[y], TABLES[y], `temporada ${y}`);
});

test('amateur-historico.json está al día con el .txt (correr node scripts/import-copas.mjs --amateur al cambiarlo)', async () => {
  const txt = parseFile(await read(TXT), 'amateur-historico.txt');
  const json = JSON.parse(await read('../public/data/amateur-historico.json')).matches;
  const key = (m) => `${m.date} ${m.round} ${m.home.name} ${m.home.score}-${m.away.score} ${m.away.name} ${m.note ?? ''}`;
  assert.deepEqual(json.map(key), txt.map(key));
  assert.ok(json.every((m, i) => m.id === `a${i + 1}` && m.home.id && m.away.id));
  assert.ok(json.every((m) => [m.home, m.away].some((t) => t.id === '21')), 'Vélez con su id de ESPN');
  // El mismo club, el mismo id: Atlanta y Ferro con el del historial 1931–2000, River con el de ESPN.
  const ids = new Map(json.flatMap((m) => [m.home, m.away]).map((t) => [t.name, t.id]));
  assert.equal(ids.get('Atlanta'), 'k13');
  assert.equal(ids.get('Ferro Carril Oeste'), 'k40');
  assert.equal(ids.get('River Plate'), '16');
});

test('la era amateur no se superpone con el historial 1931–2000', async () => {
  const old = JSON.parse(await read('../public/data/historico.json')).matches;
  assert.equal(Math.min(...old.map((m) => m.year)), 1931);
  const json = JSON.parse(await read('../public/data/amateur-historico.json')).matches;
  assert.ok(json.every((m) => !/Campeonato/.test(m.season)));
});

test('parseLine nombra el archivo en el error y un partido de la era amateur se hidrata como los de las copas', () => {
  const ED = { comp: COMP, season: `${COMP} 1925`, url: 'https://www.rsssf.org/tablesa/arg25.html' };
  assert.throws(() => parseLine('1925-10 | Fecha 1 | Vélez 1-0 Tigre', ED, 9, 'amateur-historico.txt'), /^Error: amateur-historico\.txt:9: fecha inválida/);
  const m = hydrateCup({ id: 'a1', ...parseLine('1925-10-25 | Fecha 4 | Independiente 1-1 Vélez | nota: x', ED, 1, 'amateur-historico.txt'),
    home: { id: '11', name: 'Independiente', score: 1 }, away: { id: '21', name: 'Vélez', score: 1 } });
  assert.equal(m.neutral, false);
  assert.equal(whereOf(m), 'visitante');
  assert.equal(m.date, '1925-10-25T15:00Z');
});

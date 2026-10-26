import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseFile, parseLine } from '../scripts/import-copas.mjs';
import { hydrateCup } from '../src/lib/crests.js';
import { historyRecords, isNeutral, rivalDetail, whereOf } from '../src/lib/facts.js';

const ED = { comp: 'Copa Libertadores', season: 'Copa Libertadores 1994', url: 'https://www.rsssf.org/sacups/copa94.html' };

test('parseLine: fecha a mediodía argentino, local primero, penales y notas', () => {
  const m = parseLine('1994-08-31 | Final | São Paulo 1-0 Vélez | pen 3-5; nota: Vélez campeón de América', ED, 1);
  assert.equal(m.date, '1994-08-31T15:00Z');
  assert.equal(m.year, 1994);
  assert.deepEqual([m.home.name, m.home.score, m.away.name, m.away.score], ['São Paulo', 1, 'Vélez', 0]);
  assert.deepEqual(m.pen, [3, 5]);
  assert.equal(m.note, 'Vélez campeón de América');
  assert.equal(m.round, 'Final');
  assert.equal(m.src, ED.url);
});

test('parseLine: fecha aproximada queda sin fecha (solo el año), cancha neutral con ciudad y sin cancha', () => {
  assert.equal(parseLine('~1995-09-14 | Octavos | Vélez 2-3 Flamengo', ED, 1).date, null);
  const n = parseLine('1994-12-01 | Final | Milan 0-2 Vélez | neutral Tokio', ED, 1);
  assert.deepEqual([n.neutral, n.venue], [true, 'Tokio']);
  assert.equal(parseLine('1993-07-11 | Ganadores | Racing Club 3-2 Vélez | sin cancha', ED, 1).venueUnknown, true);
  assert.equal(parseLine('1971-02-18 | Semifinal | Racing Club 2-3 Vélez | neutral Atlanta; prórroga', ED, 1).aet, true);
});

test('parseLine rechaza renglones mal escritos con el número de línea', () => {
  assert.throws(() => parseLine('1994-13 | Final | Vélez 1-0 Boca', ED, 7), /:7: fecha inválida/);
  assert.throws(() => parseLine('1994-08-31 | Final | Vélez 1 a 0 Boca', ED, 7), /partido inválido/);
  assert.throws(() => parseLine('1994-08-31 | Final | River Plate 1-0 Boca Juniors', ED, 7), /no juega Vélez/);
  assert.throws(() => parseLine('1994-08-31 | Final | Vélez 1-1 Boca | pen 4-4', ED, 7), /penales empatados/);
  assert.throws(() => parseLine('1994-08-31 | Final | Vélez 1-1 Boca | ganó raspando', ED, 7), /nota desconocida/);
});

test('copas-historicas.txt: se lee entero, cada partido con su copa y en orden por edición', async () => {
  const matches = parseFile(await readFile(new URL('../scripts/copas-historicas.txt', import.meta.url), 'utf8'));
  assert.ok(matches.length >= 100);
  assert.ok(matches.every((m) => m.year >= 1970 && m.year <= 2000 && m.src.startsWith('https://www.rsssf.org/')));
  const finals94 = matches.filter((m) => m.season === 'Copa Libertadores 1994' && m.round === 'Final');
  assert.deepEqual(finals94.map((m) => `${m.home.name} ${m.home.score}-${m.away.score} ${m.away.name}`), ['Vélez 1-0 São Paulo', 'São Paulo 1-0 Vélez']);
});

test('copas-historicas.json está al día con el .txt (correr node scripts/import-copas.mjs al cambiarlo)', async () => {
  const txt = parseFile(await readFile(new URL('../scripts/copas-historicas.txt', import.meta.url), 'utf8'));
  const json = JSON.parse(await readFile(new URL('../public/data/copas-historicas.json', import.meta.url), 'utf8')).matches;
  const key = (m) => `${m.date ?? m.year} ${m.home.name} ${m.home.score}-${m.away.score} ${m.away.name}`;
  assert.deepEqual(json.map(key), txt.map(key));
});

const cup = (extra) => hydrateCup({
  id: 'c1', year: 1993, date: '1993-07-11T15:00Z', comp: 'Copa Centenario', round: 'Ronda de ganadores',
  home: { id: '15', name: 'Racing Club', score: 3 }, away: { id: '21', name: 'Vélez', score: 2 }, ...extra,
});

test('hydrateCup: escudo, penales por equipo y cancha explícita (no se deduce por competencia)', () => {
  const m = cup({ pen: [2, 4], home: { id: '15', name: 'Racing Club', score: 1 }, away: { id: '21', name: 'Vélez', score: 1 } });
  assert.deepEqual([m.home.pen, m.away.pen], [2, 4]);
  assert.match(m.home.logo, /\/15\.png$/);
  assert.equal(hydrateCup({ ...m, home: { id: 'c-minerven', name: 'Minervén', score: 0 } }).home.logo, null);
  assert.equal(m.neutral, false);
  assert.equal(isNeutral({ ...m, comp: 'Copa Argentina', round: 'Final' }), false, 'una final de ida y vuelta no es neutral');
  assert.equal(isNeutral({ comp: 'Copa Argentina' }), true, 'ESPN: se sigue deduciendo por competencia');
});

test('whereOf y rivalDetail: un partido sin dato de cancha no cuenta como local ni visitante', () => {
  const unknown = cup({ venueUnknown: true });
  assert.equal(whereOf(unknown), 'sin-dato');
  assert.equal(whereOf(cup({})), 'visitante');
  const d = rivalDetail([unknown, cup({ date: '1993-07-12T15:00Z' })]);
  assert.deepEqual([d.home, d.away], [{ g: 0, e: 0, p: 0 }, { g: 0, e: 0, p: 1 }]);
  assert.equal(d.worstLoss.where, 'visitante');
  assert.equal(historyRecords([unknown]).totals.pj, 1);
});

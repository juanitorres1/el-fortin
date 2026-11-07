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

test('parseLine: «título» marca el partido que le dio la copa a Vélez; sin la marca no hay title', () => {
  const t = parseLine('1996-12-04 | Final | Vélez 2-0 Cruzeiro | título', ED, 1);
  assert.equal(t.title, true);
  assert.equal(t.note, undefined, 'la marca no es una nota');
  assert.equal(parseLine('1996-11-20 | Final | Cruzeiro 0-1 Vélez', ED, 1).title, undefined);
  assert.equal(parseLine('1994-08-31 | Final | São Paulo 1-0 Vélez | pen 3-5; título; nota: x', ED, 1).title, true);
  assert.throws(() => parseLine('1996-12-04 | Final | Vélez 2-0 Cruzeiro | titulo', ED, 7), /nota desconocida/);
});

test('copas-historicas: los 5 títulos internacionales anteriores a 2001 están marcados y no hay otros', async () => {
  const txt = parseFile(await readFile(new URL('../scripts/copas-historicas.txt', import.meta.url), 'utf8'));
  const json = JSON.parse(await readFile(new URL('../public/data/copas-historicas.json', import.meta.url), 'utf8')).matches;
  const titles = (list) => list.filter((m) => m.title).map((m) => `${m.date.slice(0, 10)} ${m.season}`);
  const expected = [
    '1994-08-31 Copa Libertadores 1994',
    '1994-12-01 Copa Intercontinental 1994',
    '1996-02-24 Copa Interamericana 1994',
    '1996-12-04 Supercopa Libertadores 1996',
    '1997-04-13 Recopa Sudamericana 1996',
  ];
  assert.deepEqual(titles(txt), expected);
  assert.deepEqual(titles(json), expected, 'correr node scripts/import-copas.mjs');
  // Un título es un partido que Vélez no perdió (en los 90 minutos o en los penales).
  for (const m of txt.filter((x) => x.title)) {
    const v = m.home.name === 'Vélez' ? 0 : 1;
    const goals = [m.home.score, m.away.score];
    assert.ok(goals[v] > goals[1 - v] || (m.pen && m.pen[v] > m.pen[1 - v]), `${m.season}: Vélez no ganó`);
  }
});

test('hydrateCup deja pasar title y note a MatchRow', () => {
  const m = hydrateCup({
    id: 'c61', year: 1996, date: '1996-12-04T15:00Z', comp: 'Supercopa Libertadores', round: 'Final', title: true, note: 'x',
    home: { id: '21', name: 'Vélez', score: 2 }, away: { id: '2022', name: 'Cruzeiro', score: 0 },
  });
  assert.deepEqual([m.title, m.note], [true, 'x']);
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

test('historyRecords: las rachas no cruzan 1931–2000 ni se arman solo con copas de esos años', () => {
  const g = (date, vs) => ({ date, comp: 'Copa Libertadores', completed: true, home: { id: '21', name: 'Vélez', score: 2 }, away: { id: vs, name: vs, score: 0 } });
  const r = historyRecords([g('1930-11-01T15:00Z', 'a'), g('1994-03-01T15:00Z', 'b'), g('1994-03-08T15:00Z', 'c'), g('1994-03-15T15:00Z', 'd'), g('2001-02-11T15:00Z', 'e')]);
  assert.equal(r.streaks.ganando.n, 1);
});

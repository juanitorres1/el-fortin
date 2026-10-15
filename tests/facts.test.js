import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthDay, onThisDay, parseDay, rivalFacts, scoreResult, streakLines } from '../js/facts.js';

let seq = 0;
// Partido de Vélez (id 21) contra un rival; `vs` = goles de Vélez, `rs` = del rival.
const game = (vs, rs, { home = true, rival = '16', date, comp = 'Liga Profesional', year } = {}) => {
  seq++;
  const v = { id: '21', name: 'Vélez', score: vs };
  const r = { id: rival, name: 'River Plate', score: rs };
  return {
    id: String(seq), date: date ?? (year ? null : new Date(Date.UTC(2026, 0, seq)).toISOString()), year, comp, completed: true,
    home: home ? v : r, away: home ? r : v,
  };
};

test('scoreResult usa los goles (los penales no cambian el resultado)', () => {
  assert.equal(scoreResult(game(2, 1)), 'G');
  assert.equal(scoreResult(game(1, 1, { home: false })), 'E');
  assert.equal(scoreResult(game(0, 3, { home: false })), 'P');
});

test('streakLines: racha ganadora y de local; ignora amistosos', () => {
  const ms = [game(0, 1), game(1, 1), game(2, 0), game(3, 1, { home: false }), game(0, 4, { comp: 'Amistoso' })];
  assert.deepEqual(streakLines(ms), ['Ganó los últimos 2 partidos', 'Lleva 3 partidos sin perder']);
  const home = [game(0, 1, { home: false }), game(1, 0), game(2, 2), game(1, 0), game(0, 1, { home: false })];
  assert.deepEqual(streakLines(home), ['Lleva 3 partidos sin perder de local']);
});

test('streakLines: racha negativa', () => {
  assert.deepEqual(streakLines([game(2, 0), game(1, 1), game(0, 1), game(0, 2)]), ['Perdió los últimos 2 partidos', 'Lleva 3 partidos sin ganar', 'Perdió los últimos 2 partidos de local', 'Lleva 3 partidos sin ganar de local']);
  assert.deepEqual(streakLines([]), []);
});

test('rivalFacts: totales, último partido, último triunfo y racha (históricos sin fecha primero)', () => {
  const ms = [game(1, 0, { year: 1990 }), game(0, 0), game(0, 1), game(1, 2)];
  const f = rivalFacts(ms, '16');
  assert.equal(f.pj, 4);
  assert.deepEqual([f.g, f.e, f.p], [1, 1, 2]);
  assert.deepEqual(f.last, { year: '2026', score: '1-2', result: 'P' });
  assert.deepEqual(f.lastWin, { year: '1990', score: '1-0' });
  assert.equal(f.streak, 'Perdió los últimos 2');
  assert.equal(rivalFacts(ms, '999'), null);
});

test('parseDay entiende las fechas de club.json', () => {
  assert.deepEqual(parseDay('31 de agosto de 1994'), { md: '08-31', year: 1994 });
  assert.deepEqual(parseDay('16/03/1924'), { md: '03-16', year: 1924 });
  assert.equal(parseDay('1996'), null);
});

test('monthDay usa la hora argentina', () => {
  assert.equal(monthDay(new Date('2026-10-16T02:00:00Z')), '10-15'); // 23:00 del 15 en la Argentina
});

test('onThisDay: momentos del club y triunfos, sin repetir el partido de un momento', () => {
  const club = { momentos: [{ fecha: '5 de julio de 2009', titulo: 'El gol de Moralez' }], estadio: { hitos: [{ fecha: '05/07/1951', texto: 'Hito' }] } };
  const win2009 = game(1, 0, { date: '2009-07-05T20:00:00Z' });
  const win2015 = game(2, 0, { date: '2015-07-05T20:00:00Z', comp: 'Liga Profesional' });
  const loss = game(0, 1, { date: '2016-07-05T20:00:00Z' });
  const out = onThisDay('07-05', { matches: [win2009, win2015, loss], club });
  assert.deepEqual(out.map((d) => d.year), [1951, 2009, 2015]);
  assert.equal(out[2].text, 'Vélez le ganó 2-0 a River Plate, por la Primera División');
});

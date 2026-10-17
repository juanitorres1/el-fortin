import { test } from 'node:test';
import assert from 'node:assert/strict';
import { historyRecords, isNeutral, monthDay, onThisDay, parseDay, rivalDetail, rivalFacts, scoreResult, streakLines, upcomingAnniversaries } from '../src/lib/facts.js';

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

test('isNeutral: copas nacionales y finales en cancha neutral; playoffs de la Liga no', () => {
  assert.equal(isNeutral({ comp: 'Copa Argentina', round: 'Round of 64' }), true);
  assert.equal(isNeutral({ comp: 'Liga Profesional', round: 'Clausura - Final' }), true);
  assert.equal(isNeutral({ comp: 'Liga Profesional', round: 'Clausura - Semifinals' }), false);
  assert.equal(isNeutral({ comp: 'Copa de la Liga', round: 'Semifinals' }), true);
  assert.equal(isNeutral({ comp: 'Liga Profesional', round: 'Torneo Clausura' }), false);
});

test('rivalDetail: local, visitante y neutral por separado; mayor goleada y últimos triunfos', () => {
  const ms = [
    game(3, 0, { year: 1990 }),
    game(5, 2, { date: '2010-03-01T20:00:00Z' }),
    game(0, 4, { home: false, date: '2015-03-01T20:00:00Z' }),
    game(2, 1, { home: false, date: '2018-03-01T20:00:00Z' }),
    game(1, 0, { home: false, date: '2024-03-01T20:00:00Z', comp: 'Copa Argentina' }),
  ];
  const d = rivalDetail(ms);
  assert.deepEqual(d.home, { g: 2, e: 0, p: 0 });
  assert.deepEqual(d.away, { g: 1, e: 0, p: 1 });
  assert.deepEqual(d.neutral, { g: 1, e: 0, p: 0 });
  assert.deepEqual(d.biggestWin, { year: '2010', score: '5-2', comp: 'Liga Profesional', where: 'local' }); // misma diferencia que 3-0, más goles
  assert.deepEqual(d.worstLoss, { year: '2015', score: '0-4', comp: 'Liga Profesional', where: 'visitante' });
  assert.equal(d.lastAwayWin.year, '2018'); // el 1-0 de 2024 fue en cancha neutral
  assert.equal(d.lastHomeWin.year, '2010');
});

test('historyRecords: totales, goleadas, rachas con fecha y mejor año', () => {
  const old = [game(7, 0, { year: 1950 }), game(5, 0, { year: 1950 }), game(1, 2, { year: 1951 })];
  const recent = [game(2, 0), game(3, 0), game(1, 1), game(0, 2), game(4, 1), game(1, 0), game(0, 0, { comp: 'Amistoso' })];
  const r = historyRecords([...recent, ...old]);
  assert.deepEqual([r.totals.pj, r.totals.g, r.totals.e, r.totals.p, r.totals.since], [9, 6, 1, 2, 1950]);
  assert.deepEqual(r.wins.slice(0, 2).map((w) => [w.score, w.year]), [['7-0', 1950], ['5-0', 1950]]);
  assert.equal(r.goals.score, '7-0');
  // Las rachas solo cuentan desde 2001 (con fecha): 2-0, 3-0 | 1-1 | 0-2 | 4-1, 1-0
  assert.equal(r.streaks.ganando.n, 2);
  assert.equal(r.streaks.ganando.current, true); // la última (4-1, 1-0) empata en largo y es la actual
  assert.equal(r.streaks.invicto.n, 3);
  assert.equal(r.streaks.vallaInvicta.n, 2);
  assert.equal(r.favorite.g, 6);
  assert.equal(r.bestYear, null); // ningún año con 15 partidos
});

test('upcomingAnniversaries: los que vienen, con años que se cumplen y días que faltan', () => {
  const club = {
    momentos: [{ fecha: '31 de agosto de 1994', titulo: 'Libertadores' }, { fecha: '1 de diciembre de 1994', titulo: 'Intercontinental' }],
    estadio: { hitos: [{ fecha: '22/10/1951', texto: 'Cemento' }, { fecha: '1978', texto: 'Mundial' }] },
  };
  const now = new Date('2026-10-17T15:00:00Z');
  const out = upcomingAnniversaries(club, now, 60);
  assert.deepEqual(out.map((a) => [a.text, a.inDays, a.years]), [['Cemento', 5, 75], ['Intercontinental', 45, 32]]);
  // Pasado el día, va al año siguiente
  assert.equal(upcomingAnniversaries(club, new Date('2026-12-02T15:00:00Z'), 365).find((a) => a.text === 'Intercontinental').years, 33);
});

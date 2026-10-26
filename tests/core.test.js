import { test } from 'node:test';
import assert from 'node:assert/strict';
import { espnDay, goalBy, isLive, liveStandings, liveTables, scoreTitle, standingsNow } from '../src/lib/core.js';

const live = (home, away, { velezHome = true, id = '1' } = {}) => ({
  id, clock: "67'",
  home: { id: velezHome ? '21' : '5', name: velezHome ? 'Vélez' : 'Boca Juniors', score: home },
  away: { id: velezHome ? '5' : '21', name: velezHome ? 'Boca Juniors' : 'Vélez', score: away },
});

test('goalBy detecta de quién fue el gol, de local o de visitante', () => {
  assert.equal(goalBy({ id: '1', home: 0, away: 0 }, live(1, 0)), 'velez');
  assert.equal(goalBy({ id: '1', home: 1, away: 0 }, live(1, 1)), 'rival');
  assert.equal(goalBy({ id: '1', home: 0, away: 0 }, live(0, 1, { velezHome: false })), 'velez');
  assert.equal(goalBy({ id: '1', home: 1, away: 1 }, live(1, 1)), null);
});

test('goalBy no avisa en la primera carga ni si cambió el partido', () => {
  assert.equal(goalBy(null, live(2, 0)), null);
  assert.equal(goalBy({ id: '9', home: 0, away: 0 }, live(2, 0)), null);
});

test('scoreTitle arma el marcador para la pestaña', () => {
  assert.equal(scoreTitle(live(2, 1)), "2-1 Vélez vs Boca Juniors (67')");
});

test('liveStandings: suma los partidos en juego como si terminaran así y reordena', () => {
  const rows = [
    { id: 'A', pts: 20, pj: 13, gf: 20, gc: 10, dg: 10, rank: 1 },
    { id: '21', pts: 19, pj: 13, gf: 15, gc: 10, dg: 5, rank: 2 },
    { id: 'C', pts: 19, pj: 13, gf: 12, gc: 12, dg: 0, rank: 3 },
  ];
  const ev = (id, h, a, hs, as, status = 'in') => ({ id, status, home: { id: h, score: hs }, away: { id: a, score: as } });
  const out = liveStandings(rows, [ev('1', '21', 'X', 2, 0), ev('2', 'A', 'C', 1, 1), ev('3', 'A', 'C', 9, 0, 'post')]);
  assert.deepEqual(out.map((r) => [r.id, r.pts, r.rank, r.before]), [['21', 22, 1, 2], ['A', 21, 2, 1], ['C', 20, 3, 3]]);
  assert.equal(out[0].dg, 7);
  assert.ok(out.every((r) => r.live));
});

test('espnDay: el día en la Argentina', () => {
  assert.equal(espnDay(new Date('2026-10-20T02:00:00Z')), '20261019');
});

test('liveTables: el partido en juego suma en su zona y en la anual', () => {
  const row = (id, pts, rank) => ({ id, pts, pj: 10, gf: 10, gc: 10, dg: 0, rank });
  const standings = {
    groups: [{ name: 'Zona A', rows: [row('B', 20, 1), row('21', 19, 2)] }],
    annual: { phases: ['Apertura', 'Clausura'], rows: [row('B', 40, 1), row('X', 39, 2), row('21', 38, 3)] },
  };
  const ev = [{ id: '1', status: 'in', home: { id: '21', score: 1 }, away: { id: 'Z', score: 0 } }];
  const out = liveTables(standings, ev);
  assert.deepEqual(out.groups[0].rows.map((r) => [r.id, r.pts]), [['21', 22], ['B', 20]]);
  assert.deepEqual(out.annual.rows.map((r) => [r.id, r.pts, r.rank]), [['21', 41, 1], ['B', 40, 2], ['X', 39, 3]]);
  assert.equal(out.annual.phases.length, 2);
  assert.equal(standings.annual.rows[2].pts, 38); // no toca el original
});

test('liveTables: G/E/P y el resultado en juego de cada equipo (para los puntitos de las tablas)', () => {
  const row = (id, rank, pts) => ({ id, name: `E${id}`, rank, pj: 10, g: 0, e: 0, p: 0, gf: 10, gc: 10, dg: 0, pts });
  const playing = (h, a, hs, as) => ({ status: 'in', home: { id: h, name: `E${h}`, score: hs }, away: { id: a, name: `E${a}`, score: as } });
  const s = liveTables({ groups: [{ rows: [row('1', 1, 20), row('2', 2, 19), row('3', 3, 18)] }], annual: null }, [playing('3', '1', 2, 1)]);
  const [a, b, c] = s.groups[0].rows;
  assert.deepEqual([a.id, a.rank, a.pts, a.g, a.p, a.live], ['3', 1, 21, 1, 0, { result: 'G', score: '2-1', rival: 'E1' }]);
  assert.deepEqual([b.id, b.pts, b.p, b.live], ['1', 20, 1, { result: 'P', score: '1-2', rival: 'E3' }]);
  assert.deepEqual([c.id, c.live], ['2', null]);
  const d = liveTables({ groups: [{ rows: [row('1', 1, 10), row('2', 2, 10)] }] }, [playing('2', '1', 0, 0)]).groups[0].rows;
  assert.deepEqual(d.map((r) => [r.id, r.pts, r.e, r.live.result]), [['1', 11, 1, 'E'], ['2', 11, 1, 'E']]);
});

test('standingsNow: tabla en vivo solo con datos en vivo, no con la copia guardada', () => {
  const data = {
    standings: { groups: [{ rows: [{ id: '1', rank: 1, pj: 1, g: 0, e: 0, p: 1, gf: 0, gc: 1, dg: -1, pts: 0 }] }] },
    playing: [{ status: 'in', home: { id: '1', name: 'A', score: 1 }, away: { id: '2', name: 'B', score: 0 } }],
  };
  assert.equal(standingsNow({ data, live: true }).groups[0].rows[0].pts, 3);
  assert.equal(standingsNow({ data, live: false }), data.standings);
});

test('isLive: refresca rápido si juega Vélez o hay partidos de la liga en juego', () => {
  assert.equal(isLive({ fixture: [{ status: 'pre' }], playing: [] }), false);
  assert.equal(isLive({ fixture: [{ status: 'in' }] }), true);
  assert.equal(isLive({ fixture: [], playing: [{ status: 'in' }] }), true);
});

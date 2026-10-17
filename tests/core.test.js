import { test } from 'node:test';
import assert from 'node:assert/strict';
import { espnDay, goalBy, liveStandings, scoreTitle } from '../src/lib/core.js';

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

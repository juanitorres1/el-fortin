import { test } from 'node:test';
import assert from 'node:assert/strict';
import { goalBy, scoreTitle } from '../js/core.js';

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

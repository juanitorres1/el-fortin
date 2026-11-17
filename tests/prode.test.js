import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRODE_QUICK, prodeClosesIn, prodeLive, prodeReady } from '../src/lib/games.js';

const at = '2026-11-20T23:00:00Z';
const m = (over = {}) => ({
  id: '1', date: at, completed: false, status: 'pre', comp: 'Liga Profesional', round: 'Torneo Clausura',
  home: { id: '21', name: 'Vélez', score: null }, away: { id: '4', name: 'Belgrano', score: null }, ...over,
});
const before = (min) => Date.parse(at) - min * 60_000;

test('prodeClosesIn: días, horas y minutos hasta el comienzo', () => {
  assert.equal(prodeClosesIn(m(), before(3 * 1440 + 30)), 'Cierra en 3 días');
  assert.equal(prodeClosesIn(m(), before(2 * 1440)), 'Cierra en 2 días');
  assert.equal(prodeClosesIn(m(), before(1440 + 4 * 60 + 10)), 'Cierra en 1 día y 4 h');
  assert.equal(prodeClosesIn(m(), before(1440 + 5)), 'Cierra en 1 día');
  assert.equal(prodeClosesIn(m(), before(2 * 60 + 15)), 'Cierra en 2 h 15 min');
  assert.equal(prodeClosesIn(m(), before(60)), 'Cierra en 1 h');
  assert.equal(prodeClosesIn(m(), before(9)), 'Cierra en 9 min');
  assert.equal(prodeClosesIn(m(), Date.parse(at) - 20_000), 'Cierra en 1 min'); // nunca «0 min»
});

test('prodeClosesIn: null cuando ya cerró o no hay partido', () => {
  assert.equal(prodeClosesIn(m(), Date.parse(at)), null);
  assert.equal(prodeClosesIn(m({ status: 'in' }), before(60)), null);
  assert.equal(prodeClosesIn(undefined, 0), null);
});

test('prodeLive: lo que sumaría si termina así, mirado desde Vélez', () => {
  const live = (h, a, home = true) => m({ status: 'in', home: { id: home ? '21' : '4', score: h }, away: { id: home ? '4' : '21', score: a } });
  assert.deepEqual(prodeLive({ v: 2, r: 1 }, live(2, 1)), { kind: 'exacto', pts: 3, real: '2-1' });
  assert.equal(prodeLive({ v: 1, r: 0 }, live(1, 3, false)).kind, 'resultado'); // Vélez visitante: 3-1 para Vélez
  assert.equal(prodeLive({ v: 0, r: 0 }, live(1, 0)).kind, 'errado');
  assert.equal(prodeLive(undefined, live(1, 0)), null);
  assert.equal(prodeLive({ v: 1, r: 0 }, m()), null); // no se está jugando
  assert.equal(prodeLive({ v: 1, r: 0 }, live(null, null)), null);
});

test('PRODE_QUICK: marcadores válidos y sin repetir', () => {
  const keys = PRODE_QUICK.map((q) => `${q.v}-${q.r}`);
  assert.equal(new Set(keys).size, keys.length);
  for (const q of PRODE_QUICK) assert.ok(prodeReady(q, m()), keys.join());
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isOpen, onceScore, prodeScore, prodeSummary } from '../src/lib/games.js';

const match = (id, vs, rs, { home = true, completed = true, date = '2026-10-01T20:00:00Z' } = {}) => {
  const v = { id: '21', name: 'Vélez', score: vs };
  const r = { id: '16', name: 'River Plate', score: rs };
  return { id, date, completed, status: completed ? 'post' : 'pre', home: home ? v : r, away: home ? r : v };
};

test('prodeScore: 3 el exacto, 1 el resultado, 0 si no; mirado desde Vélez aunque sea visitante', () => {
  assert.deepEqual(prodeScore({ v: 2, r: 1 }, match('1', 2, 1)), { kind: 'exacto', pts: 3, real: '2-1' });
  assert.equal(prodeScore({ v: 1, r: 0 }, match('1', 2, 1, { home: false })).kind, 'resultado');
  assert.equal(prodeScore({ v: 1, r: 1 }, match('1', 0, 0)).kind, 'resultado');
  assert.equal(prodeScore({ v: 0, r: 1 }, match('1', 2, 1)).kind, 'errado');
  assert.equal(prodeScore({ v: 0, r: 1 }, match('1', null, null, { completed: false })), null);
});

test('prodeSummary: solo cuenta los partidos terminados, el más nuevo primero', () => {
  const s = prodeSummary({ 1: { v: 2, r: 1 }, 2: { v: 1, r: 0 }, 3: { v: 0, r: 0 } }, [match('1', 2, 1, { date: '2026-09-01T20:00Z' }), match('2', 0, 3, { date: '2026-09-08T20:00Z' })]);
  assert.deepEqual([s.played, s.pts, s.exact, s.hits], [2, 3, 1, 1]);
  assert.equal(s.list[0].id, '2');
});

test('isOpen: hasta que empieza', () => {
  const m = match('1', null, null, { completed: false, date: '2026-10-19T22:00:00Z' });
  assert.equal(isOpen(m, Date.parse('2026-10-19T21:59:00Z')), true);
  assert.equal(isOpen(m, Date.parse('2026-10-19T22:00:00Z')), false);
  assert.equal(isOpen({ ...m, status: 'in' }, 0), false);
});

test('onceScore: cuántos titulares acertó', () => {
  const game = { players: [{ id: 'a', s: 1 }, { id: 'b', s: 1 }, { id: 'c', s: 0 }] };
  const r = onceScore(['a', 'c', 'x'], game);
  assert.deepEqual([r.hits, r.total, [...r.hitIds]], [1, 2, ['a']]);
  assert.equal(onceScore(['a'], null), null);
});

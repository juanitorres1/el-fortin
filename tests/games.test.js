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

// ---------- Informe nov-2026: prode en eliminación y suspendidos en «Adiviná el once» ----------
import { isKnockout, prodeReady, suspendedFor } from '../src/lib/games.js';

test('prode: arranca sin marcador y, en eliminación, el empate pide quién pasa', () => {
  const liga = { comp: 'Liga Profesional', round: 'Torneo Clausura - Fecha 5', date: '2026-10-01T20:00:00Z' };
  const octavos = { comp: 'Liga Profesional', round: 'Clausura - Round of 16', date: '2026-11-20T23:00Z' };
  assert.equal(isKnockout(liga), false);
  assert.equal(isKnockout(octavos), true);
  assert.equal(isKnockout({ comp: 'Copa Argentina', round: 'Round of 32', date: '2026-05-01T20:00Z' }), true);
  assert.equal(prodeReady({ v: null, r: null }, liga), false);
  assert.equal(prodeReady({ v: 1, r: null }, liga), false);
  assert.equal(prodeReady({ v: 1, r: 1 }, liga), true);
  assert.equal(prodeReady({ v: 1, r: 1 }, octavos), false);
  assert.equal(prodeReady({ v: 1, r: 1, pass: 'v' }, octavos), true);
  assert.equal(prodeReady({ v: 2, r: 1 }, octavos), true);
});

test('suspendedFor: roja o ciclo de amarillas del torneo del partido (no el límite ni otro torneo)', () => {
  const next = { comp: 'Liga Profesional', round: 'Clausura - Round of 16', date: '2026-11-20T23:00Z' };
  const discipline = [
    { id: '1', kind: 'roja', tournament: 'Clausura 2026', text: 'Expulsado en el último partido' },
    { id: '2', kind: 'amarillas', tournament: 'Clausura 2026', text: 'Llegó a 5 amarillas' },
    { id: '3', kind: 'limite', tournament: 'Clausura 2026', text: '4 amarillas' },
    { id: '4', kind: 'roja', tournament: 'Copa Argentina 2026', text: 'Expulsado' },
  ];
  assert.deepEqual([...suspendedFor(discipline, next).keys()], ['1', '2']);
  assert.equal(suspendedFor(null, next).size, 0);
  assert.equal(suspendedFor(discipline, null).size, 0);
});

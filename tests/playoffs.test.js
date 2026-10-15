import { test } from 'node:test';
import assert from 'node:assert/strict';
import { qualification, qualificationLines, reachablePoints, remainingByTeam } from '../js/playoffs.js';

// Zona chica para probar con 2 lugares: { id, pts, pj, rank }.
const zone = (...pts) => pts.map((p, i) => ({ id: String(i + 1), name: `E${i + 1}`, pts: p, pj: 14, rank: i + 1 }));
const left = (n, ids) => new Map(ids.map((id) => [id, Array.from({ length: n }, () => ({ rival: 'X', rivalId: 'x', home: true }))]));

test('reachablePoints: con 1 partido 0, 1 o 3; con 2, todo menos 5', () => {
  assert.deepEqual(reachablePoints(1), [0, 1, 3]);
  assert.deepEqual(reachablePoints(2), [0, 1, 2, 3, 4, 6]);
  assert.deepEqual(reachablePoints(0), [0]);
});

test('remainingByTeam: un partido sin jugar suma a los dos equipos, con localía', () => {
  const m = (id, h, a, completed = false) => ({ id, date: `2026-11-0${id}T20:00Z`, completed, status: completed ? 'post' : 'pre', home: { id: h, name: h }, away: { id: a, name: a } });
  const r = remainingByTeam([m('2', 'B', 'A'), m('1', 'A', 'C'), m('3', 'A', 'B', true)]);
  assert.deepEqual(r.get('A').map((x) => [x.rival, x.home]), [['C', true], ['B', false]]);
  assert.equal(r.get('C').length, 1);
});

test('qualification: clasificado, eliminado y puntos que alcanzan (2 lugares)', () => {
  const rows = zone(30, 25, 24, 20, 10);
  const q = qualification(rows, left(2, ['1', '2', '3', '4', '5']), 2);
  const by = Object.fromEntries(q.map((t) => [t.id, t]));
  // E1 (30): solo E2 (31) y E3 (30) lo pueden igualar o pasar → 2 amenazas, no está asegurado; con 1 punto (31) solo E2.
  assert.equal(by['1'].status, null);
  assert.equal(by['1'].needed, 1);
  // E5 (máx 16) ya no alcanza a E1, E2, E3, E4 → eliminado.
  assert.equal(by['5'].status, 'eliminado');
  assert.equal(by['5'].needed, null);
  // E4 (20, máx 26): ni ganando todo lo asegura (E1, E2 y E3 pueden llegar a 26).
  assert.equal(by['4'].status, null);
  assert.equal(by['4'].needed, null);
});

test('qualification: ya clasificado cuando menos de N rivales pueden igualarlo', () => {
  const q = qualification(zone(40, 20, 19, 18), left(2, ['1', '2', '3', '4']), 2);
  assert.equal(q[0].status, 'clasificado');
  assert.equal(q[0].needed, 0);
});

test('qualification: sin datos de partidos, estima con 16 fechas', () => {
  const q = qualification([{ id: '1', name: 'A', pts: 10, pj: 12, rank: 1 }]);
  assert.equal(q[0].left, 4);
  assert.equal(q[0].max, 22);
});

test('qualificationLines: frases para Vélez', () => {
  const rows = zone(30, 25, 24, 20, 10);
  const q = qualification(rows, left(2, ['1', '2', '3', '4', '5']), 2);
  assert.deepEqual(qualificationLines(q[0], q, 2), ['Hoy está 1.º, 6 puntos arriba del 3.º.', 'Si suma 1 de los 6 puntos que le quedan, clasifica sin depender de nadie.']);
  assert.deepEqual(qualificationLines(q[3], q, 2), ['Hoy está 4.º, a 5 puntos del 2.º.', 'Aunque gane todo, no lo tiene asegurado: más de 1 rivales todavía pueden alcanzarlo.']);
  assert.deepEqual(qualificationLines(q[4], q, 2), ['Ya no puede clasificar a los playoffs.']);
});

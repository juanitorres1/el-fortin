import { test } from 'node:test';
import assert from 'node:assert/strict';
import { previaCard, resultCard, scorersLine } from '../src/lib/card.js';

const side = (id, name, score) => ({ id, name, score, pen: null, winner: false });
const match = (hs, as, { velezHome = true, completed = true } = {}) => ({
  id: '1', date: '2026-10-19T22:30:00Z', timeValid: true, comp: 'Liga Profesional', round: 'Torneo Clausura', venue: 'Estadio José Amalfitani', completed,
  home: velezHome ? side('21', 'Vélez', hs) : side('16', 'River Plate', hs), away: velezHome ? side('16', 'River Plate', as) : side('21', 'Vélez', as),
});

test('scorersLine: goleadores de Vélez con sus minutos, en orden, sin los del rival ni los penales de la definición', () => {
  const events = [ // keyEvents viene del más nuevo al más viejo
    { kind: 'gol', velez: true, text: 'Penales: convirtió Bou', minute: '' },
    { kind: 'gol', velez: true, text: 'Gol de penal de Romero', minute: "80'" },
    { kind: 'gol', velez: false, text: 'Gol de Borja', minute: "50'" },
    { kind: 'gol', velez: true, text: 'Gol de Romero (asistencia de Bou)', minute: "23'" },
    { kind: 'amarilla', velez: true, text: 'Amarilla para Bou', minute: "10'" },
  ];
  assert.equal(scorersLine(events), "Romero 23', 80'");
  assert.equal(scorersLine(null), '');
});

test('resultCard: titular según el resultado de Vélez (también de visitante)', () => {
  const c = resultCard(match(0, 2, { velezHome: false }), { scorers: "Romero 23'", position: '2.º en la Zona A' });
  assert.equal(c.headline, '¡Ganó Vélez!');
  assert.equal(c.center, '0-2');
  assert.equal(c.kicker, 'Liga Profesional · Clausura');
  assert.deepEqual(c.lines, ["Goles: Romero 23'", '2.º en la Zona A']);
  assert.equal(resultCard(match(1, 1)).headline, 'Empate');
});

test('previaCard: fecha, cancha e historial con la racha contra el rival', () => {
  const c = previaCard(match(null, null, { completed: false }), { rf: { g: 53, e: 45, p: 92, streak: 'Perdió los últimos 2' }, streak: 'Lleva 4 partidos sin perder' });
  assert.equal(c.when, 'Lunes, 19 de octubre · 19:30 h');
  assert.deepEqual(c.lines, ['Estadio José Amalfitani', 'Historial con River Plate: 53 G · 45 E · 92 P (perdió los últimos 2)', 'Lleva 4 partidos sin perder']);
});

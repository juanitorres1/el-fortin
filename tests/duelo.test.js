// Mano a Mano: textos de la respuesta y datos de cada lado.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DUEL_STATS, dailyDuels, duelSentence, duelUnit, rivalHref } from '../src/lib/duel.js';

const side = (name, value) => ({ id: name, name, value, pj: 100 });

test('duelUnit: singular y plural', () => {
  assert.equal(duelUnit('g', 1), '1 triunfo');
  assert.equal(duelUnit('gf', 237), '237 goles');
  assert.equal(duelUnit('pj', 0), '0 partidos');
});

test('duelSentence: el mayor primero, con el verbo de cada número', () => {
  const d = (stat, a, b) => ({ stat, a: side('River Plate', a), b: side('Boca Juniors', b), answer: a > b ? 'a' : 'b' });
  assert.equal(duelSentence(d('g', 54, 49)), 'Vélez le ganó 54 veces a River Plate y 49 a Boca Juniors.');
  assert.equal(duelSentence(d('g', 49, 54)), 'Vélez le ganó 54 veces a Boca Juniors y 49 a River Plate.');
  assert.equal(duelSentence(d('gf', 237, 227)), 'Vélez le hizo 237 goles a River Plate y 227 a Boca Juniors.');
  assert.equal(duelSentence(d('pj', 216, 192)), 'Vélez jugó 216 partidos con River Plate y 192 con Boca Juniors.');
  assert.equal(duelSentence(d('p', 98, 94)), 'Vélez perdió 98 veces con River Plate y 94 con Boca Juniors.');
  assert.equal(duelSentence(d('e', 1, 64)), 'Vélez empató 64 veces con Boca Juniors y 1 con River Plate.');
  for (const stat of Object.keys(DUEL_STATS)) assert.match(duelSentence(d(stat, 9, 5)), /^Vélez .+\.$/);
});

test('rivalHref: link al historial con el id escapado', () => {
  assert.equal(rivalHref('16'), 'historial.html?rival=16');
  assert.equal(rivalHref('a b'), 'historial.html?rival=a%20b');
});

test('dailyDuels: cada lado trae los partidos jugados (para «en N partidos»)', () => {
  const rows = Array.from({ length: 30 }, (_, i) => ({ id: String(i + 1), name: `R${i}`, pj: 30 + i * 4, g: 6 + i, e: 5 + (i % 6), p: 7 + (i % 4), gf: 25 + i * 3, gc: 20 + i }));
  for (const d of dailyDuels(rows, 20406)) {
    for (const s of [d.a, d.b]) assert.equal(s.pj, rows.find((r) => r.id === s.id).pj);
  }
});

// Grilla del Fortín: encabezados (texto corto y escudos), por qué no vale un jugador, casilla elegida por defecto y
// respuestas del final. Con los datos reales del repo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CRITERIA, cellPlayers, criterionLogo, dailyGrid, gridAnswers, gridCheck, gridFirstOpen, gridMisses, historicPlayers } from '../src/lib/players.js';

const players = historicPlayers(JSON.parse(readFileSync(new URL('../public/data/jugadores.json', import.meta.url), 'utf8')));
const DAY = 20406;

test('grilla: cada criterio tiene encabezado corto y los de club tienen escudo', () => {
  for (const c of CRITERIA) {
    assert.equal(c.head.length, 2, c.id);
    assert.ok(c.head.every((t) => typeof t === 'string' && t.length > 0), c.id);
    // El dato corto entra en una columna de 84 px (375 px de pantalla): hasta 15 letras.
    assert.ok(c.head[1].length <= 15, `${c.id}: «${c.head[1]}» es largo`);
    if (c.group === 'club') assert.match(criterionLogo(players, c) ?? '', /^https:\/\//, `${c.id} sin escudo`);
    else assert.equal(criterionLogo(players, c), null);
  }
});

test('grilla: los criterios conservan el orden y los ids (cambiarlos cambiaría la grilla de cada día)', () => {
  assert.deepEqual(CRITERIA.slice(4, 11).map((c) => c.id), ['ext', 'nat-uy', 'sel', 'eu', 'mx', 'es', 'it']);
  assert.equal(CRITERIA.find((c) => c.id === 'br').label, 'Jugó en Brasil');
});

test('grilla: gridMisses dice qué condición no cumple y queda vacío si vale', () => {
  const grid = dailyGrid(players, DAY);
  for (let i = 0; i < 9; i++) {
    const [row, col] = [grid.rows[Math.floor(i / 3)], grid.cols[i % 3]];
    const ok = cellPlayers(players, row, col)[0];
    assert.deepEqual(gridMisses(grid, i, ok), []);
    for (const p of players.slice(0, 80)) {
      const why = gridMisses(grid, i, p);
      assert.equal(why.length === 0, gridCheck(grid, i, p));
      assert.ok(why.every((c) => c === row || c === col));
    }
  }
});

test('grilla: gridFirstOpen elige la primera casilla libre', () => {
  assert.equal(gridFirstOpen(new Set()), 0);
  assert.equal(gridFirstOpen(new Set([0, 1, 3])), 2);
  assert.equal(gridFirstOpen(new Set([0, 1, 2, 3, 4, 5, 6, 7, 8])), null);
});

test('grilla: gridAnswers da los más conocidos y el más tapado, sin repetir el que puso el hincha', () => {
  const grid = dailyGrid(players, DAY);
  for (let i = 0; i < 9; i++) {
    const all = cellPlayers(players, grid.rows[Math.floor(i / 3)], grid.cols[i % 3]);
    const mine = all[0].id;
    const a = gridAnswers(players, grid, i, mine);
    assert.equal(a.total, all.length);
    const ids = [...a.known, a.rare].filter(Boolean).map((p) => p.id);
    assert.ok(!ids.includes(mine));
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(a.known.length <= 3);
    for (let k = 1; k < a.known.length; k++) assert.ok(a.known[k - 1].links >= a.known[k].links);
    if (a.rare) assert.ok(a.known.every((p) => p.links >= a.rare.links));
  }
});

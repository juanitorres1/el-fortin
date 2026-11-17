// El Tapado: lo que se sabe juntando los intentos, el fin de la partida guardada y la ficha del revelado.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TAPADO_COLS, TAPADO_TRIES, historicPlayers, tapadoClues, tapadoDone, tapadoFicha, tapadoPools, tapadoRow } from '../src/lib/players.js';

const players = historicPlayers(JSON.parse(readFileSync(new URL('../public/data/jugadores.json', import.meta.url), 'utf8')));
const by = (key, list) => Object.fromEntries(list.map((c) => [c.key, c]));
const squad = (id, pos, nat, age, jersey, pj, g) => ({ id, n: id, pos, nat, age, jersey, pj, g });

test('El Tapado: sin intentos no se sabe nada', () => {
  const t = squad('t', 'D', 'Argentina', 27, '6', 10, 1);
  assert.ok(tapadoClues([], t, 'hoy').every((c) => c.state === 'unknown' && c.not.length === 0));
});

test('El Tapado: las flechas y el «cerca» acotan los números', () => {
  const t = squad('t', 'D', 'Argentina', 27, '6', 10, 1);
  // Edad 30: a más de 2 y la respuesta es menor → 27 o menos.
  const a = by('k', tapadoClues([squad('a', 'F', 'Uruguay', 30, '9', 20, 8)], t, 'hoy'));
  assert.equal(a.age.state, 'range');
  assert.equal(a.age.text, '27 o menos');
  assert.equal(a.jersey.text, '4–8'); // 9, cerca (±5) y más bajo
  assert.equal(a.pj.text, '0–16'); // 20, más bajo y a más de 3
  assert.equal(a.g.text, '0–6');
  // Un segundo intento cerca y hacia arriba cierra la edad.
  const b = by('k', tapadoClues([squad('a', 'F', 'Uruguay', 30, '9', 20, 8), squad('b', 'M', 'Chile', 25, '5', 9, 1)], t, 'hoy'));
  assert.equal(b.age.text, '26–27');
  assert.equal(b.jersey.text, '6–8');
  assert.equal(b.pj.text, '10–12');
  assert.equal(b.g.state, 'ok');
  assert.equal(b.g.text, '1');
});

test('El Tapado: los rangos nunca dejan afuera la respuesta (datos reales)', () => {
  const { guess, answers } = tapadoPools(players);
  for (const [i, target] of answers.entries()) {
    const tries = [0, 1, 2, 3].map((k) => guess[(i * 7 + k * 31) % guess.length]).filter((p) => p.id !== target.id);
    for (const clue of tapadoClues(tries, target, 'historia')) {
      const col = TAPADO_COLS.historia.find((c) => c.key === clue.key);
      const v = col.get(target);
      if (clue.state === 'ok') assert.equal(clue.text, String(col.show(v)), `${target.n} ${clue.key}`);
      if (clue.state === 'range') {
        const [lo, hi] = clue.text.includes('–') ? clue.text.split('–').map(Number) : clue.text.endsWith('o más') ? [parseInt(clue.text, 10), Infinity] : [-Infinity, parseInt(clue.text, 10)];
        assert.ok(v >= lo && v <= hi, `${target.n} ${clue.key} ${v} fuera de ${clue.text}`);
      }
      if (col.one) for (const x of [v].flat()) assert.ok(!clue.not.includes(col.one(x)), `${target.n} ${clue.key} descarta ${x}`);
    }
  }
});

test('El Tapado: puestos y países descartados; sí o no se sabe al primer intento', () => {
  const chila = players.find((p) => p.n === 'José Luis Chilavert');
  const bianchi = players.find((p) => p.n === 'Carlos Bianchi');
  const c = by('k', tapadoClues([chila], bianchi, 'historia'));
  assert.deepEqual(c.pos.not, ['ARQ']);
  assert.deepEqual(c.nat.not, ['Paraguay']);
  assert.equal(c.sel.state, 'ok');
  assert.equal(c.sel.text, tapadoRow(bianchi, bianchi, 'historia').find((x) => x.key === 'sel').text);
  // Hoy: con tres puestos descartados queda el cuarto.
  const t = squad('t', 'D', 'Argentina', 27, '6', 10, 1);
  const p = by('k', tapadoClues([squad('a', 'G', 'X', 27, '6', 10, 1), squad('b', 'M', 'X', 27, '6', 10, 1), squad('c', 'F', 'X', 27, '6', 10, 1)], t, 'hoy'));
  assert.deepEqual([p.pos.state, p.pos.text], ['ok', 'DEF']);
  assert.deepEqual(p.nat.not, ['X']);
});

test('El Tapado: partida terminada y ficha del revelado', () => {
  const day = 100;
  assert.equal(tapadoDone(null, day, 'hoy'), false);
  assert.equal(tapadoDone({ day: 99, guesses: ['a'], answer: 'a' }, day, 'hoy'), false);
  assert.equal(tapadoDone({ day, guesses: ['b'], answer: 'a' }, day, 'hoy'), false);
  assert.equal(tapadoDone({ day, guesses: ['b', 'a'], answer: 'a' }, day, 'hoy'), true);
  assert.equal(tapadoDone({ day, guesses: Array.from({ length: TAPADO_TRIES.historia }, (_, i) => `x${i}`), answer: 'a' }, day, 'historia'), true);
  assert.equal(tapadoFicha(squad('t', 'D', 'Argentina', 27, '6', 10, 1), 'hoy'), 'Defensor · Argentina · dorsal 6 · 27 años');
  const godin = players.find((p) => p.n === 'Diego Godín');
  assert.equal(tapadoFicha(godin, 'historia'), 'Defensor · Uruguay · en Vélez desde 2022 hasta 2023');
});

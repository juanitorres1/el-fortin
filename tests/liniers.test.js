// El Once de Liniers: la cancha (líneas y dibujo), los nombres cortos, la pista de iniciales y las vidas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ONCE_LIVES, onceFormation, onceInitials, onceProgress, onceRows, onceShort } from '../src/lib/players.js';

const { onces } = JSON.parse(readFileSync(new URL('../public/data/onces.json', import.meta.url), 'utf8'));
const once = onces[0];

test('la cancha va de los delanteros al arquero y el dibujo se cuenta desde atrás', () => {
  const rows = onceRows(once.players);
  assert.deepEqual(rows.map((r) => r[0].pos), ['F', 'M', 'D', 'G']);
  assert.equal(rows.flat().length, 11);
  assert.equal(rows[3][0].n, 'José Luis Chilavert');
  assert.equal(once.players[rows[2][1].i].n, rows[2][1].n); // el índice apunta al jugador del partido
  assert.equal(onceFormation(once.players), '4-4-2');
  for (const o of onces) {
    const f = onceFormation(o.players);
    assert.match(f, /^\d(-\d){2,3}$/);
    assert.equal(f.split('-').reduce((a, b) => a + Number(b), 0), 10, o.id);
  }
  assert.deepEqual(onceRows(undefined), []);
});

test('nombre corto en la cancha e iniciales de la pista', () => {
  assert.equal(onceShort('José Luis Chilavert'), 'Chilavert');
  assert.equal(onceShort('Matías De los Santos'), 'De los Santos');
  assert.equal(onceShort('Maxi Morález'), 'Morález');
  assert.equal(onceShort('Pelé'), 'Pelé');
  assert.equal(onceInitials('José Luis Chilavert'), 'J. L. C.');
  assert.equal(onceInitials('Matías De los Santos'), 'M. D. L. S.');
  for (const o of onces) for (const p of o.players) assert.ok(onceShort(p.n).length >= 3, p.n);
});

test('vidas: cada error y cada pista cuesta una; con la última no hay pista', () => {
  const n = once.players.map((p) => p.n);
  let pr = onceProgress(once, { found: [], wrong: [] }); // guardado viejo, sin `hints`
  assert.equal(pr.lives, ONCE_LIVES);
  assert.equal(pr.canHint, true);
  assert.equal(pr.done, false);
  pr = onceProgress(once, { found: [n[0]], wrong: ['Nadie', 'Otro'], hints: [n[1]] });
  assert.equal(pr.lives, ONCE_LIVES - 3);
  assert.equal(pr.score, 1);
  assert.deepEqual(pr.results.slice(0, 2), [true, false]);
  assert.equal(pr.canHint, false); // queda una sola vida
  assert.equal(pr.done, false);
  pr = onceProgress(once, { found: [], wrong: ['a', 'b', 'c', 'd'], hints: [] });
  assert.equal(pr.lost, true);
  assert.equal(pr.done, true);
  assert.equal(pr.canHint, false);
  pr = onceProgress(once, { found: n, wrong: [], hints: [n[3]] });
  assert.equal(pr.win, true);
  assert.equal(pr.score, 11);
  assert.equal(pr.canHint, false);
});

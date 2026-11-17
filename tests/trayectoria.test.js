// Trayectoria V: estado de la partida (con «Destapar un club») y pistas que se abren con los fallos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PATH_CLUES, PATH_TRIES, historicPlayers, pathClues, pathPool, pathState, pathView } from '../src/lib/players.js';

const players = historicPlayers(JSON.parse(readFileSync(new URL('../public/data/jugadores.json', import.meta.url), 'utf8')));
const pool = pathPool(players);
const target = pool[0];

test('trayectoria: pasar cuenta como intento fallido y destapa un club', () => {
  assert.deepEqual(pathState([], target.id), { tries: 0, won: false, fails: 0, done: false, left: PATH_TRIES });
  const passed = pathState([null], target.id);
  assert.equal(passed.fails, 1);
  assert.equal(passed.left, PATH_TRIES - 1);
  const hiddenNow = pathView(target, passed.fails).steps.filter((s) => s.hidden).length;
  assert.equal(hiddenNow, pathView(target, 0).steps.filter((s) => s.hidden).length - 1);
});

test('trayectoria: acertar termina y no cuenta como fallo', () => {
  const s = pathState([null, 'Q0', target.id], target.id);
  assert.equal(s.won, true);
  assert.equal(s.done, true);
  assert.equal(s.fails, 2);
  assert.equal(s.tries, 3);
});

test('trayectoria: con todos los intentos gastados termina perdida', () => {
  const s = pathState(Array(PATH_TRIES).fill(null), target.id);
  assert.equal(s.done, true);
  assert.equal(s.won, false);
  assert.equal(s.left, 0);
});

test('trayectoria: las pistas se abren de a una desde el segundo fallo', () => {
  for (const p of pool) {
    const open = (f) => pathClues(p, f).filter((c) => c.open).length;
    assert.equal(open(0), 0);
    assert.equal(open(1), 0);
    for (let f = 2; f < PATH_TRIES; f++) assert.ok(open(f) >= open(f - 1));
    assert.ok(pathClues(p, 0).every((c) => c.value === null), 'las cerradas no llevan el dato');
    assert.ok(pathClues(p, 0, true).every((c) => c.open && c.value));
  }
  // Todas se pueden ver antes del último intento.
  assert.ok(PATH_CLUES.every((c) => c.at < PATH_TRIES));
});

test('trayectoria: todos los jugadores del pozo tienen país, puesto y año', () => {
  const missing = pool.filter((p) => pathClues(p, 0, true).length < PATH_CLUES.length).map((p) => p.n);
  assert.deepEqual(missing, []);
});

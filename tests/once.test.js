import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ONCE_SIZE, onceFormation, onceLast, onceLines, onceWarnings } from '../src/lib/games.js';

const POS = { a: 'G', b: 'D', c: 'D', d: 'D', e: 'D', f: 'M', g: 'M', h: 'M', i: 'F', j: 'F', k: 'F', z: 'G' };
const posOf = (id) => POS[id];
const ids = (s) => s.split('').map((id) => ({ id }));

test('onceLines: reparte por puesto respetando el orden; sin puesto conocido va al medio', () => {
  const lines = onceLines(ids('kabxf'), posOf);
  assert.deepEqual(lines.G.map((p) => p.id), ['a']);
  assert.deepEqual(lines.D.map((p) => p.id), ['b']);
  assert.deepEqual(lines.M.map((p) => p.id), ['x', 'f']);
  assert.deepEqual(lines.F.map((p) => p.id), ['k']);
  assert.deepEqual(onceLines(undefined, posOf), { G: [], D: [], M: [], F: [] });
});

test('onceFormation: líneas de campo sin el arquero, sin las vacías', () => {
  assert.equal(onceFormation(onceLines(ids('abcdefghijk'), posOf)), '4-3-3');
  assert.equal(onceFormation(onceLines(ids('abi'), posOf)), '1-1');
  assert.equal(onceFormation(onceLines(ids('a'), posOf)), '');
});

test('onceWarnings: solo con el once completo, sin arquero o con dos', () => {
  assert.equal(ONCE_SIZE, 11);
  assert.deepEqual(onceWarnings(onceLines(ids('abcdefghijk'), posOf)), []);
  assert.deepEqual(onceWarnings(onceLines(ids('bcdefghijk'), posOf)), []);
  assert.deepEqual(onceWarnings(onceLines(ids('bcdefghijkx'), posOf)), ['No elegiste arquero.']);
  assert.deepEqual(onceWarnings(onceLines(ids('azcdefghijk'), posOf)), ['Elegiste 2 arqueros.']);
});

test('onceLast: el partido más reciente con titulares, solo los que siguen en el plantel', () => {
  const games = [
    { id: '2', date: '2026-11-06T22:15Z', players: [{ id: 'a', s: 1 }, { id: 'b', s: 1 }, { id: 'c', s: 0 }] },
    { id: '1', date: '2026-10-31T22:15Z', players: [{ id: 'z', s: 1 }] },
    { id: '3', date: '2026-11-10T22:15Z', players: [{ id: 'k', s: 0 }] },
  ];
  const last = onceLast(games, new Set(['a', 'c']));
  assert.equal(last.game.id, '2');
  assert.deepEqual(last.ids, ['a']);
  assert.deepEqual(onceLast(games).ids, ['a', 'b']);
  assert.equal(onceLast([]), null);
  assert.equal(onceLast(undefined), null);
});

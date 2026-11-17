import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dailyTrivia, dayNumber, findPerson, playStreak, shareText, triviaPool, TRIVIA_SIZE, TRIVIA_TYPES } from '../src/lib/trivia.js';

const club = JSON.parse(readFileSync(new URL('../public/data/club.json', import.meta.url), 'utf8'));
const jugadores = JSON.parse(readFileSync(new URL('../public/data/jugadores.json', import.meta.url), 'utf8'));

test('triviaPool: preguntas de todos los tipos, con la respuesta fuera de las incorrectas', () => {
  const pool = triviaPool(club);
  assert.ok(pool.length >= 40, `hay ${pool.length} preguntas`);
  for (const t of ['historia', 'goleadores', 'presencias', 'torneo', 'palmares', 'momentos', 'idolos']) assert.ok(pool.some((x) => x.type === t), t);
  for (const x of pool) {
    assert.ok(!x.wrong.includes(x.answer), x.text);
    assert.equal(new Set(x.wrong).size, x.wrong.length, x.text);
  }
  // Palmarés: solo títulos con nombre único (el Clausura se ganó varias veces)
  assert.ok(!pool.some((x) => x.type === 'palmares' && /Clausura/.test(x.text)));
  assert.ok(pool.some((x) => x.text === '¿En qué año ganó Vélez la Copa Libertadores?' && x.answer === '1994'));
  // Cubero no aparece (decisión del usuario)
  assert.ok(!pool.some((x) => [x.text, x.answer, ...x.wrong].some((s) => /Cubero/.test(s))));
});

test('dailyTrivia: 5 preguntas fijas por día, de tipos distintos, con 4 opciones y la correcta adentro', () => {
  const day = dayNumber(new Date('2026-10-17T15:00:00Z'));
  const a = dailyTrivia(club, day);
  assert.equal(a.length, TRIVIA_SIZE);
  assert.deepEqual(a, dailyTrivia(club, day)); // mismo día, mismas preguntas
  assert.notDeepEqual(a.map((x) => x.text), dailyTrivia(club, day + 1).map((x) => x.text));
  assert.equal(new Set(a.map((x) => x.type)).size, TRIVIA_SIZE);
  for (const x of a) {
    assert.ok(x.options.includes(x.answer));
    assert.ok(x.options.length >= 3 && x.options.length <= 4);
    assert.equal(new Set(x.options).size, x.options.length);
  }
});

test('dayNumber: cambia a la medianoche de la Argentina, no de UTC', () => {
  assert.equal(dayNumber(new Date('2026-10-18T02:00:00Z')), dayNumber(new Date('2026-10-17T12:00:00Z'))); // 23 h en AR
  assert.equal(dayNumber(new Date('2026-10-18T03:30:00Z')), dayNumber(new Date('2026-10-17T12:00:00Z')) + 1);
});

test('shareText y playStreak', () => {
  assert.equal(shareText([true, false, true], '17/10'), 'El Fortín · Trivia 17/10 · 2/3\n🟦⬜🟦');
  assert.equal(playStreak([10, 11, 12], 12), 3);
  assert.equal(playStreak([10, 11], 12), 2); // todavía no jugó hoy: cuenta hasta ayer
  assert.equal(playStreak([9, 11], 12), 1);
  assert.equal(playStreak([], 12), 0);
});

test('preguntas de personas: llevan el nombre de la respuesta y varias tienen foto con crédito', () => {
  const pool = triviaPool(club);
  for (const x of pool) {
    assert.ok(TRIVIA_TYPES[x.type], x.type);
    if (['goleadores', 'presencias', 'torneo', 'idolos'].includes(x.type)) assert.equal(x.person, x.answer, x.text);
    else assert.equal(x.person, undefined, x.text);
  }
  const people = [...new Set(pool.map((x) => x.person).filter(Boolean))];
  const withPhoto = people.map((n) => findPerson(jugadores.players, n)).filter((p) => p?.img);
  assert.ok(withPhoto.length >= 10, `con foto: ${withPhoto.length}`);
  for (const p of withPhoto) assert.equal(p.img.length, 3); // archivo, autor y licencia: sin crédito no se muestra
  assert.equal(findPerson(jugadores.players, 'Nadie Inventado'), null);
  assert.equal(findPerson(undefined, 'Carlos Bianchi'), null);
  // La del día la trae a la pregunta
  const day = dayNumber(new Date('2026-10-17T15:00:00Z'));
  for (const x of dailyTrivia(club, day)) assert.equal(x.person, triviaPool(club).find((y) => y.text === x.text).person);
});

test('goleador de un torneo: la nota sale de los récords si está entre los goleadores históricos', () => {
  const pool = triviaPool(club).filter((x) => x.type === 'torneo');
  const goleadores = new Map(club.records.goleadores.map((g) => [g.nombre, g]));
  for (const x of pool) {
    const g = goleadores.get(x.answer);
    if (g) assert.equal(x.note, `En total hizo ${g.goles} goles en ${g.partidos} partidos con Vélez (${g.periodo}).`);
    else assert.equal(x.note, null);
  }
});

test('dailyTrivia: nunca la misma persona dos veces el mismo día (una pregunta delataría a la otra)', () => {
  const start = dayNumber(new Date('2026-11-17T15:00:00Z'));
  for (let d = start; d < start + 400; d++) {
    const people = dailyTrivia(club, d).map((x) => x.person).filter(Boolean);
    assert.equal(new Set(people).size, people.length, `día ${d}: ${people.join(', ')}`);
  }
});

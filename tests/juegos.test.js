// Juegos del día: semillas, trivia sin repetidos, Mano a Mano y los juegos de jugadores (con los datos reales del repo).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dailyTrivia, triviaPool, TRIVIA_SIZE } from '../src/lib/trivia.js';
import { GAMES, dailyPick, gameStreak, markPlayed, nextGame, norm, searchPlayers, squares, weekNumber } from '../src/lib/daily.js';
import { DUEL_SIZE, dailyDuels, duelRows } from '../src/lib/duel.js';
import {
  CRITERIA, GRID_MIN, PATH_TRIES, cellPlayers, dailyGrid, gridCheck, historicPlayers, onceNames, onceOfWeek, pathOfDay, pathPool, pathView,
  logoUrl, photoOf, squadPlayers, tapadoOfDay, tapadoPools, tapadoRow,
} from '../src/lib/players.js';
import { cleanStints, clubKey, clubName, commonsFile, logoCode, posOf } from '../scripts/import-jugadores.mjs';
import { lineOfPos, withPhotos } from '../scripts/import-onces.mjs';

const read = (path) => JSON.parse(readFileSync(new URL(`../public/data/${path}`, import.meta.url), 'utf8'));
const club = read('club.json');
const players = historicPlayers(read('jugadores.json'));
const { onces } = read('onces.json');
const DAY = 20406;

test('trivia: no repite una pregunta en menos de 5 días y usa todo el pozo en cada ciclo', () => {
  const pool = triviaPool(club);
  const last = new Map();
  const seen = new Set();
  let minGap = Infinity;
  for (let d = DAY; d < DAY + 120; d++) {
    const qs = dailyTrivia(club, d);
    assert.equal(qs.length, TRIVIA_SIZE);
    assert.equal(new Set(qs.map((q) => q.text)).size, TRIVIA_SIZE);
    for (const q of qs) {
      if (last.has(q.text)) minGap = Math.min(minGap, d - last.get(q.text));
      last.set(q.text, d);
      seen.add(q.text);
    }
  }
  assert.ok(minGap >= 5, `la repetición más cercana fue a ${minGap} días`);
  assert.ok(seen.size >= pool.length - 2, `salieron ${seen.size} de ${pool.length}`);
});

test('dailyPick: recorre todos antes de repetir, no depende del orden y no repite entre ciclos', () => {
  const ids = ['a', 'b', 'c', 'd', 'e'];
  const cycle = [0, 1, 2, 3, 4].map((n) => dailyPick(ids, n, 'x'));
  assert.deepEqual([...cycle].sort(), ids);
  assert.equal(dailyPick([...ids].reverse(), 3, 'x'), cycle[3]);
  for (let n = 0; n < 200; n++) assert.notEqual(dailyPick(ids, n, 'x'), dailyPick(ids, n + 1, 'x'), `día ${n}`);
  assert.equal(dailyPick([], 1, 'x'), null);
  assert.equal(dailyPick(['solo'], 7, 'x'), 'solo');
});

test('nextGame: el siguiente del día sin jugar, dando la vuelta, y null con todos jugados', () => {
  assert.equal(nextGame(new Set(['trivia']), 'trivia').key, 'duelo');
  assert.equal(nextGame(new Set(['liniers', 'trivia']), 'liniers').key, 'duelo');
  assert.equal(nextGame(new Set(['duelo']), 'prode').key, 'trivia');
  const all = new Set(GAMES.filter((g) => g.daily).map((g) => g.key));
  assert.equal(nextGame(all, 'grilla'), null);
});

test('weekNumber: cambia los domingos', () => {
  const day = (iso) => Math.round(Date.parse(`${iso}T00:00:00Z`) / 864e5);
  assert.equal(weekNumber(day('2026-11-14')), weekNumber(day('2026-11-08'))); // sábado y el domingo anterior
  assert.equal(weekNumber(day('2026-11-15')), weekNumber(day('2026-11-14')) + 1); // domingo
});

test('searchPlayers: sin tildes, por comienzo de palabra, primero por apellido y los más conocidos', () => {
  assert.equal(norm('  José Luis CHILAVERT '), 'jose luis chilavert');
  assert.equal(searchPlayers(players, 'chila')[0].n, 'José Luis Chilavert');
  assert.equal(searchPlayers(players, 'jose chi')[0].n, 'José Luis Chilavert');
  assert.deepEqual(searchPlayers(players, 'c'), []);
  assert.ok(searchPlayers(players, 'zarate').length >= 3);
  assert.ok(searchPlayers(players, 'a b').length <= 6);
});

test('racha: días seguidos con algún juego, sumando los de la trivia vieja', () => {
  let log = markPlayed({}, 10, 'duelo');
  log = markPlayed(log, 10, 'duelo');
  log = markPlayed(log, 11, 'tapado');
  assert.deepEqual(log, { 10: ['duelo'], 11: ['tapado'] });
  assert.equal(gameStreak(log, 11), 2);
  assert.equal(gameStreak(log, 12), 2); // hoy todavía no jugó: sigue en pie hasta mañana
  assert.equal(gameStreak(log, 13), 0);
  assert.equal(gameStreak(log, 11, [9, 8]), 4);
  assert.ok(!(5 in markPlayed({ 5: ['trivia'] }, 500, 'trivia')));
  assert.equal(squares([true, false, 'near']), '🟦⬜🟨');
  assert.equal(squares([true, false, true, true], 2), '🟦⬜\n🟦🟦');
  assert.equal(new Set(GAMES.map((g) => g.key)).size, GAMES.length);
});

test('Mano a Mano: 10 duelos fijos por día, sin empates y con la respuesta correcta', () => {
  const mk = (id, n) => ({ id: String(id), name: `Rival ${id}`, pj: 20 + n * 3, g: 5 + n, e: 4 + (n % 7), p: 6 + (n % 5), gf: 20 + n * 2, gc: 15 + n });
  const rows = Array.from({ length: 40 }, (_, i) => mk(i + 1, i * 2));
  const a = dailyDuels(rows, DAY);
  assert.equal(a.length, DUEL_SIZE);
  assert.deepEqual(a, dailyDuels(rows, DAY));
  assert.notDeepEqual(a, dailyDuels(rows, DAY + 1));
  for (const d of a) {
    assert.notEqual(d.a.value, d.b.value);
    assert.notEqual(d.a.id, d.b.id);
    assert.equal(d.answer, d.a.value > d.b.value ? 'a' : 'b');
  }
  assert.deepEqual(dailyDuels([], DAY), []);
  const m = (id, v, r) => ({ completed: true, comp: 'Liga', date: '2020-01-01T00:00Z', home: { id: '21', name: 'Vélez', score: v }, away: { id, name: id, score: r } });
  const many = Array.from({ length: 12 }, () => m('9', 2, 1));
  assert.deepEqual(duelRows([...many, m('8', 1, 1)]), [{ id: '9', name: '9', pj: 12, g: 12, e: 0, p: 0, gf: 24, gc: 12 }]);
});

test('jugadores.json: forma de los datos y pozo suficiente para cada juego', () => {
  assert.ok(players.length >= 300, `hay ${players.length}`);
  assert.equal(new Set(players.map((p) => p.id)).size, players.length);
  for (const p of players) {
    assert.ok(p.n && Array.isArray(p.pos) && Array.isArray(p.nat) && Array.isArray(p.c), p.id);
    assert.ok(p.c.some((c) => c[5]), `${p.n} sin etapa en Vélez`);
    assert.ok(p.pos.every((x) => 'GDMF'.includes(x)), p.n);
  }
  const { guess, answers } = tapadoPools(players);
  assert.ok(answers.length >= 80 && guess.length >= answers.length);
  assert.ok(pathPool(players).length >= 100);
});

test('El Tapado: la fila compara cada dato con la respuesta', () => {
  const { answers } = tapadoPools(players);
  const target = tapadoOfDay(answers, DAY, 'historia');
  assert.ok(target);
  assert.equal(tapadoOfDay(answers, DAY, 'historia').id, target.id);
  assert.ok(tapadoRow(target, target, 'historia').every((c) => c.state === 'ok' && c.dir === null));
  const chila = players.find((p) => p.n === 'José Luis Chilavert');
  const bianchi = players.find((p) => p.n === 'Carlos Bianchi');
  const row = Object.fromEntries(tapadoRow(chila, bianchi, 'historia').map((c) => [c.key, c]));
  assert.equal(row.pos.state, 'no');
  assert.equal(row.nat.state, 'no');
  assert.equal(row.b.dir, 'down'); // Bianchi nació antes
  assert.equal(row.sel.state, 'ok');
  const squad = squadPlayers({ players: [{ id: '1', name: 'Uno', pos: 'G', nat: 'Argentina', age: 30, jersey: '1' }, { id: '2', name: 'Dos', pos: 'F', nat: 'Uruguay', age: 31, jersey: '9' }, { id: '3', name: 'Sin dorsal', pos: 'F', age: 20, jersey: null }] }, { tournaments: [{ players: [{ id: '2', pj: 10, g: 4 }] }] });
  assert.equal(squad.length, 2);
  const hoy = Object.fromEntries(tapadoRow(squad[0], squad[1], 'hoy').map((c) => [c.key, c]));
  assert.deepEqual([hoy.pos.state, hoy.age.state, hoy.age.dir, hoy.jersey.state, hoy.g.state], ['no', 'near', 'up', 'no', 'no']);
});

test('Trayectoria V: Vélez siempre a la vista y cada fallo destapa un club', () => {
  const target = pathOfDay(players, DAY);
  assert.ok(target && target.c.length >= 4);
  const start = pathView(target, 0);
  assert.ok(start.steps.every((s) => s.hidden !== s.velez));
  assert.equal(start.hint, null);
  const others = target.c.filter((c) => !c[5]).length;
  assert.equal(pathView(target, 2).steps.filter((s) => s.hidden).length, Math.max(0, others - 2));
  assert.ok(pathView(target, 3).hint);
  assert.ok(pathView(target, 0, true).steps.every((s) => !s.hidden));
  assert.ok(PATH_TRIES >= 4);
});

test('Grilla: todos los días del próximo año tienen solución en cada casilla', () => {
  for (const c of CRITERIA) assert.ok(players.filter(c.test).length >= GRID_MIN, `${c.label}: ${players.filter(c.test).length}`);
  for (let d = DAY; d < DAY + 365; d++) {
    const grid = dailyGrid(players, d);
    assert.ok(grid, `día ${d} sin grilla`);
    assert.equal(new Set([...grid.rows, ...grid.cols].map((c) => c.id)).size, 6);
    for (const r of grid.rows) for (const c of grid.cols) assert.ok(cellPlayers(players, r, c).length >= GRID_MIN, `día ${d}: ${r.label} × ${c.label}`);
  }
  const grid = dailyGrid(players, DAY);
  assert.deepEqual(grid, dailyGrid(players, DAY));
  const ok = cellPlayers(players, grid.rows[1], grid.cols[2])[0];
  assert.equal(gridCheck(grid, 5, ok), true);
  assert.equal(dailyGrid([], DAY), null);
});

test('El Once de Liniers: 11 titulares por partido, con arquero, y uno distinto cada semana', () => {
  assert.ok(onces.length >= 10);
  for (const o of onces) {
    assert.equal(o.players.length, 11, o.title);
    assert.equal(new Set(o.players.map((p) => p.n)).size, 11, o.title);
    assert.equal(o.players.filter((p) => p.pos === 'G').length, 1, o.title);
    assert.match(o.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(o.score, /^\d+-\d+$/);
    assert.match(o.src, /^https:\/\//);
  }
  // Un ciclo entero (tantas semanas como partidos, desde el comienzo de un ciclo): no se repite ninguno.
  const first = Math.ceil(weekNumber(DAY) / onces.length) * onces.length;
  const weeks = Array.from({ length: onces.length }, (_, i) => onceOfWeek(onces, (first + i) * 7 + 3).id);
  assert.equal(new Set(weeks).size, onces.length);
  assert.equal(onceOfWeek(onces, 20405).id, onceOfWeek(onces, 20402).id); // misma semana (de domingo a sábado)
  assert.ok(onceNames(onces).length >= 60);
  assert.equal(onceOfWeek([], DAY), null);
});

test('fotos y escudos: crédito de cada foto, escudo de ESPN o de Commons, y cobertura de los datos', () => {
  const photo = photoOf(['Foo bar.jpg', 'Ana Pérez', 'CC BY-SA 4.0']);
  assert.match(photo.src, /^https:\/\/commons\.wikimedia\.org\/wiki\/Special:FilePath\/Foo%20bar\.jpg\?width=96$/);
  assert.equal(photo.credit, 'Foto: Ana Pérez · CC BY-SA 4.0 · Wikimedia Commons');
  assert.equal(photo.href, 'https://commons.wikimedia.org/wiki/File:Foo_bar.jpg');
  assert.match(photoOf(['x.jpg', 'Unknown author Unknown author', 'Public domain']).credit, /autor desconocido/);
  assert.equal(photoOf(null), null);
  assert.equal(logoUrl('e21'), 'https://a.espncdn.com/i/teamlogos/soccer/500/21.png');
  assert.match(logoUrl('cEscudo.svg'), /Special:FilePath\/Escudo\.svg\?width=64$/);
  assert.equal(logoUrl(undefined), null);
  // Toda foto del repo lleva autor y licencia (sin eso no se muestra), y Vélez siempre tiene su escudo.
  for (const p of players) {
    if (p.img) assert.ok(p.img.length === 3 && p.img.every((x) => typeof x === 'string' && x), p.n);
    for (const c of p.c) if (c[5]) assert.match(c[6], /\/21\.png$/, p.n);
  }
  assert.ok(players.filter((p) => p.photo).length >= 100);
  const stints = players.flatMap((p) => p.c);
  assert.ok(stints.filter((c) => c[6]).length / stints.length > 0.7);
  for (const o of onces) {
    assert.match(o.rivalId, /^\d+$/, o.title);
    for (const p of o.players) if (p.img) assert.equal(p.img.length, 3, p.n);
  }
  // Importador: el club se busca dentro de su país, por nombre sin «Club», «FC», tildes ni orden.
  assert.equal(clubKey('Club Atlético de Madrid'), clubKey('Atlético Madrid'));
  assert.equal(clubKey('Newell’s Old Boys'), clubKey("Newell's Old Boys"));
  assert.equal(commonsFile('http://commons.wikimedia.org/wiki/Special:FilePath/Foo%20bar_x.jpg'), 'Foo bar x.jpg');
  const index = new Map([['Argentina', new Map([[clubKey('River Plate'), '16']])], ['Uruguay', new Map()]]);
  assert.equal(logoCode({ id: 'Q1', club: 'River Plate', label: 'Club Atlético River Plate', pais: 'Argentina' }, index), 'e16');
  assert.equal(logoCode({ id: 'Q2', club: 'River Plate', label: 'Club Atlético River Plate', pais: 'Uruguay', logo: 'River.svg' }, index), 'cRiver.svg');
  assert.equal(logoCode({ id: 'Q3', club: 'Otro', label: 'Otro', pais: 'Chile' }, index), null);
  assert.equal(logoCode({ id: 'Q215163', club: 'Vélez Sarsfield', label: 'x', pais: 'Argentina' }, index), 'e21');
  const once = withPhotos({ players: [{ n: 'Maxi Morález' }, { n: 'Nadie' }] }, [{ n: 'Maximiliano Moralez', img: ['m.jpg', 'A', 'CC0'] }]);
  assert.deepEqual(once.players, [{ n: 'Maxi Morález', img: ['m.jpg', 'A', 'CC0'] }, { n: 'Nadie' }]);
});

test('importadores: puesto, nombre de club y etapas repetidas', () => {
  assert.equal(posOf('defensa central'), 'D');
  assert.equal(posOf('guardameta'), 'G');
  assert.equal(posOf('extremo'), 'F');
  assert.equal(posOf(undefined), null);
  assert.equal(clubName('Club Atlético River Plate'), 'River Plate');
  assert.equal(clubName('Club Atlético de Madrid'), 'Atlético de Madrid');
  assert.equal(clubName('Racing Club'), 'Racing Club');
  assert.deepEqual([lineOfPos('G'), lineOfPos('CD-L'), lineOfPos('RB'), lineOfPos('AM-R'), lineOfPos('RF'), lineOfPos('D')], ['G', 'D', 'D', 'M', 'F', 'D']);
  const row = (club, s, e, apps) => ({ club, clubLabel: club, s: s && `${s}-01-01T00:00:00Z`, e: e && `${e}-01-01T00:00:00Z`, apps, eu: 'false', national: 'false' });
  const { stints, national } = cleanStints([
    row('Vélez', 1991, 2000, '343'), row('Vélez', 1991, 2001), // la misma etapa dos veces
    row('Lazio', 2008, 2009, '10'), row('Lazio', 2009, 2013, '20'), // renovó: una sola etapa
    row('Vélez', 2013, 2014, '29'), // volvió: etapa aparte
    { ...row('Selección de fútbol de Paraguay', 1989, 2003), national: 'true' },
    row('Vélez Sarsfield sub-20', 1989, 1990),
  ]);
  assert.equal(national, true);
  assert.deepEqual(stints.map((s) => [s.club, s.from, s.to, s.pj]), [['Vélez', 1991, 2000, 343], ['Lazio', 2008, 2013, 30], ['Vélez', 2013, 2014, 29]]);
});

// ---------- Informe nov-2026 ----------
import { dateDistractors } from '../src/lib/trivia.js';
import { fmtWait, recordResult, resultStats, untilNext } from '../src/lib/daily.js';
import { GRID_TRIES, SQUAD_MIN, gridState, squadAnswers } from '../src/lib/players.js';

test('trivia: las opciones incorrectas tienen la misma forma que la correcta y no delatan la época', () => {
  const club = read('club.json');
  const shape = (s) => (/^\d{4}$/.test(s) ? 'año' : /^\d{4}–\d{4}$/.test(s) ? 'rango' : /^\d{4}\/\d{2}$/.test(s) ? 'temporada' : / pen\.$/.test(s) ? 'penales' : /^\d+-\d+$/.test(s) ? 'resultado' : 'texto');
  const pool = triviaPool(club);
  for (const x of pool) {
    for (const w of x.wrong) assert.equal(shape(w), shape(x.answer), `${x.text}: «${w}» vs «${x.answer}»`);
    assert.ok(x.wrong.length >= 3, `${x.text}: pocas opciones`);
  }
  // Sin el período en la pregunta de goleadores y presencias (lo daba regalado), salvo para desempatar dos con la
  // misma cifra (Carone y Benito, 75 goles): entonces el otro no es opción. Ninguna pregunta se repite.
  const withPeriod = pool.filter((x) => ['goleadores', 'presencias'].includes(x.type) && /\(\d{4}/.test(x.text));
  assert.deepEqual(withPeriod.map((x) => x.answer).sort(), ['Juan Carlos Carone', 'Miguel Ángel Benito']);
  assert.ok(!withPeriod.some((x) => x.wrong.some((w) => withPeriod.some((y) => y.answer === w))));
  assert.equal(new Set(pool.map((x) => x.text)).size, pool.length);
  // Goleador de un torneo: las opciones son de torneos de a lo sumo 20 años de distancia cuando hay con qué.
  const q95 = pool.find((x) => x.text.includes('Clausura 1995'));
  assert.ok(q95 && !q95.wrong.includes('Salvador Carreras'));
  // Ninguna opción de fecha es posterior a lo que hay en los datos.
  assert.deepEqual(dateDistractors('2023–2025', [], 2025).every((r) => Number(r.slice(5)) <= 2025), true);
  assert.ok(dateDistractors('2012/13', [], 2025).every((s) => /^\d{4}\/\d{2}$/.test(s)));
});

test('historial de los juegos: guardar, números y cuánto falta para el próximo', () => {
  let h = {};
  h = recordResult(h, 100, 3);
  h = recordResult(h, 101, 5);
  h = recordResult(h, 600, 4); // borra lo de hace más de 400 días
  assert.deepEqual(Object.keys(h), ['600']);
  assert.deepEqual(resultStats({ 1: 3, 2: 5, 3: 4 }, 'score', 5), { played: 3, avg: 4, best: 5, perfect: 1 });
  assert.deepEqual(resultStats({ 1: 2, 2: 0, 3: 4, 4: 3 }, 'guess'), { played: 4, wins: 3, pct: 75, avg: 3 });
  assert.deepEqual(resultStats({}, 'score', 5), { played: 0, avg: null, best: null, perfect: 0 });
  // 23:30 en la Argentina (02:30 UTC) → faltan 30 minutos; el semanal, hasta el domingo 00:00.
  const now = Date.parse('2026-11-18T02:30:00Z'); // martes 17 a las 23:30 AR
  assert.equal(untilNext(now), 30 * 60e3);
  assert.equal(untilNext(now, true), (4 * 24 * 60 + 30) * 60e3); // domingo 22 00:00 AR
  assert.equal(fmtWait(30 * 60e3), '30 min');
  assert.equal(fmtWait((5 * 60 + 12) * 60e3), '5 h 12 min');
  assert.equal(fmtWait((4 * 24 * 60 + 30) * 60e3), '4 días');
});

test('El Tapado de hoy: la respuesta sale de los que jugaron (o de los que más jugaron a principio de torneo)', () => {
  const squad = Array.from({ length: 20 }, (_, i) => ({ id: String(i), pj: i < 10 ? i + 1 : 0 }));
  assert.ok(squadAnswers(squad).every((p) => p.pj > 0));
  const early = Array.from({ length: 20 }, (_, i) => ({ id: String(i), pj: i < 3 ? 1 : 0 }));
  assert.equal(squadAnswers(early).length, SQUAD_MIN);
  assert.ok(['0', '1', '2'].every((id) => squadAnswers(early).some((p) => p.id === id)));
});

test('Grilla: cupo total de intentos, un error no cierra la casilla, y las partidas viejas se leen igual', () => {
  assert.equal(GRID_TRIES, 12);
  let g = gridState({ cells: { 0: { id: 'a', ok: true } }, misses: [{ i: 1, id: 'b' }, { i: 1, id: 'c' }] });
  assert.equal(g.used, 3);
  assert.equal(g.left, 9);
  assert.ok(g.closed.has(0) && !g.closed.has(1));
  assert.deepEqual(g.missed[1], ['b', 'c']);
  assert.equal(g.done, false);
  g = gridState({ cells: { 0: { id: 'a', ok: true } }, misses: Array.from({ length: 11 }, (_, k) => ({ i: 2, id: String(k) })) });
  assert.equal(g.done, true); // sin intentos
  g = gridState({ cells: { 3: { id: 'x', ok: false } } }); // guardado de antes: el error cierra esa casilla
  assert.ok(g.closed.has(3) && g.right[3] == null && g.left === 11);
});

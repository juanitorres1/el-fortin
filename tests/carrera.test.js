// Modo Carrera: fixture, simulación, jugadas, avance de la carrera, guardado y balance (con la tabla real del snapshot).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { ATTR_CAP, ROLE_AT, newPlayer, objective, trainOdds, overall, roleOf, train, trainChance, validExtra, cleanName } from '../src/lib/carrera/player.js';
import { expectedGoals, playoffPairs, roundRobin, schedule, simMatch, strengthOf, table, teamsFrom } from '../src/lib/carrera/season.js';
import { AIMS, DRIBBLES, PASSES, kindText, markerAt, outcomeKind, quality, resolveDribble, resolvePass, resolveShot, shotChance } from '../src/lib/carrera/match.js';
import { EVENTS, applyFx, fxText, goalProgress, goalsFor } from '../src/lib/carrera/extras.js';
import {
  answerMoment, answerPress, buyPerk, chooseEvent, currentGame, dismissLast, eventsAt, finishMatch, velezCalendar, weekEvent, matchDone, newCareer, nextTorneo, retire, retireState, scoreAt, skipWeek, startMatch, torneoLabel, trainWeek, zoneTables,
} from '../src/lib/carrera/career.js';
import { exportCode, importCode, isCareer, migrate } from '../src/lib/carrera/save.js';
import { rng } from '../src/lib/trivia.js';

const SNAP = new URL('../public/data/generated/snapshot.json', import.meta.url);
// Sin `npm run data` no hay snapshot: una tabla de mentira con dos zonas de 15 (los ids no importan).
const fakeStandings = () => ({
  year: 2026,
  groups: [0, 1].map((z) => ({ rows: Array.from({ length: 15 }, (_, i) => ({ id: z === 0 && i === 3 ? '21' : `${z}${i}`, name: `Equipo ${z}-${i}`, pj: 15, pts: 40 - i * 2, dg: 12 - i * 2 })) })),
});
const snap = existsSync(SNAP) ? JSON.parse(readFileSync(SNAP, 'utf8')) : null;
const standings = snap?.standings?.groups?.length ? snap.standings : fakeStandings();
const roster = snap?.roster ?? { players: [{ name: 'Compañero Uno', pos: 'F' }, { name: 'Compañero Dos', pos: 'M' }] };

const create = (seed = 7, pos = 'del') => newCareer({ name: 'Pibe de Prueba', pos, extra: { remate: 3, velocidad: 3 }, standings, roster, velezId: '21', seed });

/** Juega una semana entera con una estrategia: entrena, juega cada jugada y cierra. `aimAt` = dónde frena la barra. */
function playWeek(state, { trainKey = 'remate', aim = (m) => m.center, r = Math.random } = {}) {
  let s = state;
  const g = currentGame(s);
  if (!g) return s;
  s = trainWeek(s, s.player.energy < 45 ? 'descanso' : trainKey);
  if (g.kind === 'libre') return dismissLast(skipWeek(s));
  s = startMatch(s);
  while (!matchDone(s.torneo.match)) {
    const m = s.torneo.match;
    const mo = m.moments[m.answers.length];
    const choice = mo.type === 'pase' ? PASSES[Math.floor(r() * 3)].key : AIMS[Math.floor(r() * 3)].key;
    s = answerMoment(s, { choice, x: aim(mo, r) });
  }
  return dismissLast(finishMatch(s));
}
const playTorneo = (s, opts) => {
  let guard = 0;
  while (s.torneo.phase !== 'fin' && guard++ < 40) s = playWeek(s, opts);
  return s;
};

test('roundRobin: con 15 equipos, 15 fechas, cada par una vez y nadie dos veces en la misma fecha', () => {
  const ids = Array.from({ length: 15 }, (_, i) => `t${i}`);
  const rounds = roundRobin(ids);
  assert.equal(rounds.length, 15);
  const pairs = new Set();
  for (const games of rounds) {
    const used = games.flat();
    assert.equal(new Set(used).size, used.length);
    assert.equal(games.length, 7);
    for (const [a, b] of games) pairs.add([a, b].sort().join('-'));
  }
  assert.equal(pairs.size, (15 * 14) / 2);
  // Localía repartida: cada uno es local en 6 a 8 de sus 14 partidos.
  for (const id of ids) { const n = rounds.flat().filter(([h]) => h === id).length; assert.ok(n >= 6 && n <= 8, `${id}: ${n}`); }
});

test('schedule y tabla: dos zonas juntas por fecha; la tabla suma bien', () => {
  const teams = teamsFrom(standings, '21');
  assert.ok(teams.length >= 4);
  const fx = schedule(teams, rng(1));
  const results = fx.map((f) => f.map(() => [1, 0]));
  const zones = zoneTables({ teams, fixtures: fx, results });
  for (const z of zones) {
    const pts = z.reduce((s, r) => s + r.pts, 0);
    const pj = z.reduce((s, r) => s + r.pj, 0);
    assert.equal(pts, (pj / 2) * 3); // todos ganados por el local: 3 puntos por partido
    assert.deepEqual(z.map((r) => r.rank), z.map((_, i) => i + 1));
  }
  assert.equal(teamsFrom({ groups: [] }, '21'), null);
});

test('strengthOf y goles esperados: rangos razonables y ventaja de local', () => {
  assert.equal(strengthOf({ pj: 0, pts: 0, dg: 0 }), 52);
  assert.ok(strengthOf({ pj: 15, pts: 45, dg: 25 }) <= 72);
  const [h, a] = expectedGoals(60, 60);
  assert.ok(h > a && h + a > 2 && h + a < 2.4);
  const r = rng(3);
  let goals = 0;
  for (let i = 0; i < 4000; i++) goals += simMatch(r, 60, 60).reduce((x, y) => x + y);
  const avg = goals / 4000;
  assert.ok(avg > 1.9 && avg < 2.5, `promedio de goles ${avg}`);
});

test('playoffPairs: 1.º contra 8.º cruzado entre zonas, 8 cruces sin repetidos', () => {
  const t = (z) => Array.from({ length: 15 }, (_, i) => ({ id: `${z}${i + 1}` }));
  const pairs = playoffPairs([t('A'), t('B')]);
  assert.equal(pairs.length, 8);
  assert.deepEqual(pairs[0], ['A1', 'B8']);
  assert.equal(new Set(pairs.flat()).size, 16);
});

test('jugador: reparto de puntos, nombre limpio, rol según el DT y entrenamiento', () => {
  assert.ok(validExtra({ remate: 4, pase: 2 }));
  assert.ok(!validExtra({ remate: 5 }));
  assert.ok(!validExtra({ remate: 4, pase: 3 }));
  assert.ok(!validExtra({ magia: 1 }));
  assert.equal(cleanName('  Juan   <b>Román</b>  '), 'Juan bRomán/b');
  assert.throws(() => newPlayer({ name: '   ', pos: 'del' }));
  const p = newPlayer({ name: 'X', pos: 'vol', extra: { pase: 2 } });
  assert.equal(p.attrs.pase, 54);
  assert.ok(overall(p) > 40 && overall(p) < 60);
  assert.equal(roleOf({ ...p, dt: ROLE_AT.sub - 1 }), 'reserva');
  assert.equal(roleOf({ ...p, dt: ROLE_AT.start }), 'titular');
  assert.equal(roleOf({ ...p, dt: ROLE_AT.start, energy: 10 }), 'suplente');
  assert.equal(trainChance(50, 10), 0);
  assert.ok(trainChance(90, 100) < trainChance(50, 100));
  const r = train(p, 'descanso', rng(1));
  assert.equal(r.player.energy, 100);
  assert.equal(train({ ...p, energy: 60 }, 'descanso', rng(1)).player.energy, 95);
});

test('barra de timing: el marcador va y vuelve; la calidad es máxima en el centro de la zona', () => {
  assert.equal(markerAt(0, 1000), 0);
  assert.equal(markerAt(1000, 1000), 1);
  assert.equal(markerAt(1500, 1000), 0.5);
  assert.equal(markerAt(2000, 1000), 0);
  assert.equal(quality(0.5, 0.5, 0.1), 1);
  assert.ok(Math.abs(quality(0.6, 0.5, 0.1) - 0.5) < 1e-9);
  assert.ok(quality(0.9, 0.5, 0.1) === 0);
  assert.ok(shotChance({ q: 1, kind: 'mano', attr: 60, rivalStr: 55 }) > shotChance({ q: 0.2, kind: 'afuera', attr: 50, rivalStr: 70 }));
  // Si el arquero adivina, cuesta más.
  let guessed = 0;
  let total = 0;
  const r = rng(9);
  for (let i = 0; i < 3000; i++) {
    const res = resolveShot(r, { q: 0.8, aim: 'izq', kind: 'mano', attr: 55, rivalStr: 60 });
    if (res.keeper === 'izq') { total += 1; guessed += res.goal ? 1 : 0; }
  }
  assert.ok(guessed / total < 0.3);
});

test('carrera: misma semilla y mismas decisiones = mismo resultado, y nada se modifica en el lugar', () => {
  const a = create(11);
  const b = create(11);
  assert.deepEqual(a, b);
  const frozen = structuredClone(a);
  const s1 = playWeek(a, { r: rng(5) });
  const s2 = playWeek(b, { r: rng(5) });
  assert.deepEqual(s1, s2);
  assert.deepEqual(a, frozen);
  assert.equal(a.torneo.week, 0);
  assert.equal(s1.torneo.week, 1);
});

test('carrera: arranca en Reserva, juega un torneo entero y lo cierra con resumen', () => {
  let s = create(21);
  assert.equal(roleOf(s.player), 'reserva');
  assert.match(s.torneo.label, /^Apertura 20\d\d$/);
  s = playTorneo(s, { r: rng(2), aim: (m) => m.center });
  assert.equal(s.torneo.phase, 'fin');
  const sum = s.torneo.summary;
  assert.ok(sum.res.pj + sum.pj >= 14, 'jugó todas las fechas en algún equipo');
  assert.ok(sum.pj > 0, 'jugando bien llega a Primera en el primer torneo');
  assert.ok(sum.result);
  assert.ok(s.torneo.results.every((f) => f.every((x) => Array.isArray(x) && x.length === 2)));
  const next = nextTorneo(s);
  assert.equal(next.torneo.n, 2);
  assert.match(next.torneo.label, /^Clausura/);
  assert.equal(next.history.length, 1);
  assert.equal(next.player.age, 18.5);
  assert.equal(torneoLabel(2027, 3), 'Apertura 2028');
});

test('balance: un buen delantero hace goles creíbles; uno que juega mal no se afianza', () => {
  const good = [];
  const badDt = [];
  for (let seed = 1; seed <= 12; seed++) {
    let s = create(seed);
    s = playTorneo(s, { r: rng(seed), aim: (m) => m.center });
    s = playTorneo(nextTorneo(s), { r: rng(seed + 100), aim: (m) => m.center });
    good.push(s.torneo.summary.g);
    let b = create(seed);
    b = playTorneo(b, { r: rng(seed), aim: (m) => (m.center > 0.5 ? 0 : 1) });
    badDt.push(b.player.dt);
  }
  const avgGood = good.reduce((a, b) => a + b, 0) / good.length;
  assert.ok(avgGood >= 4 && avgGood <= 16, `goles por torneo de un buen delantero titular: ${avgGood}`);
  assert.ok(badDt.every((dt) => dt < ROLE_AT.start), `confianza del DT jugando mal: ${badDt}`);
});

test('partido: el marcador por jugada solo cuenta lo anterior; en playoffs con empate se patea un penal', () => {
  let s = create(4);
  s = trainWeek(s, 'remate');
  assert.equal(trainWeek(s, 'pase'), s, 'una sola sesión por semana');
  if (currentGame(s).kind === 'libre') s = dismissLast(skipWeek(s));
  s = startMatch(s);
  const m = s.torneo.match;
  assert.ok(m.moments.length >= 2);
  const [v0, r0] = scoreAt(m, 0);
  const [vf, rf] = scoreAt(m);
  assert.ok(v0 <= vf && r0 <= rf);
  // Justo después de una jugada: cuenta lo de su minuto, nunca lo que viene después.
  const after = eventsAt(m, 0, true);
  assert.ok(after.every((e) => (e.mi != null ? e.mi <= 0 : e.min <= m.moments[0].min)));
  assert.ok(after.length >= eventsAt(m, 0).length);
  // Forzar un playoff empatado para ver el penal.
  const ko = structuredClone(s);
  ko.torneo.match.kind = 'playoff';
  ko.torneo.match.side = 'primera';
  ko.torneo.match.events = [];
  let k = ko;
  for (let i = 0; i < 3 && !matchDone(k.torneo.match); i++) k = answerMoment(k, { choice: 'corto', x: 0 });
  // Pase o remate fallado con x = 0 casi siempre: sin goles, termina empatado 0-0.
  const [a, b] = scoreAt(k.torneo.match);
  if (a === b) assert.equal(k.torneo.match.moments.at(-1).type, 'penal');
});

test('guardado: el código va y vuelve; lo roto o de otra versión no se carga', () => {
  const s = playWeek(create(8), { r: rng(1) });
  assert.ok(isCareer(s));
  const code = exportCode(s);
  assert.match(code, /^FORTIN1:/);
  assert.deepEqual(importCode(code), s);
  assert.deepEqual(importCode(`  ${code.slice(0, 20)}\n${code.slice(20)} `), s);
  assert.equal(importCode('hola'), null);
  assert.equal(importCode('FORTIN1:@@@'), null);
  assert.equal(migrate({ ...s, v: 99 }), null);
  assert.equal(migrate(null), null);
  // Cabe holgado en localStorage (5 MB) aun con varios torneos.
  assert.ok(JSON.stringify(s).length < 60_000, `tamaño ${JSON.stringify(s).length}`);
});

test('hub: objetivo según el rol, calendario de Vélez, forma e hitos del partido', () => {
  const p = newPlayer({ name: 'X', pos: 'del' });
  assert.equal(objective(p).to, ROLE_AT.sub);
  assert.equal(objective({ ...p, dt: 60 }).to, ROLE_AT.start);
  assert.equal(objective({ ...p, dt: 90 }).to, 100);
  assert.equal(trainOdds(50, 10), 'fundido');
  assert.equal(trainOdds(50, 100), 'alta');
  assert.equal(trainOdds(65, 100), 'media');
  assert.equal(trainOdds(80, 100), 'baja');
  let s = create(31);
  const cal0 = velezCalendar(s);
  assert.equal(cal0.length, s.torneo.fixtures.length);
  assert.equal(cal0.filter((x) => x.now).length, 1);
  assert.ok(cal0.filter((x) => !x.libre).every((x) => x.rival && typeof x.home === 'boolean' && x.score === null));
  s = playTorneo(s, { r: rng(3), aim: (m) => m.center });
  const cal = velezCalendar(s);
  assert.ok(cal.filter((x) => !x.libre).every((x) => x.played && x.score.length === 2));
  assert.ok(cal.every((x) => !x.now));
  assert.ok(s.player.form.length > 0 && s.player.form.length <= 5);
  // El debut aparece como hito en el resultado del partido en que pasó.
  let t = create(21);
  let debutSeen = false;
  for (let w = 0; w < 30 && t.torneo.phase !== 'fin'; w++) {
    const g = currentGame(t);
    t = trainWeek(t, 'descanso');
    if (g.kind === 'libre') { t = dismissLast(skipWeek(t)); continue; }
    t = startMatch(t);
    while (!matchDone(t.torneo.match)) { const mo = t.torneo.match.moments[t.torneo.match.answers.length]; t = answerMoment(t, { choice: mo.type === 'pase' ? 'filtrado' : 'izq', x: mo.center }); }
    t = finishMatch(t);
    if (t.torneo.last?.news?.some((n) => n.startsWith('Debutaste'))) debutSeen = true;
    t = dismissLast(t);
  }
  assert.ok(debutSeen, 'el debut se festeja en el resultado');
});

test('jugadas: cada resultado dice qué pasó y coincide con el texto; los guardados viejos se deducen', () => {
  const r = rng(12);
  const seen = new Set();
  for (let i = 0; i < 3000; i++) {
    const q = r();
    const res = resolveShot(r, { q, aim: AIMS[i % 3].key, kind: 'area', attr: 55, rivalStr: 60 });
    seen.add(res.kind);
    assert.equal(res.goal, res.kind === 'gol');
    assert.equal(outcomeKind('remate', { ...res, kind: undefined, q, choice: AIMS[i % 3].key }), res.kind);
    const pass = resolvePass(r, { q, option: PASSES[i % 3].key, attr: 50, rivalStr: 60, mate: 'X' });
    assert.equal(outcomeKind('pase', { ...pass, kind: undefined }), pass.kind);
  }
  assert.deepEqual([...seen].sort(), ['afuera', 'atajada', 'gol', 'mal', 'palo']);
});

test('gambeta: si sale, la jugada sigue con un remate en el mismo minuto; si no, se pierde', () => {
  const r = rng(4);
  let ok = 0;
  for (let i = 0; i < 2000; i++) {
    const res = resolveDribble(r, { q: 0.8, option: DRIBBLES[i % 3].key, attr: 55, rivalStr: 60 });
    assert.equal(res.kind, res.ok ? 'gambeta' : 'perdida');
    assert.equal(res.next, res.ok ? (DRIBBLES[i % 3].key === 'cano' ? 'mano' : 'area') : null);
    ok += res.ok ? 1 : 0;
  }
  assert.ok(ok > 700 && ok < 1500, `gambetas buenas: ${ok}`);
  // Buscar una gambeta en un partido y jugarla bien hasta que salga.
  let found = false;
  for (let seed = 1; seed < 300 && !found; seed++) {
    let s = create(seed);
    s.player.dt = 80;
    s = trainWeek(s, 'remate');
    if (currentGame(s).kind === 'libre') continue;
    s = startMatch(s);
    const i = s.torneo.match.moments.findIndex((m) => m.type === 'gambeta');
    if (i < 0) continue;
    for (let k = 0; k < i; k++) s = answerMoment(s, { choice: 'izq', x: 0 });
    const mo = s.torneo.match.moments[i];
    const after = answerMoment(s, { choice: 'cano', x: mo.center });
    const a = after.torneo.match.answers[i];
    if (!a.ok) continue;
    const next = after.torneo.match.moments[i + 1];
    assert.equal(next.type, 'remate');
    assert.equal(next.kind, 'mano');
    assert.equal(next.min, mo.min);
    assert.match(kindText(next), /^¡Lo dejaste atrás!/);
    assert.equal(after.torneo.match.moments.length, s.torneo.match.moments.length + 1);
    assert.equal(outcomeKind('gambeta', { ...a, kind: undefined }), 'gambeta');
    found = true;
  }
  assert.ok(found, 'hubo una gambeta que salió');
});

test('eventos: la primera semana no hay; después salen de la semilla y se eligen una sola vez', () => {
  const s0 = create(5);
  assert.equal(weekEvent(s0), null);
  let s = create(5);
  let seen = 0;
  for (let w = 0; w < 14 && s.torneo.phase === 'liga'; w++) {
    const ev = weekEvent(s);
    assert.deepEqual(weekEvent(structuredClone(s)), ev, 'mismo evento para la misma semana');
    if (ev) {
      seen += 1;
      const before = s.player;
      const opt = ev.event.options[0];
      const after = chooseEvent(s, 0);
      assert.equal(weekEvent(after).choice, 0);
      assert.equal(chooseEvent(after, 1), after, 'no se elige dos veces');
      assert.deepEqual(after.player, applyFx(before, opt.fx));
      s = after;
    }
    s = playWeek(s, { r: rng(w) });
    assert.equal(s.torneo.event ?? null, null, 'el evento no pasa a la semana siguiente');
  }
  assert.ok(seen >= 2, `eventos en 14 fechas: ${seen}`);
  for (const e of EVENTS) for (const o of e.options) assert.ok(fxText(o.fx).length > 0);
  assert.equal(applyFx({ fans: 98, dt: 1, energy: 50, attrs: { remate: 99, pase: 50, velocidad: 50, fisico: 50 } }, { fans: 5, dt: -5, remate: 1 }).fans, 100);
});

test('metas: según el rol al arrancar, avanzan con las estadísticas y suman hinchas al cerrar', () => {
  assert.equal(goalsFor({ pos: 'del', dt: 30 })[0].key, 'pj');
  assert.equal(goalsFor({ pos: 'del', dt: 80 })[0].target, 6);
  assert.equal(goalsFor({ pos: 'vol', dt: 80 })[1].target, 4);
  const t = { goals: goalsFor({ pos: 'del', dt: 30 }), stats: { pj: 3, g: 1, a: 0, ratings: [7, 7.4, 6.9], res: { pj: 5, g: 2, a: 0 } } };
  assert.deepEqual(goalProgress(t).map((g) => g.done), [true, true, true]);
  assert.deepEqual(goalProgress({ stats: t.stats }), [], 'guardados viejos sin metas');
  const s = playTorneo(create(21), { r: rng(2), aim: (m) => m.center });
  assert.equal(s.torneo.summary.goals.total, 3);
  assert.ok(s.torneo.summary.goals.done >= 1);
});

test('logros: se ganan una sola vez, por partido o por torneo; los partidos grandes se reconocen por nombre', async () => {
  const { LOGROS, isBigMatch, matchLogros, torneoLogros } = await import('../src/lib/carrera/logros.js');
  assert.equal(new Set(LOGROS.map((l) => l.id)).size, LOGROS.length);
  assert.ok(LOGROS.every((l) => l.match || l.torneo || l.special));
  assert.ok(isBigMatch({ name: 'Huracán' }) && isBigMatch({ name: 'River Plate' }) && isBigMatch({ name: 'Independiente' }));
  assert.ok(!isBigMatch({ name: 'Independiente Rivadavia' }) && !isBigMatch({ name: 'Talleres' }));
  const ctx = { side: 'primera', goals: 3, assists: 0, rating: 9.2, big: true, fans: 30, kinds: [{ type: 'gambeta', choice: 'cano', kind: 'gambeta' }, { type: 'remate', sub: 'afuera', kind: 'gol' }] };
  assert.deepEqual(matchLogros({}, ctx).sort(), ['cano', 'debut', 'doblete', 'figura', 'golazo', 'grande', 'hat-trick', 'primer-gol']);
  assert.deepEqual(matchLogros({ debut: 1, 'primer-gol': 1 }, { ...ctx, side: 'reserva', goals: 1, rating: 6, big: false, kinds: [] }), []);
  assert.deepEqual(torneoLogros({}, { stats: { g: 10, tit: 4 } }, { result: 'Campeón', goalsDone: 3, goalsTotal: 3 }).sort(), ['campeon', 'goleador', 'metas']);
  // Una carrera real: el debut queda guardado con su torneo y no se repite.
  let s = create(21);
  s = playTorneo(s, { r: rng(2), aim: (m) => m.center });
  assert.equal(s.logros?.debut, 1);
  const again = playTorneo(nextTorneo(s), { r: rng(3), aim: (m) => m.center });
  assert.equal(again.logros.debut, 1);
  assert.ok(Object.keys(again.logros).length >= Object.keys(s.logros).length);
});

test('historia: totales de la carrera y lugar contra los récords reales de club.json (sin Cubero)', async () => {
  const { careerTotals, historicRank } = await import('../src/lib/carrera/historia.js');
  const records = JSON.parse(readFileSync(new URL('../public/data/club.json', import.meta.url), 'utf8')).records;
  const top = historicRank(records.goleadores, 'goles', 300);
  assert.equal(top.rank, 1);
  assert.equal(top.next, null);
  const mid = historicRank(records.goleadores, 'goles', 100);
  assert.ok(mid.rank > 1 && mid.next.value > 100 && mid.gap === mid.next.value - 100 + 1);
  const out = historicRank(records.goleadores, 'goles', 5);
  assert.equal(out.rank, null);
  assert.ok(out.gap > 0, 'fuera de la tabla, dice cuánto falta para entrar');
  const pres = historicRank(records.presencias, 'partidos', 700);
  assert.equal(pres.rank, 1);
  assert.equal(historicRank(records.presencias, 'partidos', 500).rank, 1, 'Cubero no cuenta: con 500 partidos ya sos el primero');
  let s = playTorneo(create(21), { r: rng(2), aim: (m) => m.center });
  const t1 = careerTotals(s);
  assert.equal(t1.torneos, 1);
  assert.equal(t1.g, s.torneo.summary.g);
  s = nextTorneo(s);
  assert.equal(careerTotals(s).torneos, 2, 'el torneo en curso también cuenta');
});

test('prensa: a veces después de un partido de Primera; se contesta una vez y aplica sus efectos', async () => {
  const { PRESS, pickPress } = await import('../src/lib/carrera/historia.js');
  const r = rng(8);
  let n = 0;
  for (let i = 0; i < 1000; i++) n += pickPress(r, { side: 'primera', goals: 0, result: 1 }) ? 1 : 0;
  assert.ok(n > 350 && n < 550, `conferencias: ${n}`);
  assert.equal(pickPress(rng(1), { side: 'reserva', goals: 2, result: 1 }), null);
  for (const p of Object.values(PRESS)) assert.equal(p.answers.length, 3);
  let found = false;
  for (let seed = 1; seed < 60 && !found; seed++) {
    let s = create(seed);
    s.player.dt = 80;
    for (let w = 0; w < 6 && !found; w++) {
      s = trainWeek(s, 'descanso');
      if (currentGame(s).kind === 'libre') { s = dismissLast(skipWeek(s)); continue; }
      s = startMatch(s);
      while (!matchDone(s.torneo.match)) s = answerMoment(s, { choice: 'izq', x: s.torneo.match.moments[s.torneo.match.answers.length].center });
      s = finishMatch(s);
      if (s.torneo.last.press) {
        const fx = PRESS[s.torneo.last.press].answers[2].fx;
        const after = answerPress(s, 2);
        assert.equal(after.player.fans, Math.min(100, s.player.fans + (fx.fans ?? 0)));
        assert.equal(after.torneo.last.pressChoice, 2);
        assert.equal(answerPress(after, 0), after, 'una sola respuesta');
        found = true;
      }
      s = dismissLast(s);
    }
  }
  assert.ok(found);
});

test('edad y retiro: desde los 31 baja el físico; desde los 33 se puede retirar y a los 38 es obligatorio', async () => {
  const { ageAttrs, RETIRE_FROM, RETIRE_AT } = await import('../src/lib/carrera/historia.js');
  const base = { remate: 60, pase: 60, velocidad: 60, fisico: 60 };
  assert.deepEqual(ageAttrs(base, 30), base);
  assert.deepEqual(ageAttrs(base, 31), { remate: 60, pase: 60, velocidad: 59, fisico: 59 });
  assert.deepEqual(ageAttrs(base, 34), { remate: 59, pase: 59, velocidad: 58, fisico: 59 });
  let s = playTorneo(create(21), { r: rng(2), aim: (m) => m.center });
  assert.equal(retire(s), s, 'a los 18 no se retira');
  s.player.age = RETIRE_FROM;
  assert.deepEqual(retireState(s), { can: true, must: false });
  const r = retire(s);
  assert.equal(r.retired.age, RETIRE_FROM);
  assert.equal(r.history.length, 1);
  assert.equal(nextTorneo(r), r, 'retirado no juega más');
  s.player.age = RETIRE_AT;
  assert.ok(retireState(s).must);
  assert.equal(nextTorneo(s), s, 'a los 38 hay que retirarse');
});

test('balance de carrera: superar a Bianchi (206 goles) exige jugar casi perfecto 15 años', () => {
  // De los 18 a los 33: entrenando como un jugador aplicado y eligiendo al azar adónde patear o qué hacer.
  const career = (seed, aim) => {
    const r = rng(seed * 7);
    let s = create(seed);
    for (let n = 0; n < 40; n++) {
      s = playTorneo(s, { r, aim: (m) => Math.min(1, Math.max(0, aim(m, r))), trainKey: 'remate' });
      if (s.player.age >= 33) break;
      s = nextTorneo(s);
    }
    return [...s.history, s.torneo.summary].reduce((a, h) => a + h.g, 0);
  };
  const perfect = career(1, (m) => m.center);
  const good = career(2, (m, r) => m.center + (r() - 0.5) * m.width * 2.2);
  assert.ok(perfect > 180 && perfect < 320, `perfecto: ${perfect}`);
  assert.ok(good > 90 && good < 206, `bueno: ${good}`);
  const p = newPlayer({ name: 'X', pos: 'del' });
  let t = { ...p, attrs: { ...p.attrs, remate: ATTR_CAP } };
  assert.equal(train(t, 'remate', rng(1)).player.attrs.remate, ATTR_CAP, 'el techo no se pasa entrenando');
  assert.equal(trainOdds(ATTR_CAP, 100), 'tope');
});

test('plata: sueldo por semana según el rol, premios, mejoras que se compran una vez y la oferta de Europa', async () => {
  const { PERKS, money, salaryOf } = await import('../src/lib/carrera/economia.js');
  const { EVENTS, pickEvent } = await import('../src/lib/carrera/extras.js');
  const p = newPlayer({ name: 'X', pos: 'del' });
  assert.ok(salaryOf({ ...p, dt: 80 }) > salaryOf({ ...p, dt: 60 }) && salaryOf({ ...p, dt: 60 }) > salaryOf(p), 'titular > suplente > reserva');
  assert.ok(salaryOf({ ...p, dt: 80, raise: 1.25 }) > salaryOf({ ...p, dt: 80 }));
  assert.equal(money(3450), '$ 3.450 mil');
  assert.equal(money(12500), '$ 12,5 M');
  assert.equal(new Set(PERKS.map((x) => x.id)).size, PERKS.length);
  // Una semana cobrada: la plata sube con el sueldo (y los premios, si hubo).
  let s = playWeek(create(21), { r: rng(1) });
  assert.ok(s.player.money > 0);
  s.player.money = 3500;
  const bought = buyPerk(s, 'nutricionista');
  assert.equal(bought.player.money, 500);
  assert.deepEqual(bought.player.perks, ['nutricionista']);
  assert.equal(buyPerk(bought, 'nutricionista'), bought, 'no se compra dos veces');
  assert.equal(buyPerk(bought, 'casa'), bought, 'sin plata no se compra');
  assert.equal(train({ ...p, perks: ['nutricionista'] }, 'remate', rng(1)).player.energy, 100 - 15);
  const casa = buyPerk({ ...s, player: { ...s.player, money: 25000 } }, 'casa');
  assert.equal(casa.player.fans, Math.min(100, s.player.fans + 10));
  // La oferta de Europa solo le llega a un titular con hinchas.
  const pool = (pl) => { const seen = new Set(); for (let i = 0; i < 400; i++) { const k = i / 400; let n = 0; seen.add(pickEvent(() => (n++ ? k : 0), false, pl)?.id); } return seen; };
  assert.ok(!pool(p).has('oferta'));
  assert.ok(pool({ ...p, dt: 80, fans: 50 }).has('oferta'));
  assert.equal(EVENTS.find((e) => e.id === 'oferta').options.length, 2);
});

test('puestos: once lugares en la formación (con arquero y defensores), cada uno con su mezcla de jugadas', async () => {
  const { SPOTS, spotOf, attrLabel } = await import('../src/lib/carrera/player.js');
  assert.equal(SPOTS.length, 11);
  assert.equal(new Set(SPOTS.map((s) => s.key)).size, 11);
  const count = (pos) => SPOTS.filter((s) => s.pos === pos).length;
  assert.deepEqual([count('arq'), count('def'), count('vol'), count('del')], [1, 4, 3, 3], '4-2-3-1');
  for (const s of SPOTS) {
    assert.ok(s.x >= 0 && s.x <= 100 && s.y >= 0 && s.y <= 100, s.key);
    const sum = Object.values(s.mix).reduce((a, b) => a + b, 0);
    assert.ok(sum <= 1.0001, `${s.key}: la mezcla pasa de 1`);
  }
  // El lugar fija el puesto; los guardados viejos (sin lugar) juegan de 9 o de enganche, como antes.
  const arq = newPlayer({ name: 'X', spot: 'arq' });
  assert.equal(arq.pos, 'arq');
  assert.equal(spotOf({ pos: 'del' }).key, '9');
  assert.equal(spotOf({ pos: 'vol' }).key, 'mp');
  assert.equal(attrLabel('remate', 'arq'), 'Reflejos');
  assert.equal(attrLabel('remate', 'del'), 'Remate');
  assert.throws(() => newPlayer({ name: 'X', spot: 'xx' }));
});

/** Juega una semana eligiendo bien en defensa: el arquero sigue la pista del que patea; el defensor, `tackle`. */
function playDefense(state, { r, aim, tell = true, tackle = 'aguantar' }) {
  let s = trainWeek(state, state.player.energy < 45 ? 'descanso' : 'remate');
  const g = currentGame(s);
  if (!g) return s;
  if (g.kind === 'libre') return dismissLast(skipWeek(s));
  s = startMatch(s);
  while (!matchDone(s.torneo.match)) {
    const mo = s.torneo.match.moments[s.torneo.match.answers.length];
    const choice = mo.type === 'quite' ? tackle : mo.type === 'pase' ? 'corto' : mo.type === 'atajada' && tell && mo.tell ? mo.tell : AIMS[Math.floor(r() * 3)].key;
    s = answerMoment(s, { choice, x: Math.min(1, Math.max(0, aim(mo, r))) });
  }
  return finishMatch(s);
}

test('arquero: solo ataja; el gol en contra cuenta en el marcador y las atajadas, en la ficha', () => {
  let s = newCareer({ name: 'Arquerito', spot: 'arq', extra: { remate: 4, velocidad: 2 }, standings, roster, velezId: '21', seed: 31 });
  assert.equal(s.player.pos, 'arq');
  assert.ok(goalsFor(s.player).some((g) => g.key === 'att'), 'metas de arquero');
  if (currentGame(s).kind === 'libre') s = dismissLast(skipWeek(s));
  s = startMatch(s);
  assert.ok(s.torneo.match.moments.every((m) => m.type === 'atajada' && m.tell), 'todas atajadas, con pista');
  // Tirándose siempre al lado contrario de la pista y frenando mal: alguna vez es gol de ellos y suma al rival.
  let seen = false;
  for (let seed = 1; seed < 40 && !seen; seed++) {
    let k = newCareer({ name: 'Arquerito', spot: 'arq', standings, roster, velezId: '21', seed });
    if (currentGame(k).kind === 'libre') k = dismissLast(skipWeek(k));
    k = startMatch(k);
    const before = scoreAt(k.torneo.match)[1];
    const mo = k.torneo.match.moments[0];
    k = answerMoment(k, { choice: mo.tell === 'izq' ? 'der' : 'izq', x: 0 });
    const a = k.torneo.match.answers[0];
    assert.ok(['tapada', 'desviado', 'golrival'].includes(a.kind));
    assert.equal(outcomeKind('atajada', { ...a, kind: undefined }), a.saved ? 'tapada' : 'golrival');
    if (a.kind === 'golrival') {
      seen = true;
      assert.equal(eventsAt(k.torneo.match).filter((e) => e.team === 'r' && e.mi === 0).length, 1);
      assert.ok(scoreAt(k.torneo.match)[1] >= before);
    }
  }
  assert.ok(seen, 'algún gol en contra');
  // Un torneo bien jugado: atajadas y vallas invictas en el resumen.
  s = newCareer({ name: 'Arquerito', spot: 'arq', extra: { remate: 4, velocidad: 2 }, standings, roster, velezId: '21', seed: 31 });
  const r = rng(4);
  for (let w = 0; w < 40 && s.torneo.phase !== 'fin'; w++) s = dismissLast(playDefense(s, { r, aim: (m) => m.center }));
  assert.ok(s.torneo.summary.at > 0, 'atajó algo');
  assert.equal(s.torneo.summary.g, 0, 'el arquero no hace goles');
});

test('defensor: quites; la contra termina en gol de Vélez y el quite fallado puede ser gol de ellos', async () => {
  const { TACKLES, resolveTackle } = await import('../src/lib/carrera/match.js');
  assert.deepEqual(TACKLES.map((t) => t.key), ['aguantar', 'barrida', 'anticipo']);
  const kinds = new Set();
  for (let i = 0; i < 400; i++) {
    const res = resolveTackle(rng(i), { q: (i % 10) / 10, option: TACKLES[i % 3].key, attr: 55, rivalStr: 60, mate: 'Uno' });
    kinds.add(res.kind);
    if (res.kind === 'contra') assert.ok(res.ok && res.counter);
    if (!res.ok) assert.ok(!res.counter);
  }
  assert.deepEqual([...kinds].sort(), ['contra', 'golrival', 'quite', 'salvada']);
  let s = newCareer({ name: 'Zaguero', spot: 'dci', standings, roster, velezId: '21', seed: 12 });
  assert.equal(s.player.pos, 'def');
  const r = rng(5);
  for (let w = 0; w < 40 && s.torneo.phase !== 'fin'; w++) s = dismissLast(playDefense(s, { r, aim: (m) => m.center, tackle: 'anticipo' }));
  assert.ok(s.torneo.summary.qt > 0, 'ganó quites');
  // Los centrales solo rematan de cabeza.
  const head = newCareer({ name: 'Zaguero', spot: 'dcd', standings, roster, velezId: '21', seed: 3 });
  let found = false;
  for (let seed = 1; seed < 30; seed++) {
    let k = { ...head, seed };
    if (currentGame(k).kind === 'libre') k = dismissLast(skipWeek(k));
    for (const mo of startMatch(k).torneo.match.moments) if (mo.type === 'remate') { found = true; assert.equal(mo.kind, 'cabeza'); }
  }
  assert.ok(found);
});

test('balance de los puestos de defensa: jugar bien se nota y se llega a titular', () => {
  const run = (spot, opts) => {
    let gc = 0;
    let pj = 0;
    let titular = false;
    for (let seed = 1; seed <= 3; seed++) {
      let s = newCareer({ name: 'X', spot, extra: { remate: 3, fisico: 3 }, standings, roster, velezId: '21', seed });
      const r = rng(seed * 11);
      for (let n = 0; n < 2; n++) {
        for (let w = 0; w < 40 && s.torneo.phase !== 'fin'; w++) {
          s = playDefense(s, { r, ...opts });
          const l = s.torneo.last;
          if (l && !l.libre && l.side === 'primera') { gc += l.first.r; pj += 1; titular ||= l.role === 'titular'; }
          s = dismissLast(s);
        }
        s = nextTorneo(s);
      }
    }
    return { gc: gc / pj, titular };
  };
  const good = run('arq', { aim: (m) => m.center, tell: true });
  const bad = run('arq', { aim: (m, r) => m.center + (r() - 0.5) * 0.5, tell: false });
  assert.ok(good.titular, 'el arquero que juega bien llega a titular');
  assert.ok(good.gc < bad.gc, `leer al que patea ataja más: ${good.gc.toFixed(2)} vs ${bad.gc.toFixed(2)}`);
  assert.ok(run('dci', { aim: (m) => m.center }).titular, 'el central que juega bien llega a titular');
});

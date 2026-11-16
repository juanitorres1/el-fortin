// Modo Carrera · el torneo: los equipos reales de la tabla de ESPN (con una fuerza calculada, no un dato), el
// fixture todos contra todos dentro de cada zona, la simulación de los partidos, la tabla y los playoffs.
import { shuffle } from '../trivia.js';
import { clamp } from './player.js';

/**
 * Fuerza de un equipo (50–72) a partir de su campaña: puntos y diferencia de gol por partido. Es una inferencia para
 * el juego, no un dato.
 */
export function strengthOf(row) {
  const pj = Math.max(row.pj ?? 0, 1);
  // Comprimida a propósito: la liga argentina es pareja y con más diferencia el primero gana casi siempre.
  return Math.round(clamp(52 + ((row.pts ?? 0) / pj) * 6 + ((row.dg ?? 0) / pj) * 2.5, 50, 72));
}

/** Equipos del juego desde `standings` de ESPN: [{ id, name, logo, zone, str }]. null si Vélez no está. */
export function teamsFrom(standings, velezId) {
  const groups = standings?.groups ?? [];
  const teams = groups.flatMap((g, zone) => (g.rows ?? []).map((r) => ({ id: String(r.id), name: r.name, logo: r.logo ?? null, zone, str: strengthOf(r) })));
  if (!teams.some((t) => t.id === String(velezId)) || teams.length < 4) return null;
  return teams;
}

/**
 * Todos contra todos (método del círculo), una sola rueda: [[[local, visitante], ...], ...]. Con un número impar de
 * equipos cada fecha alguno queda libre.
 */
export function roundRobin(ids) {
  const list = ids.length % 2 ? [...ids, null] : [...ids];
  const n = list.length;
  const rounds = [];
  for (let r = 0; r < n - 1; r++) {
    const games = [];
    for (let i = 0; i < n / 2; i++) {
      const a = list[i];
      const b = list[n - 1 - i];
      if (a == null || b == null) continue;
      // Localía repartida: el fijo alterna por fecha y los demás según su lugar en la rueda (6 a 8 de local cada uno).
      games.push((i === 0 ? r % 2 === 0 : i % 2 === 1) ? [a, b] : [b, a]);
    }
    rounds.push(games);
    list.splice(1, 0, list.pop()); // el primero queda fijo, el resto gira
  }
  return rounds;
}

/** Fixture del torneo: cada zona por su lado y las fechas juntas. [[[local, visitante], ...] por fecha]. */
export function schedule(teams, rand) {
  const zones = [...new Set(teams.map((t) => t.zone))];
  const byZone = zones.map((z) => roundRobin(shuffle(teams.filter((t) => t.zone === z).map((t) => t.id), rand)));
  const n = Math.max(...byZone.map((r) => r.length));
  return Array.from({ length: n }, (_, i) => byZone.flatMap((r) => r[i] ?? []));
}

/** Goles esperados (local, visitante): ~2,2 por partido entre parejos, con ventaja de local. */
export function expectedGoals(home, away) {
  const d = (home - away) / 30;
  return [1.08 * 1.15 * Math.exp(d), 1.08 * 0.87 * Math.exp(-d)];
}

export function poisson(rand, lambda) {
  const limit = Math.exp(-lambda);
  let k = 0;
  let p = rand();
  while (p > limit && k < 10) {
    k += 1;
    p *= rand();
  }
  return k;
}

export function simMatch(rand, home, away) {
  const [lh, la] = expectedGoals(home, away);
  return [poisson(rand, lh), poisson(rand, la)];
}

/** Penales (o lo que define un empate en playoffs): un poco a favor del más fuerte. true = gana el local. */
export function shootout(rand, home, away) {
  return rand() < clamp(0.5 + (home - away) / 200, 0.35, 0.65);
}

/**
 * Tabla de una zona: [{ id, name, logo, pj, g, e, p, gf, gc, dg, pts, rank }], ordenada por puntos, diferencia,
 * goles a favor y nombre. `results[f][i]` = [gl, gv] del partido `fixtures[f][i]` (o null si no se jugó).
 */
export function table(teams, fixtures, results, zone) {
  const rows = new Map(teams.filter((t) => t.zone === zone).map((t) => [t.id, { id: t.id, name: t.name, logo: t.logo, pj: 0, g: 0, e: 0, p: 0, gf: 0, gc: 0, dg: 0, pts: 0 }]));
  results.forEach((fecha, f) => fecha?.forEach((score, i) => {
    const [h, a] = fixtures[f][i];
    if (!score || !rows.has(h)) return;
    const [gh, ga] = score;
    for (const [id, gf, gc] of [[h, gh, ga], [a, ga, gh]]) {
      const r = rows.get(id);
      r.pj += 1;
      r.gf += gf;
      r.gc += gc;
      r.dg = r.gf - r.gc;
      if (gf > gc) { r.g += 1; r.pts += 3; } else if (gf === gc) { r.e += 1; r.pts += 1; } else r.p += 1;
    }
  }));
  return [...rows.values()]
    .sort((a, b) => b.pts - a.pts || b.dg - a.dg || b.gf - a.gf || a.name.localeCompare(b.name, 'es'))
    .map((r, i) => ({ ...r, rank: i + 1 }));
}

export const PLAYOFF_ROUNDS = ['Octavos de final', 'Cuartos de final', 'Semifinal', 'Final'];
export const PLAYOFF_SPOTS = 8; // por zona: 16 equipos, como el Clausura 2026

/**
 * Cruces de octavos con las dos zonas: 1.º de una contra 8.º de la otra, y así. El orden arma el cuadro: el ganador
 * del cruce 0 juega con el del 1, etc. Local, el mejor ubicado. Con una sola zona: 1.º vs 8.º dentro de ella.
 */
export function playoffPairs(tables) {
  const [a, b = a] = tables.map((t) => t.slice(0, PLAYOFF_SPOTS).map((r) => r.id));
  const seeds = tables.length > 1
    ? [[a[0], b[7]], [b[3], a[4]], [a[1], b[6]], [b[2], a[5]], [b[0], a[7]], [a[3], b[4]], [b[1], a[6]], [a[2], b[5]]]
    : [[a[0], a[7]], [a[3], a[4]], [a[1], a[6]], [a[2], a[5]]];
  return seeds.filter(([x, y]) => x && y);
}

/** Los cruces de la ronda siguiente con los ganadores de la anterior (de a dos, en orden). */
export function nextPairs(winners) {
  const out = [];
  for (let i = 0; i + 1 < winners.length; i += 2) out.push([winners[i], winners[i + 1]]);
  return out;
}

/** Ronda de playoffs que corresponde a la cantidad de cruces (8 = octavos, 1 = final). */
export const roundName = (pairs) => PLAYOFF_ROUNDS[PLAYOFF_ROUNDS.length - Math.log2(pairs * 2)] ?? 'Playoffs';

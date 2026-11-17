// Lo que comparten los juegos del día (página Juegos): la semilla de cada juego, elegir «el de hoy» sin repetir,
// buscar jugadores por nombre y la racha. Todo puro: lo que eligió cada hincha lo guarda la página (lib/storage.js).
import { playStreak, rng, shuffle } from './trivia.js';

/** Los juegos que cuentan para la racha, en el orden de las pestañas. `daily: false` = por partido (no suma racha). */
export const GAMES = [
  { key: 'trivia', label: 'Trivia', daily: true },
  { key: 'duelo', label: 'Mano a Mano', daily: true },
  { key: 'tapado', label: 'El Tapado', daily: true },
  { key: 'trayectoria', label: 'Trayectoria V', daily: true },
  { key: 'grilla', label: 'Grilla', daily: true },
  { key: 'liniers', label: 'Once de Liniers', daily: true },
  { key: 'prode', label: 'Prode', daily: false },
  { key: 'once', label: 'Adiviná el once', daily: false },
  { key: 'carrera', label: 'Carrera', daily: false },
];

/** El próximo juego del día sin jugar hoy, después de `current` (da la vuelta); null si ya jugó todos. */
export function nextGame(done, current) {
  const daily = GAMES.filter((g) => g.daily);
  const at = daily.findIndex((g) => g.key === current);
  for (let i = 1; i <= daily.length; i += 1) {
    const g = daily[(at + i + daily.length) % daily.length];
    if (g.key !== current && !done.has(g.key)) return g;
  }
  return null;
}

/** Número a partir de un texto (FNV-1a): la «sal» de cada juego, para que no compartan sorteo. */
export function hash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/** Generador con semilla para un juego y un número (el día, la semana o el ciclo). */
export const seeded = (salt, n) => rng((hash(salt) ^ Math.imul(n, 2654435761)) >>> 0);

/**
 * El elemento de `ids` que toca en `n` (día o semana): recorre todos en un orden mezclado y recién después repite.
 * El orden sale de los ids ordenados, así que no depende de cómo venga la lista. Entre un ciclo y el siguiente
 * nunca toca el mismo dos veces seguidas.
 */
export function dailyPick(ids, n, salt) {
  const sorted = [...new Set(ids)].sort();
  const size = sorted.length;
  if (!size) return null;
  if (size === 1) return sorted[0];
  const order = (cycle) => shuffle(sorted, seeded(salt, cycle));
  const cycle = Math.floor(n / size);
  const cur = order(cycle);
  // El primero del ciclo no puede ser el último del anterior (el último nunca se toca: el ajuste es solo al principio).
  if (cur[0] === order(cycle - 1)[size - 1]) [cur[0], cur[1]] = [cur[1], cur[0]];
  return cur[((n % size) + size) % size];
}

/** Semana que cambia los domingos (hora argentina), a partir del número de día. El día 3 (4-ene-1970) fue domingo. */
export const weekNumber = (day) => Math.floor((day - 3) / 7);

/** «Jose luis CHILAVERT» → «jose luis chilavert»: sin tildes ni mayúsculas, para buscar. */
export const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Jugadores cuyo nombre coincide con lo escrito: cada palabra tiene que ser el comienzo de alguna palabra del nombre
 * («chila», «jl chi» no, «jose chi» sí). Primero los que coinciden por el apellido, después los más conocidos
 * (`rank` más alto). `list` = [{ id, n, rank? }]. Con menos de 2 letras no busca.
 */
export function searchPlayers(list, text, max = 6) {
  const words = norm(text).split(' ').filter(Boolean);
  if (words.join('').length < 2) return [];
  const out = [];
  for (const p of list) {
    const parts = (p.key ??= norm(p.n)).split(' ');
    if (!words.every((w) => parts.some((x) => x.startsWith(w)))) continue;
    out.push({ p, last: words.some((w) => parts.at(-1).startsWith(w)) ? 1 : 0 });
  }
  return out.sort((a, b) => b.last - a.last || (b.p.rank ?? 0) - (a.p.rank ?? 0) || a.p.n.localeCompare(b.p.n, 'es')).slice(0, max).map((x) => x.p);
}

/** Cuadraditos para compartir: 🟦 bien, ⬜ no. `perRow` corta en renglones (la grilla de 3×3). */
export function squares(results, perRow = 0) {
  const marks = results.map((r) => (r === 'near' ? '🟨' : r ? '🟦' : '⬜'));
  if (!perRow) return marks.join('');
  const rows = [];
  for (let i = 0; i < marks.length; i += perRow) rows.push(marks.slice(i, i + perRow).join(''));
  return rows.join('\n');
}

/** Anota que hoy se terminó un juego. `log` = { [día]: [claves] } (se guardan los últimos 400 días). */
export function markPlayed(log, day, game) {
  const today = log?.[day] ?? [];
  if (today.includes(game)) return log;
  const next = { ...log, [day]: [...today, game] };
  for (const d of Object.keys(next)) if (Number(d) < day - 400) delete next[d];
  return next;
}

/** Días seguidos con al menos un juego terminado. `extraDays` = días de la trivia de antes de que existiera el registro. */
export function gameStreak(log, day, extraDays = []) {
  return playStreak([...Object.keys(log ?? {}).map(Number), ...extraDays], day);
}

/**
 * Guarda el resultado de una partida en el historial de un juego: `hist` = { [día]: valor } (los últimos 400 días).
 * El valor es el puntaje (trivia, duelos, grilla, once) o, en los de adivinar, los intentos que usó (0 = no lo sacó).
 */
export function recordResult(hist, day, value) {
  const next = { ...(hist ?? {}), [day]: value };
  for (const d of Object.keys(next)) if (Number(d) < day - 400) delete next[d];
  return next;
}

/**
 * Números de un historial para la pantalla final. `kind`: 'score' (puntaje de `of`) → { played, avg, best, perfect };
 * 'guess' (intentos, 0 = no lo sacó) → { played, wins, pct, avg } (`avg` = intentos promedio cuando lo sacó).
 */
export function resultStats(hist, kind, of) {
  const values = Object.values(hist ?? {}).filter((v) => typeof v === 'number');
  const played = values.length;
  const mean = (l) => (l.length ? Math.round((l.reduce((a, b) => a + b, 0) / l.length) * 10) / 10 : null);
  if (kind === 'guess') {
    const wins = values.filter((v) => v > 0);
    return { played, wins: wins.length, pct: played ? Math.round((wins.length / played) * 100) : 0, avg: mean(wins) };
  }
  return { played, avg: mean(values), best: played ? Math.max(...values) : null, perfect: values.filter((v) => v === of).length };
}

/**
 * Cuánto falta para el próximo juego: a las 00:00 de la Argentina (UTC−3, sin horario de verano) del día siguiente o,
 * con `weekly`, del domingo siguiente. Devuelve los milisegundos (siempre > 0).
 */
export function untilNext(now, weekly = false) {
  const AR = 3 * 3600e3;
  const day = Math.floor((now - AR) / 864e5); // día argentino (mismo número que dayNumber)
  const next = weekly ? 3 + (weekNumber(day) + 1) * 7 : day + 1;
  return next * 864e5 + AR - now;
}

/** «5 h 12 min» o «2 días y 3 h». */
export function fmtWait(ms) {
  const min = Math.max(1, Math.ceil(ms / 60e3));
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  const m = min % 60;
  if (d) return `${d} ${d === 1 ? 'día' : 'días'}${h ? ` y ${h} h` : ''}`;
  return h ? `${h} h${m ? ` ${m} min` : ''}` : `${m} min`;
}

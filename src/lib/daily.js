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
];

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

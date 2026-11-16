// Modo Carrera · la carrera completa: totales, lugar en la historia de Vélez (contra los récords reales de
// club.json, de Wikipedia), conferencias de prensa, edad y retiro. Lógica pura.
import { clamp } from './player.js';

/** Personas que no se destacan en el sitio (la misma decisión que en la trivia: siguen en Récords porque son datos). */
const EXCLUDE = new Set(['Fabián Cubero']);

export const RETIRE_FROM = 33; // desde esta edad se puede colgar los botines
export const RETIRE_AT = 38; // a esta edad el retiro es obligatorio

/** Totales de toda la carrera en Primera (torneos cerrados más el actual). */
export function careerTotals(state) {
  const rows = [...state.history];
  const t = state.torneo;
  if (t && t.phase !== 'fin') rows.push({ pj: t.stats.pj, g: t.stats.g, a: t.stats.a, result: null });
  else if (t?.summary && !state.history.some((h) => h.n === t.summary.n)) rows.push(t.summary);
  const pj = rows.reduce((s, r) => s + (r.pj ?? 0), 0);
  return {
    torneos: rows.length,
    pj,
    g: rows.reduce((s, r) => s + (r.g ?? 0), 0),
    a: rows.reduce((s, r) => s + (r.a ?? 0), 0),
    titulos: rows.filter((r) => r.result === 'Campeón').length,
  };
}

/**
 * Lugar en una tabla histórica (`list` = [{ nombre, ...valor }], de mayor a menor). Devuelve { rank, next, gap }:
 * `rank` = puesto si entra en la tabla (o null), `next` = a quién alcanzar ({ nombre, value }) y `gap` = cuánto falta.
 */
export function historicRank(list, key, value) {
  const rows = (list ?? []).filter((r) => !EXCLUDE.has(r.nombre)).map((r) => ({ nombre: r.nombre, value: r[key] ?? 0 })).sort((a, b) => b.value - a.value);
  if (!rows.length) return null;
  const above = rows.filter((r) => r.value > value);
  const inTable = value >= rows.at(-1).value && value > 0;
  const next = above.at(-1) ?? null;
  return { rank: inTable ? above.length + 1 : null, size: rows.length, next, gap: next ? next.value - value + 1 : 0 };
}

// ---------- Conferencia de prensa ----------

/** Preguntas después del partido (solo en Primera). Cada respuesta tiene efectos fijos y a la vista. */
export const PRESS = {
  gol: {
    q: '«¿A quién le dedicás el gol?»',
    answers: [
      { label: 'A mi familia, que me banca siempre.', fx: { fans: 2, dt: 1 } },
      { label: 'A la gente de Vélez.', fx: { fans: 4 } },
      { label: 'A los que no creían en mí.', fx: { fans: 5, dt: -3 } },
    ],
  },
  gano: {
    q: '«¿Vélez está para pelear el torneo?»',
    answers: [
      { label: 'Vamos partido a partido.', fx: { dt: 2 } },
      { label: 'Este equipo puede salir campeón.', fx: { fans: 3 } },
      { label: 'Los demás nos tienen miedo.', fx: { fans: 6, dt: -4 } },
    ],
  },
  empato: {
    q: '«¿Te deja conforme el empate?»',
    answers: [
      { label: 'Sumamos y seguimos.', fx: { dt: 2 } },
      { label: 'Merecimos ganar.', fx: { fans: 3 } },
      { label: 'Hubo compañeros que no corrieron.', fx: { fans: 4, dt: -6 } },
    ],
  },
  perdio: {
    q: '«¿Qué le faltó hoy a Vélez?»',
    answers: [
      { label: 'Hay que mejorar, empezando por mí.', fx: { dt: 3 } },
      { label: 'Pusimos todo y no se dio.', fx: { fans: 2 } },
      { label: 'El árbitro nos perjudicó.', fx: { fans: 5, dt: -5 } },
    ],
  },
};
export const PRESS_CHANCE = 0.45;

/** La pregunta que toca (o null): solo en Primera, con un generador con semilla. `result` = 1, 0 o -1. */
export function pickPress(rand, { side, goals, result }) {
  if (side !== 'primera' || rand() >= PRESS_CHANCE) return null;
  if (goals > 0) return 'gol';
  return result > 0 ? 'gano' : result < 0 ? 'perdio' : 'empato';
}

// ---------- Edad ----------

/**
 * Lo que la edad le saca al cuerpo al empezar un torneo: desde los 31, velocidad y físico; desde los 34, también
 * remate y pase. Devuelve los atributos nuevos.
 */
export function ageAttrs(attrs, age) {
  const a = { ...attrs };
  if (age >= 31) { a.velocidad -= 1; a.fisico -= 1; }
  if (age >= 34) { a.velocidad -= 1; a.remate -= 1; a.pase -= 1; }
  for (const k of Object.keys(a)) a[k] = clamp(a[k], 1, 99);
  return a;
}

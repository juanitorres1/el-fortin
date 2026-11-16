// Modo Carrera · el partido: los «momentos» que juega el hincha (remate, pase, penal), la barra de timing y cómo se
// resuelve cada uno. El resto del partido lo simula season.js. Lógica pura (sin React).
import { clamp } from './player.js';

export const SHOT_KINDS = [
  { key: 'mano', text: 'Quedás mano a mano con el arquero.', base: 0.12 },
  { key: 'area', text: 'Te queda la pelota en el área, con un defensor encima.', base: 0.05 },
  { key: 'afuera', text: 'Te la dejan de frente al arco, afuera del área.', base: -0.03 },
  { key: 'cabeza', text: 'Viene un centro buscándote en el segundo palo.', base: 0.02 },
];
export const PASS_KINDS = [
  { key: 'contra', text: 'Contragolpe: arrancás con la pelota por el medio.' },
  { key: 'banda', text: 'Recibís sobre la banda con lugar para avanzar.' },
  { key: 'armado', text: 'La tenés en tres cuartos y el rival está cerrado.' },
];
export const PENALTY = { key: 'penal', text: 'Definición por penales: te toca patear.', base: 0.52 };

export const AIMS = [
  { key: 'izq', label: 'Palo izquierdo', short: 'a la izquierda' },
  { key: 'medio', label: 'Al medio', short: 'al medio' },
  { key: 'der', label: 'Palo derecho', short: 'a la derecha' },
];
// Adónde se tira el arquero: casi nunca se queda en el medio.
const KEEPER = [['izq', 0.42], ['medio', 0.16], ['der', 0.42]];

export const PASSES = [
  { key: 'corto', label: 'Pase corto', hint: 'seguro, poco peligro', ok: 0.9, goal: 0.08 },
  { key: 'centro', label: 'Centro al área', hint: 'término medio', ok: 0.62, goal: 0.24 },
  { key: 'filtrado', label: 'Filtrado', hint: 'arriesgado, puede ser gol', ok: 0.48, goal: 0.42 },
];

/** Media zona verde de la barra (0–1): más ancha con mejor atributo, más angosta si está cansado. */
export function zoneWidth(attr, energy) {
  return (0.07 + (attr / 99) * 0.11) * (0.65 + 0.35 * clamp(energy, 0, 100) / 100);
}

/** Tiempo (ms) que tarda el marcador en cruzar la barra: más rápido contra un rival fuerte. */
export function sweepMs(rivalStr) {
  return Math.round(clamp(1500 - (rivalStr - 55) * 15, 900, 1700));
}

/** Dónde está el marcador (0–1) a `ms` de empezar: va y vuelve. */
export function markerAt(ms, sweep) {
  const t = (Math.max(0, ms) % (2 * sweep)) / sweep;
  return t <= 1 ? t : 2 - t;
}

/** Calidad de la ejecución (0–1) según dónde se frenó el marcador. En la zona verde, de 0,5 a 1. */
export function quality(x, center, width) {
  const d = Math.abs(x - center);
  if (d <= width) return 1 - (0.5 * d) / width;
  return Math.max(0, 0.45 - (d - width) * 2.5);
}

// Gambeta: mano a mano con un defensor. Si sale, la jugada sigue con un remate (mejor con el caño).
export const DRIBBLE_KINDS = [
  { key: 'encara', text: 'Te encara el último defensor en tres cuartos.' },
  { key: 'espalda', text: 'Recibís de espaldas con un marcador encima.' },
  { key: 'lateral', text: 'Corrés por la banda y te sale el lateral.' },
];
export const DRIBBLES = [
  { key: 'afuera', label: 'Por afuera', hint: 'a pura velocidad', ok: 0.62, next: 'area' },
  { key: 'enganche', label: 'Enganche', hint: 'término medio', ok: 0.55, next: 'area' },
  { key: 'cano', label: 'Caño', hint: 'arriesgado: te deja solo', ok: 0.4, next: 'mano' },
];
const KINDS = { remate: SHOT_KINDS, pase: PASS_KINDS, gambeta: DRIBBLE_KINDS };
const ATTR_OF = { remate: 'remate', penal: 'remate', pase: 'pase', gambeta: 'velocidad' };

/**
 * Las jugadas del partido. `count` jugadas entre los minutos `from` y `to`; `shots` = parte de remates y
 * `dribbles` = parte de gambetas (el resto, pases). Cada una guarda su zona verde y la velocidad, así recargar la
 * página no cambia nada.
 */
export function makeMoments(rand, { count, from, to, shots, dribbles = 0, player, rivalStr }) {
  const mins = Array.from({ length: count }, () => Math.round(from + rand() * (to - from))).sort((a, b) => a - b);
  return mins.map((min) => {
    const x = rand();
    const type = x < shots ? 'remate' : x < shots + dribbles ? 'gambeta' : 'pase';
    const kinds = KINDS[type];
    const kind = kinds[Math.floor(rand() * kinds.length)].key;
    return momentShape(rand, { min, type, kind, player, rivalStr });
  });
}

export function momentShape(rand, { min, type, kind, player, rivalStr }) {
  const attr = player.attrs[ATTR_OF[type]];
  const video = (player.perks ?? []).includes('video') ? 1.06 : 1; // mejora: analista de video
  return { min, type, kind, center: Math.round((0.25 + rand() * 0.5) * 1000) / 1000, width: Math.round(zoneWidth(attr, player.energy) * video * 1000) / 1000, sweep: sweepMs(rivalStr) };
}

export function kindText(m) {
  if (m.type === 'penal') return PENALTY.text;
  const text = (KINDS[m.type] ?? []).find((k) => k.key === m.kind)?.text ?? '';
  return m.from === 'gambeta' ? `¡Lo dejaste atrás! ${text}` : text;
}

/** Resuelve una gambeta (pesa la velocidad). Devuelve { ok, kind, next, text }; `kind` = gambeta | perdida. */
export function resolveDribble(rand, { q, option, attr, rivalStr }) {
  const opt = DRIBBLES.find((o) => o.key === option) ?? DRIBBLES[0];
  const okP = clamp(opt.ok * (0.55 + 0.7 * q) + (attr - 50) / 180 - (rivalStr - 60) / 250, 0.05, 0.92);
  const ok = rand() < okP;
  if (!ok) return { ok, kind: 'perdida', next: null, text: q < 0.15 ? 'Te enredaste solo y la perdiste.' : 'El defensor te la sacó limpita.' };
  const text = { afuera: 'Le ganaste en velocidad por afuera.', enganche: 'Enganchaste para adentro y lo pasaste.', cano: '¡Caño! Lo dejaste mirando.' }[opt.key];
  return { ok, kind: 'gambeta', next: opt.next, text };
}

/** Probabilidad de gol de un remate antes de saber adónde se tiró el arquero. */
export function shotChance({ q, kind, attr, rivalStr, bonus = 0 }) {
  const base = kind === 'penal' ? PENALTY.base : SHOT_KINDS.find((k) => k.key === kind)?.base ?? 0;
  // El timing pesa más que el atributo: frenar la barra en el centro es lo que hace goles.
  return clamp(base + 0.34 * q - 0.16 + (attr - 50) / 300 - (rivalStr - 60) / 200 + bonus, 0.02, 0.9);
}

const pickWeighted = (rand, pairs) => {
  let x = rand();
  for (const [v, w] of pairs) {
    if ((x -= w) < 0) return v;
  }
  return pairs[pairs.length - 1][0];
};

/** Resuelve un remate. Devuelve { goal, keeper, kind, text }; `kind` = gol | atajada | palo | afuera | mal. */
export function resolveShot(rand, { q, aim, kind, attr, rivalStr, bonus = 0 }) {
  const keeper = kind === 'penal' ? AIMS[Math.floor(rand() * 3)].key : pickWeighted(rand, KEEPER);
  let p = shotChance({ q, kind, attr, rivalStr, bonus });
  if (keeper === aim) p *= kind === 'penal' ? 0.3 : 0.35;
  const goal = rand() < p;
  const where = AIMS.find((a) => a.key === aim)?.short ?? '';
  let text;
  let out;
  if (goal) out = 'gol';
  else if (q < 0.15) out = 'mal';
  else if (keeper === aim) out = 'atajada';
  else out = rand() < 0.5 ? 'afuera' : 'palo'; // mismo sorteo que antes: no cambia ningún resultado
  if (goal) text = keeper === aim ? `¡Gol! El arquero adivinó pero no llegó: ${where}.` : `¡Gol! La pusiste ${where} y el arquero se tiró para el otro lado.`;
  else if (q < 0.15) text = 'Le pegaste mal y se fue lejos.';
  else if (keeper === aim) text = `Te la atajó: se tiró ${where}.`;
  else text = out === 'afuera' ? 'Se fue apenas afuera, rozando el palo.' : 'Pegó en el palo y salió.';
  return { goal, keeper, kind: out, text };
}

/** Resuelve un pase. Si llega y el compañero la mete, es asistencia. Devuelve { ok, assist, kind, text }; `kind` = asistencia | ok | cortado. */
export function resolvePass(rand, { q, option, attr, rivalStr, mate }) {
  const opt = PASSES.find((o) => o.key === option) ?? PASSES[0];
  const okP = clamp(opt.ok * (0.6 + 0.6 * q) + (attr - 50) / 200 - (rivalStr - 60) / 250, 0.05, 0.97);
  const ok = rand() < okP;
  if (!ok) return { ok, assist: false, kind: 'cortado', text: q < 0.15 ? 'La pelota salió mordida y se fue al lateral.' : 'La cortó un defensor.' };
  const assist = rand() < clamp(opt.goal * (0.8 + 0.4 * q), 0, 0.8);
  if (assist) return { ok, assist, kind: 'asistencia', text: `¡Asistencia! ${mate} la empujó a la red.` };
  return { ok, assist, kind: 'ok', text: opt.key === 'corto' ? 'Pase limpio: Vélez sigue con la pelota.' : `Le llegó a ${mate}, pero no pudo definir.` };
}

/** Qué pasó en una jugada ya jugada (los guardados viejos no tienen `kind`: se deduce). */
export function outcomeKind(type, a) {
  if (a.kind) return a.kind;
  if (type === 'gambeta') return a.ok ? 'gambeta' : 'perdida';
  if (type === 'pase') return a.assist ? 'asistencia' : a.ok ? 'ok' : 'cortado';
  if (a.goal) return 'gol';
  if (a.q < 0.15) return 'mal';
  if (a.keeper === a.choice) return 'atajada';
  return /palo y/.test(a.text) ? 'palo' : 'afuera';
}

/**
 * Puntaje del partido (1–10, con un decimal): arranca en 6, suma por goles, asistencias y jugadas buenas, resta por
 * las malas y por el resultado del equipo. `noise` = número de 0 a 1.
 */
export function matchRating({ goals, assists, good, bad, result, noise }) {
  const r = 6 + goals * 1.1 + assists * 0.7 + good * 0.25 - bad * 0.3 + (result > 0 ? 0.3 : result < 0 ? -0.3 : 0) + (noise - 0.5) * 0.6;
  return Math.round(clamp(r, 3, 10) * 10) / 10;
}

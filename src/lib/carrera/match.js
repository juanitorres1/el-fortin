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
// Quite (defensores y volantes centrales): un rival te encara. Si falla, el rival queda de cara al arco.
export const TACKLE_KINDS = [
  { key: 'contra', text: 'Contragolpe del rival: sos el último y te encara a toda velocidad.' },
  { key: 'area', text: 'El 9 rival recibe de espaldas en el borde del área.' },
  { key: 'banda', text: 'Te encaran por la banda y buscan meterse al área.' },
];
// `ok` = chance base de sacarla; `goal` = chance de gol rival si falla; `counter` = chance de gol de Vélez de contra si sale.
export const TACKLES = [
  { key: 'aguantar', label: 'Acompañar', hint: 'seguro: lo llevás afuera', ok: 0.7, goal: 0.25, counter: 0 },
  { key: 'barrida', label: 'Barrida', hint: 'término medio', ok: 0.58, goal: 0.35, counter: 0.08 },
  { key: 'anticipo', label: 'Anticipo', hint: 'arriesgado: si sale, salís de contra', ok: 0.52, goal: 0.45, counter: 0.3 },
];

// Atajada (arquero): te patean y elegís adónde tirarte. El delantero perfila el remate (`tell`): casi siempre va ahí.
export const SAVE_KINDS = [
  { key: 'mano', text: 'Un delantero se escapa solo y te enfrenta mano a mano.', base: -0.08 },
  { key: 'tiro', text: 'Remate de afuera del área, fuerte y a media altura.', base: 0.08 },
  { key: 'cabeza', text: 'Centro al área y cabezazo a quemarropa.', base: -0.04 },
];
export const SAVE_PENALTY = { key: 'penal', text: 'Definición por penales: te toca atajar.', base: -0.12 };
const TELL_TRUE = 0.55;

const KINDS = { remate: SHOT_KINDS, pase: PASS_KINDS, gambeta: DRIBBLE_KINDS, quite: TACKLE_KINDS, atajada: SAVE_KINDS };
const ATTR_OF = { remate: 'remate', penal: 'remate', pase: 'pase', gambeta: 'velocidad', quite: 'fisico', atajada: 'remate' };
// Orden en que se reparte el sorteo del tipo: remate y gambeta primero, pase al final (así el 9 y el enganche dan
// exactamente las mismas jugadas que antes con la misma semilla).
const TYPE_ORDER = ['remate', 'gambeta', 'quite', 'atajada', 'pase'];

/**
 * Las jugadas del partido. `count` jugadas entre los minutos `from` y `to`; `mix` = parte de cada tipo (lo que
 * falte hasta 1 son pases). Los centrales solo rematan de cabeza (`headers`). Cada una guarda su zona verde y la
 * velocidad, así recargar la página no cambia nada.
 */
export function makeMoments(rand, { count, from, to, mix, headers = false, player, rivalStr }) {
  const mins = Array.from({ length: count }, () => Math.round(from + rand() * (to - from))).sort((a, b) => a - b);
  return mins.map((min) => {
    const x = rand();
    let acc = 0;
    const type = TYPE_ORDER.find((k) => k !== 'pase' && x < (acc += mix[k] ?? 0)) ?? 'pase';
    const kinds = type === 'remate' && headers ? SHOT_KINDS.filter((k) => k.key === 'cabeza') : KINDS[type];
    const kind = kinds[Math.floor(rand() * kinds.length)].key;
    return momentShape(rand, { min, type, kind, player, rivalStr });
  });
}

export function momentShape(rand, { min, type, kind, player, rivalStr }) {
  const attr = player.attrs[ATTR_OF[type]];
  const video = (player.perks ?? []).includes('video') ? 1.06 : 1; // mejora: analista de video
  const shape = { min, type, kind, center: Math.round((0.25 + rand() * 0.5) * 1000) / 1000, width: Math.round(zoneWidth(attr, player.energy) * video * 1000) / 1000, sweep: sweepMs(rivalStr) };
  if (type === 'atajada') shape.tell = AIMS[Math.floor(rand() * 3)].key; // para dónde perfila el que patea
  return shape;
}

const TELL_TEXT = { izq: 'Perfila el remate hacia la izquierda.', medio: 'Parece que le va a pegar al medio.', der: 'Perfila el remate hacia la derecha.' };

export function kindText(m) {
  if (m.type === 'penal') return PENALTY.text;
  if (m.type === 'atajada' && m.kind === 'penal') return SAVE_PENALTY.text;
  const text = (KINDS[m.type] ?? []).find((k) => k.key === m.kind)?.text ?? '';
  return m.from === 'gambeta' ? `¡Lo dejaste atrás! ${text}` : text;
}

/** La pista del que patea (solo en las atajadas que no son penal: en el penal no se sabe). */
export const tellText = (m) => (m.type === 'atajada' && m.kind !== 'penal' && m.tell ? TELL_TEXT[m.tell] : null);

/** ¿La jugada es de una definición por penales (patear o atajar)? */
export const isPenalty = (m) => m.type === 'penal' || (m.type === 'atajada' && m.kind === 'penal');

/**
 * Resuelve un quite (pesa el físico). Devuelve { ok, kind, counter, text }; `kind` = quite | salvada | golrival.
 * `counter` = si la recuperación terminó en gol de Vélez de contra.
 */
export function resolveTackle(rand, { q, option, attr, rivalStr, mate }) {
  const opt = TACKLES.find((o) => o.key === option) ?? TACKLES[0];
  const okP = clamp(opt.ok * (0.55 + 0.7 * q) + (attr - 50) / 180 - (rivalStr - 60) / 250, 0.05, 0.95);
  if (rand() < okP) {
    const counter = rand() < opt.counter;
    const text = counter ? `¡La recuperaste y salió la contra! ${mate} la mandó a guardar.`
      : { aguantar: 'Lo llevaste contra la línea y te quedaste con la pelota.', barrida: '¡Barrida limpia! Pelota recuperada.', anticipo: 'Lo anticipaste y saliste jugando.' }[opt.key];
    return { ok: true, kind: counter ? 'contra' : 'quite', counter, text };
  }
  const goal = rand() < opt.goal;
  if (goal) return { ok: false, kind: 'golrival', counter: false, text: q < 0.15 ? 'Llegaste tarde y te pasó como si nada. Gol de ellos.' : 'Te ganó la posición y la puso en el rincón. Gol de ellos.' };
  return { ok: false, kind: 'salvada', counter: false, text: 'Te pasó, pero el remate se fue afuera. Se salvó Vélez.' };
}

/** Probabilidad de atajar según si adivinó el lado (base de cada situación, timing, reflejos y rival). */
export function saveChance({ q, right, kind, attr, rivalStr, bonus = 0 }) {
  const base = kind === 'penal' ? SAVE_PENALTY.base : SAVE_KINDS.find((k) => k.key === kind)?.base ?? 0;
  if (!right) return clamp(0.12 + 0.18 * q + (attr - 50) / 400 + base / 2 + bonus, 0.02, 0.4);
  return clamp(0.42 + 0.45 * q + base + (attr - 50) / 220 - (rivalStr - 60) / 250 + bonus, 0.05, 0.94);
}

/**
 * Resuelve una atajada. `dive` = adónde se tiró. Devuelve { saved, shot, kind, text }; `shot` = adónde pateó el
 * rival; `kind` = tapada | afuera | golrival. Si no la ataja, puede irse afuera (salvo en el penal, casi siempre gol).
 */
export function resolveSave(rand, { q, dive, kind, tell, attr, rivalStr }) {
  const others = AIMS.map((a) => a.key).filter((k) => k !== tell);
  const shot = kind === 'penal' || !tell ? AIMS[Math.floor(rand() * 3)].key : rand() < TELL_TRUE ? tell : others[Math.floor(rand() * 2)];
  const right = shot === dive;
  const saved = rand() < saveChance({ q, right, kind, attr, rivalStr });
  const where = AIMS.find((a) => a.key === shot)?.short ?? '';
  if (saved) {
    const text = right ? `¡Atajada! Adivinaste: fue ${where} y la sacaste.` : `¡Qué reflejo! Te tiraste para el otro lado y igual la sacaste con el pie.`;
    return { saved, shot, kind: 'tapada', text };
  }
  if (rand() < (kind === 'penal' ? 0.15 : 0.72)) return { saved, shot, kind: 'desviado', text: 'No llegaste, pero pegó en el palo y salió. ¡Se salvó Vélez!' };
  return { saved, shot, kind: 'golrival', text: right ? `Adivinaste el lado, pero entró ${where}. Gol de ellos.` : `Te tiraste para el otro lado: entró ${where}. Gol de ellos.` };
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
  if (type === 'quite') return a.ok ? 'quite' : 'golrival';
  if (type === 'atajada') return a.saved ? 'tapada' : 'golrival';
  if (a.goal) return 'gol';
  if (a.q < 0.15) return 'mal';
  if (a.keeper === a.choice) return 'atajada';
  return /palo y/.test(a.text) ? 'palo' : 'afuera';
}

/**
 * Puntaje del partido (1–10, con un decimal): arranca en 6, suma por goles, asistencias y jugadas buenas, resta por
 * las malas y por el resultado del equipo. `noise` = número de 0 a 1.
 */
export function matchRating({ goals, assists, good, bad, result, noise, extra = 0 }) {
  // `extra`: lo del arquero y los defensores (atajadas, quites, goles en contra, valla invicta), lo calcula career.js.
  const r = 6 + goals * 1.1 + assists * 0.7 + good * 0.25 - bad * 0.3 + extra + (result > 0 ? 0.3 : result < 0 ? -0.3 : 0) + (noise - 0.5) * 0.6;
  return Math.round(clamp(r, 3, 10) * 10) / 10;
}

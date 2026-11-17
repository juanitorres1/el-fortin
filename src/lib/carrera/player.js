// Modo Carrera · el jugador: puestos, atributos, entrenamiento y rol en el plantel. Lógica pura (sin React).
// Todo número sale de acá: si hay que balancear, se toca este archivo y tests/carrera.test.js lo controla.

export const ATTRS = [
  { key: 'remate', label: 'Remate' },
  { key: 'pase', label: 'Pase' },
  { key: 'velocidad', label: 'Velocidad' },
  { key: 'fisico', label: 'Físico' },
];

/**
 * Puestos: el peso de cada atributo en la media. Los cuatro atributos se guardan con las mismas claves para todos
 * (así entrenamiento, eventos y guardados no cambian); el arquero los ve con otros nombres (`ATTR_ARQ`).
 */
export const POSITIONS = {
  arq: { label: 'Arquero', base: { remate: 53, pase: 44, velocidad: 48, fisico: 46 }, weights: { remate: 0.5, pase: 0.1, velocidad: 0.25, fisico: 0.15 } },
  def: { label: 'Defensor', base: { remate: 42, pase: 46, velocidad: 48, fisico: 54 }, weights: { remate: 0.1, pase: 0.2, velocidad: 0.3, fisico: 0.4 } },
  vol: { label: 'Volante', base: { remate: 44, pase: 52, velocidad: 46, fisico: 50 }, weights: { remate: 0.15, pase: 0.4, velocidad: 0.2, fisico: 0.25 } },
  del: { label: 'Delantero', base: { remate: 52, pase: 44, velocidad: 50, fisico: 46 }, weights: { remate: 0.4, pase: 0.15, velocidad: 0.25, fisico: 0.2 } },
};

/** Cómo ve los atributos el arquero: reflejos (remate), saque (pase), achique (velocidad) y físico. */
const ATTR_ARQ = { remate: 'Reflejos', pase: 'Saque', velocidad: 'Achique', fisico: 'Físico' };
export const attrLabel = (key, pos) => (pos === 'arq' ? ATTR_ARQ[key] : ATTRS.find((a) => a.key === key)?.label) ?? key;

/**
 * Los once lugares de la formación (4-2-3-1, atacando hacia arriba): `x`, `y` en % de la cancha. `mix` = qué parte
 * de las jugadas de ese lugar son remates, gambetas, quites, atajadas o pases. El 9 y el enganche juegan igual que
 * los delanteros y volantes de antes (los guardados sin `spot` usan esos dos).
 */
export const SPOTS = [
  { key: '9', pos: 'del', label: 'Centrodelantero', short: '9', x: 50, y: 13, mix: { remate: 0.5, gambeta: 0.2, pase: 0.3 }, hint: 'Vive del gol: la mayoría de tus jugadas son remates.' },
  { key: 'ei', pos: 'del', label: 'Extremo izquierdo', short: 'EI', x: 18, y: 31, mix: { remate: 0.35, gambeta: 0.4, pase: 0.25 }, hint: 'Encarás por la banda: muchas gambetas y remates.' },
  { key: 'mp', pos: 'vol', label: 'Enganche', short: '10', x: 50, y: 35, mix: { remate: 0.25, gambeta: 0.2, pase: 0.55 }, hint: 'El que la piensa: pases filtrados y asistencias.' },
  { key: 'ed', pos: 'del', label: 'Extremo derecho', short: 'ED', x: 82, y: 31, mix: { remate: 0.35, gambeta: 0.4, pase: 0.25 }, hint: 'Encarás por la banda: muchas gambetas y remates.' },
  { key: 'mci', pos: 'vol', label: 'Volante central', short: '5', x: 34, y: 55, mix: { remate: 0.15, quite: 0.4, pase: 0.45 }, hint: 'Recuperás y distribuís: quites y pases.' },
  { key: 'mcd', pos: 'vol', label: 'Volante mixto', short: '8', x: 66, y: 55, mix: { remate: 0.2, gambeta: 0.15, quite: 0.3, pase: 0.35 }, hint: 'Ida y vuelta: un poco de todo.' },
  { key: 'li', pos: 'def', label: 'Lateral izquierdo', short: 'LI', x: 12, y: 72, mix: { gambeta: 0.15, quite: 0.5, pase: 0.35 }, hint: 'Marcás la banda y pasás al ataque con centros.' },
  { key: 'dci', pos: 'def', label: 'Central izquierdo', short: 'DC', x: 37, y: 76, mix: { remate: 0.15, quite: 0.65, pase: 0.2 }, hint: 'El último hombre: quites y algún cabezazo en el córner.' },
  { key: 'dcd', pos: 'def', label: 'Central derecho', short: 'DC', x: 63, y: 76, mix: { remate: 0.15, quite: 0.65, pase: 0.2 }, hint: 'El último hombre: quites y algún cabezazo en el córner.' },
  { key: 'ld', pos: 'def', label: 'Lateral derecho', short: 'LD', x: 88, y: 72, mix: { gambeta: 0.15, quite: 0.5, pase: 0.35 }, hint: 'Marcás la banda y pasás al ataque con centros.' },
  { key: 'arq', pos: 'arq', label: 'Arquero', short: 'ARQ', x: 50, y: 91, mix: { atajada: 1 }, hint: 'Te patean y elegís adónde tirarte. Una atajada vale un gol.' },
];
const DEFAULT_SPOT = { del: '9', vol: 'mp', def: 'dci', arq: 'arq' };

/** El lugar del jugador en la formación (los guardados viejos no lo tienen: se deduce del puesto). */
export const spotOf = (player) => SPOTS.find((s) => s.key === player.spot) ?? SPOTS.find((s) => s.key === DEFAULT_SPOT[player.pos]);

export const ATTR_CAP = 88; // techo de un atributo: ni entrenando 15 años se llega a 99
export const START_POINTS = 6; // puntos para repartir al crear el jugador
export const MAX_EXTRA = 4; // como mucho en un atributo
export const START_AGE = 18;
export const NAME_MAX = 24;

/** Umbrales de confianza del DT (0–100): debajo de SUB juega en Reserva; desde START es titular. */
export const ROLE_AT = { sub: 50, start: 70 };
export const ROLE_LABEL = { reserva: 'Reserva', suplente: 'Suplente', titular: 'Titular' };

export const TRAINING = [
  { key: 'remate', label: 'Definición', attr: 'remate', cost: 20 },
  { key: 'pase', label: 'Pases', attr: 'pase', cost: 20 },
  { key: 'velocidad', label: 'Pique', attr: 'velocidad', cost: 22 },
  { key: 'fisico', label: 'Gimnasio', attr: 'fisico', cost: 22 },
  { key: 'descanso', label: 'Descansar', attr: null, cost: -35 },
];

/** Nombre del entrenamiento para el puesto (el arquero entrena reflejos, saques y achique). */
const TRAIN_ARQ = { remate: 'Reflejos', pase: 'Saques', velocidad: 'Achique' };
export const trainLabel = (t, pos) => (pos === 'arq' && TRAIN_ARQ[t.key]) || t.label;

export const clamp =(x, lo, hi) => Math.min(hi, Math.max(lo, x));

/** Nombre limpio: sin espacios de más, sin caracteres de control y con un largo razonable. */
export function cleanName(text) {
  return String(text ?? '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
}

/** `extra` = { atributo: puntos } repartidos al crear. Válido si suma ≤ START_POINTS y ninguno pasa MAX_EXTRA. */
export function validExtra(extra) {
  const values = Object.entries(extra ?? {});
  if (values.some(([k, v]) => !ATTRS.some((a) => a.key === k) || !Number.isInteger(v) || v < 0 || v > MAX_EXTRA)) return false;
  return values.reduce((s, [, v]) => s + v, 0) <= START_POINTS;
}

/** Jugador nuevo. Con `spot` (un lugar de la formación) el puesto sale de ahí; sin él, el de `pos`. */
export function newPlayer({ name, pos, spot, extra = {} }) {
  const where = spot ? SPOTS.find((s) => s.key === spot) : null;
  if (spot && !where) throw new Error(`lugar desconocido: ${spot}`);
  const key = where?.pos ?? pos;
  const p = POSITIONS[key];
  const clean = cleanName(name);
  if (!p) throw new Error(`puesto desconocido: ${pos}`);
  if (!clean) throw new Error('falta el nombre');
  if (!validExtra(extra)) throw new Error('reparto de puntos inválido');
  const attrs = Object.fromEntries(ATTRS.map(({ key: k }) => [k, p.base[k] + (extra[k] ?? 0)]));
  return { name: clean, pos: key, spot: where?.key ?? DEFAULT_SPOT[key], attrs, age: START_AGE, energy: 100, dt: 30, fans: 10 };
}

/** Media del jugador (1–99) según su puesto. */
export function overall(player) {
  const w = POSITIONS[player.pos].weights;
  return Math.round(ATTRS.reduce((s, { key }) => s + player.attrs[key] * w[key], 0));
}

/** Rol de la semana según la confianza del DT. Fundido (energía < 30) no arranca de titular. */
export function roleOf(player) {
  if (player.dt < ROLE_AT.sub) return 'reserva';
  if (player.dt >= ROLE_AT.start && player.energy >= 30) return 'titular';
  return 'suplente';
}

/**
 * El objetivo que se muestra arriba (como en los juegos de carrera: siempre hay una meta a la vista). `value` y `to`
 * son de la confianza del DT.
 */
export function objective(player) {
  if (player.dt < ROLE_AT.sub) return { text: 'Ganate un lugar en el banco de Primera', value: player.dt, to: ROLE_AT.sub, hint: 'Con puntajes de 7 o más en la Reserva, el DT te sube.' };
  if (player.dt < ROLE_AT.start) return { text: 'Ganate la titularidad', value: player.dt, to: ROLE_AT.start, hint: 'Cada buen partido desde el banco suma confianza.' };
  return { text: 'Sostené el puesto de titular', value: player.dt, to: 100, hint: `Si la confianza baja de ${ROLE_AT.start}, volvés al banco.` };
}

/** Qué tan probable es subir entrenando, en palabras (para los botones de entrenamiento). */
export function trainOdds(value, energy) {
  if (value >= ATTR_CAP) return 'tope';
  const c = trainChance(value, energy);
  if (c === 0) return 'fundido';
  return c >= 0.5 ? 'alta' : c >= 0.3 ? 'media' : 'baja';
}

/**
 * Probabilidad de subir un punto entrenando: cuesta más cuanto más alto está el atributo. Con poca energía rinde
 * menos y fundido (< 15) no sirve.
 */
export function trainChance(value, energy) {
  if (energy < 15 || value >= ATTR_CAP) return 0;
  return clamp((1 - value / (ATTR_CAP + 12)) * (energy < 40 ? 0.6 : 1), 0, 1);
}

/** Una sesión de la semana. Devuelve { player, gain, attr, tired }. `rand` = generador con semilla. */
export function train(player, key, rand) {
  const t = TRAINING.find((x) => x.key === key);
  if (!t) throw new Error(`entrenamiento desconocido: ${key}`);
  if (!t.attr) return { player: { ...player, energy: clamp(player.energy - t.cost, 0, 100) }, gain: 0, attr: null, tired: false };
  const cost = t.cost - ((player.perks ?? []).includes('nutricionista') ? 5 : 0); // mejora: nutricionista
  const value = player.attrs[t.attr];
  const chance = trainChance(value, player.energy);
  const gain = rand() < chance ? (rand() < 0.35 ? 2 : 1) : 0;
  const attrs = { ...player.attrs, [t.attr]: clamp(value + gain, 1, ATTR_CAP) };
  return { player: { ...player, attrs, energy: clamp(player.energy - cost, 0, 100) }, gain, attr: t.attr, tired: chance === 0 };
}

/** Energía que gasta un partido según el rol (el físico la baja). */
export function matchCost(player, role) {
  const base = role === 'suplente' ? 12 : 26;
  return Math.round(base * (1.25 - player.attrs.fisico / 200));
}

/** Lo que recupera en la semana sin contar el entrenamiento. */
export const WEEK_REST = 20;

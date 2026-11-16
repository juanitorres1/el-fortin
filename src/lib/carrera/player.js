// Modo Carrera · el jugador: puestos, atributos, entrenamiento y rol en el plantel. Lógica pura (sin React).
// Todo número sale de acá: si hay que balancear, se toca este archivo y tests/carrera.test.js lo controla.

export const ATTRS = [
  { key: 'remate', label: 'Remate' },
  { key: 'pase', label: 'Pase' },
  { key: 'velocidad', label: 'Velocidad' },
  { key: 'fisico', label: 'Físico' },
];

/** Puestos: el peso de cada atributo en la media y qué parte de las jugadas son remates (el resto, pases). */
export const POSITIONS = {
  del: { label: 'Delantero', base: { remate: 52, pase: 44, velocidad: 50, fisico: 46 }, weights: { remate: 0.4, pase: 0.15, velocidad: 0.25, fisico: 0.2 }, shots: 0.7 },
  vol: { label: 'Volante', base: { remate: 44, pase: 52, velocidad: 46, fisico: 50 }, weights: { remate: 0.15, pase: 0.4, velocidad: 0.2, fisico: 0.25 }, shots: 0.35 },
};

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

export const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

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

export function newPlayer({ name, pos, extra = {} }) {
  const p = POSITIONS[pos];
  const clean = cleanName(name);
  if (!p) throw new Error(`puesto desconocido: ${pos}`);
  if (!clean) throw new Error('falta el nombre');
  if (!validExtra(extra)) throw new Error('reparto de puntos inválido');
  const attrs = Object.fromEntries(ATTRS.map(({ key }) => [key, p.base[key] + (extra[key] ?? 0)]));
  return { name: clean, pos, attrs, age: START_AGE, energy: 100, dt: 30, fans: 10 };
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

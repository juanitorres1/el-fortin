// Juegos con jugadores: El Tapado, Trayectoria V, Grilla del Fortín y El Once de Liniers. Los históricos salen de
// data/jugadores.json (Wikidata, ver scripts/import-jugadores.mjs), el plantel de ESPN y las formaciones de
// data/onces.json (scripts/import-onces.mjs). Todo puro: el estado de cada partida lo guarda la página.
import { dailyPick, seeded, weekNumber } from './daily.js';
import { shuffle } from './trivia.js';
import { teamLogo } from './espn.js';

// ---------- Fotos y escudos ----------

/** Miniatura de un archivo de Wikimedia Commons, de `width` px de ancho. */
export const commonsThumb = (file, width = 96) => `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=${width}`;
const commonsPage = (file) => `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file.replaceAll(' ', '_'))}`;

/**
 * La foto de un jugador a partir de `img` = [archivo, autor, licencia] (jugadores.json, onces.json):
 * { src, big, credit, href } o null. El crédito va siempre al lado de la foto grande: lo piden las licencias.
 */
export function photoOf(img) {
  if (!img) return null;
  const [file, author, license] = img;
  const by = /unknown|desconocido/i.test(author) ? 'autor desconocido' : author;
  return { src: commonsThumb(file, 96), big: commonsThumb(file, 320), credit: `Foto: ${by} · ${license} · Wikimedia Commons`, href: commonsPage(file) };
}

/** URL del escudo de un código de jugadores.json › logos: «e123» (ESPN) o «cArchivo» (Commons). */
export const logoUrl = (code) => (!code ? null : code[0] === 'e' ? teamLogo(code.slice(1)) : commonsThumb(code.slice(1), 64));

export const POS_NAME = { G: 'Arquero', D: 'Defensor', M: 'Mediocampista', F: 'Delantero' };
const POS_SHORT = { G: 'ARQ', D: 'DEF', M: 'MED', F: 'DEL' };

// ---------- Jugadores históricos ----------

const isComplete = (p) => Boolean(p.b && p.pos.length && p.nat.length && p.v.from);
const clubsOf = (p) => new Set(p.c.map((c) => c[0])).size;
/** ¿Se puede armar su trayectoria? Cuatro etapas o más, todas con año. */
const hasPath = (p) => p.c.length >= 4 && p.c.every((c) => c[1] != null);

/**
 * Los jugadores de jugadores.json listos para usar: `rank` = qué tan conocido es (para ordenar las sugerencias),
 * `photo` = su foto (o null) y, en cada etapa de `c`, la URL del escudo en la posición 6 (o null).
 */
export function historicPlayers(json) {
  const logos = json?.logos ?? [];
  return (json?.players ?? []).map((p) => ({ ...p, rank: p.links, photo: photoOf(p.img), c: p.c.map((c) => [...c.slice(0, 6), logoUrl(logos[c[6]])]) }));
}

// ---------- El Tapado ----------

export const TAPADO_TRIES = { hoy: 6, historia: 8 };

const posCell = (a, b) => {
  const [x, y] = [[a].flat(), [b].flat()];
  const shared = x.filter((p) => y.includes(p)).length;
  return shared === x.length && shared === y.length ? 'ok' : shared ? 'near' : 'no';
};
const setCell = (a, b) => posCell(a, b);
const numCell = (near) => (a, b) => (a == null || b == null ? 'no' : a === b ? 'ok' : Math.abs(a - b) <= near ? 'near' : 'no');

/** Columnas de cada modo: { key, label, get, show, cell, num } (`num` = lleva flecha ↑↓ hacia la respuesta). */
export const TAPADO_COLS = {
  hoy: [
    { key: 'pos', label: 'Puesto', get: (p) => p.pos, show: (v) => POS_SHORT[v] ?? '–', cell: (a, b) => (a === b ? 'ok' : 'no') },
    { key: 'nat', label: 'País', get: (p) => p.nat, show: (v) => v ?? '–', cell: (a, b) => (a === b ? 'ok' : 'no') },
    { key: 'age', label: 'Edad', get: (p) => p.age, show: (v) => v ?? '–', cell: numCell(2), num: true },
    { key: 'jersey', label: 'Dorsal', get: (p) => (p.jersey == null ? null : Number(p.jersey)), show: (v) => v ?? '–', cell: numCell(5), num: true },
    { key: 'pj', label: 'Partidos', get: (p) => p.pj, show: (v) => v ?? '–', cell: numCell(3), num: true },
    { key: 'g', label: 'Goles', get: (p) => p.g, show: (v) => v ?? '–', cell: numCell(1), num: true },
  ],
  historia: [
    { key: 'pos', label: 'Puesto', get: (p) => p.pos, show: (v) => v.map((x) => POS_SHORT[x]).join('/') || '–', cell: posCell },
    { key: 'nat', label: 'País', get: (p) => p.nat, show: (v) => v.join(' / ') || '–', cell: setCell },
    { key: 'b', label: 'Nació', get: (p) => p.b, show: (v) => v ?? '–', cell: numCell(3), num: true },
    { key: 'from', label: 'Llegó', get: (p) => p.v.from, show: (v) => v ?? '–', cell: numCell(3), num: true },
    { key: 'clubs', label: 'Clubes', get: clubsOf, show: (v) => v, cell: numCell(2), num: true },
    { key: 'sel', label: 'Selección', get: (p) => Boolean(p.sel), show: (v) => (v ? 'Sí' : 'No'), cell: (a, b) => (a === b ? 'ok' : 'no') },
  ],
};

/**
 * El plantel de hoy con los partidos y goles del torneo en curso (players.json): los candidatos del modo «hoy».
 * Solo entran los que tienen puesto, edad y dorsal.
 */
export function squadPlayers(roster, stats) {
  const byId = new Map((stats?.tournaments?.[0]?.players ?? []).map((p) => [p.id, p]));
  return (roster?.players ?? [])
    .filter((p) => p.pos && p.age != null && p.jersey != null)
    .map((p) => ({ id: p.id, n: p.name, pos: p.pos, nat: p.nat, age: p.age, jersey: p.jersey, flag: p.flag ?? null, photo: p.photo ? { src: p.photo, big: p.photo, credit: 'Foto: ESPN', href: null } : null, pj: byId.get(p.id)?.pj ?? 0, g: byId.get(p.id)?.g ?? 0, rank: byId.get(p.id)?.pj ?? 0 }));
}

export const SQUAD_MIN = 8;

/**
 * Los que pueden ser la respuesta del modo «hoy»: los que jugaron en el torneo (un suplente de 20 años sin partidos
 * no se adivina por sus datos). A principio de torneo, cuando casi nadie jugó, los SQUAD_MIN con más partidos.
 */
export function squadAnswers(squad) {
  const played = squad.filter((p) => p.pj > 0);
  if (played.length >= SQUAD_MIN) return played;
  return [...squad].sort((a, b) => b.pj - a.pj || String(a.id).localeCompare(String(b.id))).slice(0, SQUAD_MIN);
}

/** Los históricos que se pueden escribir (con todos los datos) y los que pueden ser la respuesta (los más conocidos). */
export function tapadoPools(players) {
  const guess = players.filter(isComplete);
  return { guess, answers: guess.filter((p) => p.links >= 10) };
}

/** El tapado del día: uno de `answers` (sin repetir hasta que pasen todos). */
export const tapadoOfDay = (answers, day, mode) => {
  const id = dailyPick(answers.map((p) => p.id), day, `tapado-${mode}`);
  return answers.find((p) => p.id === id) ?? null;
};

/**
 * Compara un intento con la respuesta, columna por columna:
 * [{ key, label, text, state: 'ok' | 'near' | 'no', dir: 'up' | 'down' | null }] (`dir` = la respuesta es más alta o más baja).
 */
export function tapadoRow(guess, target, mode) {
  return TAPADO_COLS[mode].map((c) => {
    const [a, b] = [c.get(guess), c.get(target)];
    const state = c.cell(a, b);
    return { key: c.key, label: c.label, text: String(c.show(a)), state, dir: c.num && state !== 'ok' && a != null && b != null ? (b > a ? 'up' : 'down') : null };
  });
}

// ---------- Trayectoria V ----------

export const PATH_TRIES = 5;

export const pathPool = (players) => players.filter((p) => hasPath(p) && p.links >= 8);
export const pathOfDay = (players, day) => {
  const pool = pathPool(players);
  const id = dailyPick(pool.map((p) => p.id), day, 'trayectoria');
  return pool.find((p) => p.id === id) ?? null;
};

/**
 * La trayectoria como se ve después de `fails` intentos fallidos (o completa con `all`): los años y Vélez se ven
 * siempre; cada fallo destapa un club más, del primero de su carrera al último. Con 3 fallos se suman puesto y país.
 * Devuelve { steps: [{ club, logo, from, to, pais, velez, hidden }], hint: 'Delantero · Argentina' | null }.
 */
export function pathView(player, fails, all = false) {
  let open = fails;
  const steps = player.c.map(([club, from, to, pais, , velez, logo]) => {
    const shown = all || velez || open-- > 0;
    return { club: shown ? club : null, pais: shown ? pais : null, logo: shown ? logo ?? null : null, from, to, velez: Boolean(velez), hidden: !shown };
  });
  const hint = all || fails >= 3 ? [player.pos.map((x) => POS_NAME[x]).join(' / '), player.nat.join(' / ')].filter(Boolean).join(' · ') : null;
  return { steps, hint };
}

// ---------- Grilla del Fortín ----------

const played = (name, pais) => (p) => p.c.some((c) => c[0] === name && (!pais || c[3] === pais));
const playedIn = (pais) => (p) => p.c.some((c) => c[3] === pais && !c[5]);
const arrived = (decade) => (p) => p.v.from != null && Math.floor(p.v.from / 10) * 10 === decade;

/** Criterios de la grilla. `group` evita cruzar dos del mismo tipo en la misma fila o columna. */
export const CRITERIA = [
  ...Object.entries(POS_NAME).map(([k, name]) => ({ id: `pos-${k}`, group: 'pos', label: name, test: (p) => p.pos.includes(k) })),
  { id: 'ext', group: 'nat', label: 'Extranjero', test: (p) => p.nat.length > 0 && !p.nat.includes('Argentina') },
  { id: 'nat-uy', group: 'nat', label: 'Uruguayo', test: (p) => p.nat.includes('Uruguay') },
  { id: 'sel', group: 'sel', label: 'Jugó en una selección mayor', test: (p) => Boolean(p.sel) },
  { id: 'eu', group: 'lugar', label: 'Jugó en Europa', test: (p) => p.c.some((c) => c[4]) },
  { id: 'mx', group: 'lugar', label: 'Jugó en México', test: playedIn('México') },
  { id: 'es', group: 'lugar', label: 'Jugó en España', test: playedIn('España') },
  { id: 'it', group: 'lugar', label: 'Jugó en Italia', test: playedIn('Italia') },
  { id: 'br', group: 'lugar', label: 'Jugó en Brasil', test: playedIn('Brasil') },
  ...[['Boca Juniors', 'Boca'], ['River Plate', 'River'], ['Racing Club', 'Racing'], ['Independiente', 'Independiente'], ['San Lorenzo', 'San Lorenzo'], ['Estudiantes de La Plata', 'Estudiantes'], ['Argentinos Juniors', 'Argentinos'], ['Huracán', 'Huracán'], ['Banfield', 'Banfield'], ['Colón', 'Colón']]
    .map(([name, short]) => ({ id: `club-${short}`, group: 'club', label: `Pasó por ${short}`, test: played(name, 'Argentina') })),
  ...[[1970, 'los 70'], [1980, 'los 80'], [1990, 'los 90'], [2000, 'los 2000'], [2010, 'los 2010']]
    .map(([d, text]) => ({ id: `dec-${d}`, group: 'dec', label: `Llegó a Vélez en ${text}`, test: arrived(d) })),
];

export const GRID_MIN = 3; // respuestas posibles como mínimo en cada casilla

/** Los jugadores que valen para una casilla (fila × columna). */
export const cellPlayers = (players, row, col) => players.filter((p) => row.test(p) && col.test(p));

/**
 * La grilla de un día: 3 criterios en las filas y 3 en las columnas, con al menos GRID_MIN jugadores posibles en cada
 * casilla. Devuelve { rows, cols } o null si no hay datos para armarla.
 */
export function dailyGrid(players, day) {
  if (!players?.length) return null;
  const rand = seeded('grilla', day);
  for (let tries = 0; tries < 500; tries++) {
    const six = shuffle(CRITERIA, rand).slice(0, 6);
    const [rows, cols] = [six.slice(0, 3), six.slice(3)];
    const groups = (l) => new Set(l.map((c) => c.group)).size;
    // Dentro de un eje no se repite el tipo, salvo los clubes (tres clubes en las filas es una buena grilla).
    if ([rows, cols].some((l) => groups(l) < 3 && !l.every((c) => c.group === 'club'))) continue;
    if (rows.every((r) => cols.every((c) => r.group !== c.group || r.group === 'club') && cols.every((c) => cellPlayers(players, r, c).length >= GRID_MIN))) return { rows, cols };
  }
  return null;
}

/** ¿Vale este jugador en la casilla `i` (0–8, por filas)? */
export function gridCheck(grid, i, player) {
  return grid.rows[Math.floor(i / 3)].test(player) && grid.cols[i % 3].test(player);
}

/**
 * Intentos de la grilla: un cupo total y no uno por casilla. Con datos de Wikidata incompletos, un intento por casilla
 * castigaba de más un jugador que sí vale pero no figura; con 9 + 3 de margen se pueden errar tres en total.
 */
export const GRID_TRIES = 12;

/**
 * El estado de una partida de la grilla: `cells` = { [i]: { id, ok } } (las partidas de antes guardaban también los
 * errores ahí: cuentan como intentos y la casilla queda cerrada) y `misses` = [{ i, id }] (errores con el cupo nuevo).
 * Devuelve { right: { [i]: id }, missed: { [i]: [ids] }, closed: Set, used, left, done }.
 */
export function gridState(game) {
  const right = {};
  const missed = {};
  const closed = new Set();
  let used = 0;
  for (const [k, c] of Object.entries(game?.cells ?? {})) {
    const i = Number(k);
    used += 1;
    closed.add(i);
    if (c.ok) right[i] = c.id;
    else (missed[i] ??= []).push(c.id);
  }
  for (const m of game?.misses ?? []) {
    used += 1;
    (missed[m.i] ??= []).push(m.id);
  }
  const left = Math.max(0, GRID_TRIES - used);
  return { right, missed, closed, used, left, done: closed.size === 9 || left === 0 };
}

/** Puntos «de tapado» de una respuesta: vale más el jugador menos conocido (menos artículos en Wikipedia). */
export const rarity = (p) => (p.links < 8 ? 3 : p.links < 15 ? 2 : 1);

// ---------- El Once de Liniers ----------

export const ONCE_LIVES = 4;

/** La formación de la semana (cambia los domingos). */
export function onceOfWeek(onces, day) {
  const id = dailyPick((onces ?? []).map((o) => o.id), weekNumber(day), 'liniers');
  return onces?.find((o) => o.id === id) ?? null;
}

/** Todos los nombres que se pueden escribir: los titulares de todas las formaciones (sin repetir). */
export function onceNames(onces) {
  const count = new Map();
  for (const o of onces ?? []) for (const p of o.players) count.set(p.n, (count.get(p.n) ?? 0) + 1);
  const img = new Map((onces ?? []).flatMap((o) => o.players.filter((p) => p.img).map((p) => [p.n, p.img])));
  return [...count].map(([n, rank]) => ({ id: n, n, rank, photo: photoOf(img.get(n)) }));
}

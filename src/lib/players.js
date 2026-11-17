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

const POS_ALL = ['G', 'D', 'M', 'F'];

/**
 * Columnas de cada modo: { key, label, get, show, cell, num, near, min, one, domain, bool }. `num` = lleva flecha ↑↓
 * hacia la respuesta y `near` = cuánto es «cerca»; `min` = el valor más chico posible; `one` = muestra un elemento
 * (para las exclusiones); `domain` = todos los valores posibles; `bool` = sí o no.
 */
const numCol = (key, label, get, near, min) => ({ key, label, get, show: (v) => v ?? '–', cell: numCell(near), num: true, near, min });
export const TAPADO_COLS = {
  hoy: [
    { key: 'pos', label: 'Puesto', get: (p) => p.pos, show: (v) => POS_SHORT[v] ?? '–', one: (x) => POS_SHORT[x], domain: POS_ALL, cell: (a, b) => (a === b ? 'ok' : 'no') },
    { key: 'nat', label: 'País', get: (p) => p.nat, show: (v) => v ?? '–', one: (x) => x, cell: (a, b) => (a === b ? 'ok' : 'no') },
    numCol('age', 'Edad', (p) => p.age, 2),
    numCol('jersey', 'Dorsal', (p) => (p.jersey == null ? null : Number(p.jersey)), 5, 1),
    numCol('pj', 'Partidos', (p) => p.pj, 3, 0),
    numCol('g', 'Goles', (p) => p.g, 1, 0),
  ],
  historia: [
    { key: 'pos', label: 'Puesto', get: (p) => p.pos, show: (v) => v.map((x) => POS_SHORT[x]).join('/') || '–', one: (x) => POS_SHORT[x], domain: POS_ALL, cell: posCell },
    { key: 'nat', label: 'País', get: (p) => p.nat, show: (v) => v.join(' / ') || '–', one: (x) => x, cell: setCell },
    numCol('b', 'Nació', (p) => p.b, 3),
    numCol('from', 'Llegó', (p) => p.v.from, 3),
    numCol('clubs', 'Clubes', clubsOf, 2, 1),
    { key: 'sel', label: 'Selección', get: (p) => Boolean(p.sel), show: (v) => (v ? 'Sí' : 'No'), bool: true, cell: (a, b) => (a === b ? 'ok' : 'no') },
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

/**
 * Lo que ya se sabe de la respuesta juntando todos los intentos (solo lo que dicen las filas: nada de más), columna
 * por columna: { key, label, state, text, not }. `state`: 'ok' (el dato exacto en `text`), 'range' (entre dos
 * valores, en `text`), 'some' (comparte algo con `text`, en los datos con varios valores), 'unknown'. `not` = lo
 * que ya se descartó (puestos, países).
 */
export function tapadoClues(guesses, target, mode) {
  const rows = guesses.map((g) => tapadoRow(g, target, mode));
  return TAPADO_COLS[mode].map((c, ci) => {
    const clue = { key: c.key, label: c.label, state: 'unknown', text: null, not: [] };
    const near = [];
    const out = new Set();
    let [lo, hi] = [c.min ?? -Infinity, Infinity];
    for (const [gi, g] of guesses.entries()) {
      const a = c.get(g);
      const { state, dir } = rows[gi][ci];
      if (state === 'ok') return { ...clue, state: 'ok', text: String(c.show(a)) };
      if (c.bool) return { ...clue, state: 'ok', text: String(c.show(!a)) };
      if (c.num) {
        if (a == null || dir == null) continue;
        const reach = state === 'near' ? c.near : Infinity;
        if (dir === 'up') [lo, hi] = [Math.max(lo, state === 'near' ? a + 1 : a + c.near + 1), Math.min(hi, a + reach)];
        else [lo, hi] = [Math.max(lo, a - reach), Math.min(hi, state === 'near' ? a - 1 : a - c.near - 1)];
      } else if (a != null) {
        const vals = [a].flat();
        if (state === 'no') vals.forEach((v) => out.add(v));
        else if (vals.length) near.push(String(c.show(a)));
      }
    }
    if (c.num) {
      if (lo > hi) return clue; // datos que no cierran (no debería pasar)
      if (lo === hi) return { ...clue, state: 'ok', text: String(lo) };
      const from = Number.isFinite(lo) && lo !== c.min;
      if (Number.isFinite(hi)) return { ...clue, state: 'range', text: Number.isFinite(lo) ? `${lo}–${hi}` : `${hi} o menos` };
      return from ? { ...clue, state: 'range', text: `${lo} o más` } : clue;
    }
    const left = c.domain?.filter((x) => !out.has(x));
    if (left?.length === 1) return { ...clue, state: 'ok', text: c.one(left[0]) };
    return { ...clue, state: near.length ? 'some' : 'unknown', text: near.length ? near.join(' · ') : null, not: [...out].map(c.one) };
  });
}

/** ¿La partida guardada (useDaily: { day, guesses, answer }) de ese día ya terminó? */
export function tapadoDone(saved, day, mode) {
  if (saved?.day !== day || !saved.answer || !Array.isArray(saved.guesses)) return false;
  return saved.guesses.includes(saved.answer) || saved.guesses.length >= TAPADO_TRIES[mode];
}

/** La ficha corta del jugador revelado: puesto, país y lo que lo identifica en ese modo. */
export function tapadoFicha(p, mode) {
  const pos = [p.pos].flat().map((x) => POS_NAME[x]).filter(Boolean).join(' / ');
  const nat = [p.nat].flat().filter(Boolean).join(' / ');
  const extra = mode === 'hoy'
    ? [p.jersey != null && `dorsal ${p.jersey}`, p.age != null && `${p.age} años`]
    : [p.v?.from && `en Vélez desde ${p.v.from}${p.v.to && p.v.to !== p.v.from ? ` hasta ${p.v.to}` : ''}`];
  return [pos, nat, ...extra].filter(Boolean).join(' · ');
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

/** Pistas de Trayectoria V, una más por fallo desde el segundo: `at` = fallos que hacen falta para verla. */
export const PATH_CLUES = [
  { key: 'pais', label: 'País', at: 2, value: (p) => p.nat.join(' / ') },
  { key: 'puesto', label: 'Puesto', at: 3, value: (p) => p.pos.map((x) => POS_NAME[x]).join(' / ') },
  { key: 'nacio', label: 'Nació en', at: 4, value: (p) => (p.b ? String(p.b) : '') },
];

/**
 * Las pistas después de `fails` fallos (todas con `all`): [{ key, label, at, value, open }]; las cerradas van con
 * `value` null. Las que no tienen dato (sin país, sin año) no se muestran.
 */
export const pathClues = (player, fails, all = false) =>
  PATH_CLUES.map((c) => ({ key: c.key, label: c.label, at: c.at, value: c.value(player) || null }))
    .filter((c) => c.value)
    .map((c) => ({ ...c, open: all || fails >= c.at, value: all || fails >= c.at ? c.value : null }));

/**
 * El estado de la partida de Trayectoria V a partir de lo jugado: `guesses` = ids elegidos, con `null` cuando el
 * jugador pasó (destapó un club sin arriesgar). { tries, won, fails, done, left }.
 */
export function pathState(guesses, targetId) {
  const tries = guesses.length;
  const won = guesses.includes(targetId);
  const fails = tries - (won ? 1 : 0);
  return { tries, won, fails, done: won || tries >= PATH_TRIES, left: Math.max(0, PATH_TRIES - tries) };
}

// ---------- Grilla del Fortín ----------

const played = (name, pais) => (p) => p.c.some((c) => c[0] === name && (!pais || c[3] === pais));
const playedIn = (pais) => (p) => p.c.some((c) => c[3] === pais && !c[5]);
const arrived = (decade) => (p) => p.v.from != null && Math.floor(p.v.from / 10) * 10 === decade;

/**
 * Criterios de la grilla. `group` evita cruzar dos del mismo tipo en la misma fila o columna. `head` = [antetítulo,
 * texto corto] para los encabezados (el `label` entero no entra en una columna de 84 px); `club` = nombre en
 * jugadores.json, para buscar el escudo (`criterionLogo`).
 */
export const CRITERIA = [
  ...Object.entries(POS_NAME).map(([k, name]) => ({ id: `pos-${k}`, group: 'pos', label: name, head: ['Puesto', name], test: (p) => p.pos.includes(k) })),
  { id: 'ext', group: 'nat', label: 'Extranjero', head: ['Nacionalidad', 'Extranjero'], test: (p) => p.nat.length > 0 && !p.nat.includes('Argentina') },
  { id: 'nat-uy', group: 'nat', label: 'Uruguayo', head: ['Nacionalidad', 'Uruguayo'], test: (p) => p.nat.includes('Uruguay') },
  { id: 'sel', group: 'sel', label: 'Jugó en una selección mayor', head: ['Jugó en una', 'Selección mayor'], test: (p) => Boolean(p.sel) },
  { id: 'eu', group: 'lugar', label: 'Jugó en Europa', head: ['Jugó en', 'Europa'], test: (p) => p.c.some((c) => c[4]) },
  ...[['mx', 'México'], ['es', 'España'], ['it', 'Italia'], ['br', 'Brasil']]
    .map(([id, pais]) => ({ id, group: 'lugar', label: `Jugó en ${pais}`, head: ['Jugó en', pais], test: playedIn(pais) })),
  ...[['Boca Juniors', 'Boca'], ['River Plate', 'River'], ['Racing Club', 'Racing'], ['Independiente', 'Independiente'], ['San Lorenzo', 'San Lorenzo'], ['Estudiantes de La Plata', 'Estudiantes'], ['Argentinos Juniors', 'Argentinos'], ['Huracán', 'Huracán'], ['Banfield', 'Banfield'], ['Colón', 'Colón']]
    .map(([name, short]) => ({ id: `club-${short}`, group: 'club', label: `Pasó por ${short}`, head: ['Pasó por', short], club: name, test: played(name, 'Argentina') })),
  ...[[1970, 'los 70'], [1980, 'los 80'], [1990, 'los 90'], [2000, 'los 2000'], [2010, 'los 2010']]
    .map(([d, text]) => ({ id: `dec-${d}`, group: 'dec', label: `Llegó a Vélez en ${text}`, head: ['Llegó a Vélez en', text], test: arrived(d) })),
];

/**
 * El escudo de un criterio de club: la URL que `historicPlayers` dejó en las etapas (`c[6]`) de ese club en
 * Argentina. null si el criterio no es de club o ningún jugador la tiene.
 */
export function criterionLogo(players, crit) {
  if (!crit?.club) return null;
  for (const p of players ?? []) for (const c of p.c) if (c[0] === crit.club && c[3] === 'Argentina' && c[6]) return c[6];
  return null;
}

/** Por qué no vale un jugador en la casilla `i`: los criterios (fila y/o columna) que no cumple. [] si vale. */
export const gridMisses = (grid, i, player) => [grid.rows[Math.floor(i / 3)], grid.cols[i % 3]].filter((c) => !c.test(player));

/**
 * Las respuestas de la casilla `i` para mostrar al final: { total, known, rare }. `known` = hasta `n` de los más
 * conocidos y `rare` = el menos conocido (el más «tapado»), sin repetir `mine` (el que puso el hincha) ni entre sí.
 */
export function gridAnswers(players, grid, i, mine = null, n = 3) {
  const all = cellPlayers(players, grid.rows[Math.floor(i / 3)], grid.cols[i % 3]).sort((a, b) => b.links - a.links || a.n.localeCompare(b.n));
  const others = all.filter((p) => p.id !== mine);
  const known = others.slice(0, n);
  const rare = others.length > n ? others.at(-1) : null;
  return { total: all.length, known, rare };
}

/** La primera casilla libre (0–8) que no esté en `closed`, o null. */
export const gridFirstOpen = (closed) => [0, 1, 2, 3, 4, 5, 6, 7, 8].find((i) => !closed.has(i)) ?? null;

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

const ONCE_LINES = ['F', 'M', 'D', 'G'];

/** Las líneas para dibujar la cancha, de arriba (delanteros) a abajo (arquero); cada jugador con su índice `i`. */
export function onceRows(players) {
  const all = (players ?? []).map((p, i) => ({ ...p, i }));
  return ONCE_LINES.map((line) => all.filter((p) => p.pos === line)).filter((row) => row.length);
}

/** El dibujo táctico contado desde atrás, sin el arquero: «4-4-2». */
export const onceFormation = (players) => [...onceRows(players)].reverse().filter((r) => r[0].pos !== 'G').map((r) => r.length).join('-');

/** Cómo se lo nombra en la cancha: el apellido, con «De los» y compañía si los tiene («De los Santos»). */
export function onceShort(name) {
  const w = String(name ?? '').trim().split(/\s+/);
  let i = w.length - 1;
  while (i > 1 && /^(de|del|la|las|los|da|di|van|von)$/i.test(w[i - 1])) i--;
  return w.slice(i).join(' ');
}

/** La pista: las iniciales de cada palabra del nombre («J. L. C.»). */
export const onceInitials = (name) => String(name ?? '').trim().split(/\s+/).filter(Boolean).map((w) => `${w[0].toUpperCase()}.`).join(' ');

/**
 * Cómo va la partida: `game` = { found, wrong, hints } (nombres; `hints` = a quién se le pidió la pista, que cuesta
 * una vida y no se puede pedir con la última). Guardados viejos sin `hints` valen igual.
 */
export function onceProgress(once, game) {
  const total = once?.players?.length ?? 0;
  const found = new Set(game?.found ?? []);
  const hints = new Set(game?.hints ?? []);
  const lives = Math.max(0, ONCE_LIVES - (game?.wrong?.length ?? 0) - hints.size);
  const results = (once?.players ?? []).map((p) => found.has(p.n));
  const score = results.filter(Boolean).length;
  const lost = lives === 0;
  const win = total > 0 && score === total;
  return { found, hints, lives, results, score, total, lost, win, done: lost || win, canHint: !lost && !win && lives > 1 };
}

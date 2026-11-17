// Trivia diaria: 5 preguntas por día, iguales para todos (salen de la fecha) y sin repetir hasta agotar todas, armadas solas con lo que ya está en
// data/club.json (historia, palmarés, momentos, ídolos y récords). No hay preguntas escritas a mano: si se corrige
// un dato en club.json, la trivia lo sigue. Las opciones incorrectas salen de otros datos del mismo archivo (o de
// años vecinos), con la misma forma que la respuesta y cerca de ella: ver `dateDistractors` y `nearest`.

/** Personas que no se destacan en el sitio (decisión del usuario: siguen en Récords porque son datos). */
const EXCLUDE = new Set(['Fabián Cubero']);
export const TRIVIA_SIZE = 5;
const OPTIONS = 4;

/** Generador pseudoaleatorio con semilla (mulberry32): mismo día, mismas preguntas. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(list, rand) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const quote = (s) => (/^«.*»$/.test(s) ? s : `«${s}»`);
const unique = (list) => [...new Set(list.filter((x) => x != null && x !== ''))];

/** Nombre de cada tipo de pregunta, para el encabezado de la tarjeta. */
export const TRIVIA_TYPES = {
  historia: 'Historia',
  goleadores: 'Goleadores',
  presencias: 'Presencias',
  torneo: 'Goleador de un torneo',
  palmares: 'Palmarés',
  momentos: 'Momentos',
  idolos: 'Ídolos',
};

/**
 * Pregunta con la respuesta y opciones incorrectas tomadas de `pool` (sin repetir ni incluir la correcta). `person` =
 * el nombre de la persona de la respuesta (goleadores, presencias, ídolos), para mostrar su foto después de responder.
 */
function q(type, text, answer, pool, note, person) {
  const wrong = unique(pool).filter((x) => String(x) !== String(answer));
  return wrong.length >= 2 ? { type, text, answer: String(answer), wrong: wrong.map(String), note, ...(person ? { person } : {}) } : null;
}

const surname = (name) => name.split(' ').slice(-1)[0];
const mask = (text, name) => [name, surname(name)].reduce((t, n) => t.replaceAll(n, '…'), text);

// Las opciones incorrectas tienen que tener la misma forma que la correcta (año suelto, rango «1993–1998», temporada
// «2012/13», resultado con o sin penales) y estar cerca de ella (mismo número de goles, misma época): si no, se
// descartan solas. De cada pregunta quedan las NEAR más parecidas y el día sortea 3 de esas.
const NEAR = 5;
const YEAR = /^\d{4}$/;
const RANGE = /^(\d{4})–(\d{4})$/;
const SEASON = /^(\d{4})\/(\d{2})$/;
const PEN = / pen\.$/;
const yearOf = (s) => Number(String(s).match(/\d{4}/)?.[0]);

/** Las `NEAR` de `items` más cercanas a `target` según `key` (sin la respuesta ni repetidas). */
function nearest(items, key, target, answer, name = String) {
  const seen = new Set([String(answer)]);
  return [...items]
    .map((x, i) => ({ x, i, d: Math.abs(key(x) - target) }))
    .filter(({ d }) => Number.isFinite(d))
    .sort((a, b) => a.d - b.d || a.i - b.i)
    .map(({ x }) => x)
    .filter((x) => {
      const k = String(name(x));
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, NEAR);
}

/**
 * Opciones incorrectas para una respuesta de fecha, con su misma forma: años reales del archivo (`real`) y vecinos
 * de la respuesta (±2, ±4, ±6 años), nunca después de `last` (el último año que aparece en los datos) ni antes de 1910.
 */
export function dateDistractors(answer, real, last) {
  const ok = (y) => y >= 1910 && y <= last;
  const a = String(answer);
  let m;
  if ((m = a.match(RANGE))) {
    const [from, to] = [Number(m[1]), Number(m[2])];
    const shifted = [-9, -6, -3, 3, 6, 9].map((d) => [from + d, to + d]).filter(([x, y]) => ok(x) && ok(y)).map(([x, y]) => `${x}–${y}`);
    return nearest([...real.filter((x) => RANGE.test(x)), ...shifted], yearOf, from, a);
  }
  if ((m = a.match(SEASON))) {
    const from = Number(m[1]);
    const season = (y) => `${y}/${String((y + 1) % 100).padStart(2, '0')}`;
    return nearest([-3, -2, -1, 1, 2, 3].map((d) => from + d).filter((y) => ok(y + 1)).map(season), yearOf, from, a);
  }
  const y = Number(a);
  const near = [-6, -4, -2, 2, 4, 6].map((d) => y + d).filter(ok).map(String);
  return nearest([...real.filter((x) => YEAR.test(x)), ...near], Number, y, a);
}

/** Resultados para las opciones: con penales si la respuesta es con penales y sin penales si no. */
function scoreDistractors(answer, real) {
  const pen = PEN.test(answer);
  const fill = pen ? ['4-2 pen.', '4-3 pen.', '5-4 pen.', '3-1 pen.', '3-2 pen.'] : ['1-0', '2-1', '3-1', '1-1', '2-0', '0-0'];
  return unique([...real.filter((x) => PEN.test(x) === pen), ...fill]).filter((x) => x !== answer).slice(0, NEAR);
}

/** Todas las preguntas posibles con los datos del club. Cada una: { type, text, answer, wrong: [...], note }. */
export function triviaPool(club) {
  if (!club) return [];
  const out = [];
  const historia = club.historia ?? [];
  const titles = Object.values(club.palmares ?? {}).flat().map((t) => ({ t, name: t.replace(/\s*\d{4}(\/\d{2})?$/, ''), year: t.match(/(\d{4})(\/\d{2})?$/)?.[0] }));
  // El último año que aparece en la historia o el palmarés: ninguna opción puede ser posterior.
  const last = Math.max(...historia.flatMap((h) => String(h.anio).match(/\d{4}/g) ?? []).map(Number), ...titles.map((x) => yearOf(x.year)).filter(Number.isFinite));
  for (const h of historia) {
    out.push(q('historia', `¿En qué año pasó esto? ${quote(h.titulo)}`, h.anio, dateDistractors(h.anio, historia.map((x) => String(x.anio)), last), h.texto));
  }

  // Goleadores y presencias: sin el período en la pregunta (delataba la época) y con opciones de cifras parecidas.
  // Si dos tienen la misma cifra (Carone y Benito, 75 goles), el período vuelve para desempatar y el otro no es opción.
  const rec = club.records ?? {};
  const byCount = (list, key, verb, unit, note) => list.map((x) => {
    const tie = list.some((y) => y !== x && y[key] === x[key]);
    const others = list.filter((y) => y[key] !== x[key]);
    const near = nearest(others, (y) => y[key], x[key], x.nombre, (y) => y.nombre).map((y) => y.nombre);
    return [`¿Quién ${verb} ${x[key]} ${unit}${tie ? ` (${x.periodo})` : ''}?`, x.nombre, near, note(x)];
  });
  const goleadores = (rec.goleadores ?? []).filter((g) => !EXCLUDE.has(g.nombre));
  for (const [text, answer, near, note] of byCount(goleadores, 'goles', 'hizo', 'goles con la camiseta de Vélez', (g) => `${g.nombre}: ${g.goles} goles en ${g.partidos} partidos (${g.periodo}).`)) {
    out.push(q('goleadores', text, answer, near, note, answer));
  }
  const presencias = (rec.presencias ?? []).filter((p) => !EXCLUDE.has(p.nombre));
  for (const [text, answer, near, note] of byCount(presencias, 'partidos', 'jugó', 'partidos en Vélez', (p) => `${p.nombre}: ${p.partidos} partidos y ${p.goles} goles (${p.periodo}).`)) {
    out.push(q('presencias', text, answer, near, note, answer));
  }
  // Goleador de un torneo: las opciones son goleadores de torneos de años cercanos (no uno de 1920 para el Clausura 1995).
  // La nota suma lo que dicen los récords si también está entre los goleadores históricos (si no, no hay nota).
  const torneo = (rec.goleadoresTorneo ?? []).filter((g) => !EXCLUDE.has(g.nombre));
  for (const g of torneo) {
    const near = nearest(torneo.filter((x) => x.nombre !== g.nombre), (x) => yearOf(x.torneo), yearOf(g.torneo), g.nombre, (x) => x.nombre).map((x) => x.nombre);
    const total = goleadores.find((x) => x.nombre === g.nombre);
    const note = total ? `En total hizo ${total.goles} goles en ${total.partidos} partidos con Vélez (${total.periodo}).` : null;
    out.push(q('torneo', `¿Quién fue el goleador ${/^Primera/.test(g.torneo) ? 'de la' : 'del'} ${g.torneo} con ${g.goles} goles?`, g.nombre, near, note, g.nombre));
  }

  // Palmarés: solo los títulos cuyo nombre no se repite (preguntar «¿en qué año ganó el Clausura?» tiene varias respuestas).
  const years = titles.map((x) => x.year).filter(Boolean);
  for (const x of titles) {
    if (!x.year || titles.filter((y) => y.name === x.name).length > 1) continue;
    // «la Copa…», «la Superfinal», pero «el Nacional», «el Apertura», «el Inicial».
    const art = /^(Copa|Supercopa|Recopa|Liga|Superfinal)\b/.test(x.name) ? 'la' : 'el';
    out.push(q('palmares', `¿En qué año ganó Vélez ${art} ${x.name}?`, x.year, dateDistractors(x.year, years, last), null));
  }

  // Momentos con marcador: las opciones tienen la misma forma (con o sin penales).
  const momentos = (club.momentos ?? []).filter((m) => /^\d+-\d+/.test(m.marcador ?? ''));
  for (const m of momentos) {
    out.push(q('momentos', `¿Cómo terminó ${quote(m.titulo)} (${m.fecha})?`, m.marcador, scoreDistractors(m.marcador, momentos.map((x) => x.marcador)), m.texto));
  }

  const idolos = (club.idolos ?? []).filter((i) => !EXCLUDE.has(i.nombre));
  for (const i of idolos) {
    out.push(q('idolos', `¿De qué ídolo hablamos? «${mask(i.texto, i.nombre)}»`, i.nombre, idolos.map((x) => x.nombre), i.texto, i.nombre));
  }
  return out.filter(Boolean);
}

/**
 * La persona de una pregunta en data/jugadores.json (`players` = su lista), por nombre exacto: de ahí sale la foto
 * de Commons (con su crédito) que se muestra después de responder. null si no está.
 */
export function findPerson(players, name) {
  if (!name || !Array.isArray(players)) return null;
  return players.find((p) => p.n === name) ?? null;
}

/** Número de día (en la Argentina) de una fecha: la semilla de la trivia de ese día. */
export function dayNumber(date) {
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(date).split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 864e5);
}

// Cinco preguntas de `avail` (las saca de ahí), de tipos distintos y de personas distintas mientras se pueda (dos
// preguntas con la misma respuesta el mismo día, como Conde goleador del torneo y goleador histórico, se delatan). Van
// primero los tipos con más preguntas pendientes (con algo de azar): así los tipos chicos no se agotan antes de tiempo.
function takeDay(avail, rand, blocked) {
  const picked = [];
  const types = new Set();
  const left = new Map();
  for (const x of avail) left.set(x.type, (left.get(x.type) ?? 0) + 1);
  const weight = new Map([...left].map(([t, n]) => [t, n + rand() * 3]));
  const order = [...avail].sort((x, y) => weight.get(y.type) - weight.get(x.type));
  const ok = (x) => !blocked?.has(x.text);
  const people = new Set();
  const fresh = (x) => !x.person || !people.has(x.person);
  for (const pass of [(x) => ok(x) && fresh(x) && !types.has(x.type), (x) => ok(x) && fresh(x), ok, () => true]) {
    for (const x of order) {
      if (picked.length >= TRIVIA_SIZE) break;
      if (picked.includes(x) || !pass(x)) continue;
      picked.push(x);
      types.add(x.type);
      if (x.person) people.add(x.person);
    }
  }
  for (const x of picked) avail.splice(avail.indexOf(x), 1);
  return picked;
}

const TAIL_DAYS = 4;

/**
 * El plan de un ciclo: todas las preguntas repartidas en días de 5, sin repetir ninguna dentro del ciclo (con 72
 * preguntas, 14 días). Los últimos días del ciclo (`tail`) se sortean aparte y los primeros del ciclo siguiente no
 * usan esas preguntas: entre una aparición y la siguiente pasan siempre 5 días o más.
 */
export function triviaCycle(pool, cycle) {
  const length = Math.max(1, Math.floor(pool.length / TRIVIA_SIZE));
  const tailDays = Math.min(TAIL_DAYS, Math.floor(length / 3));
  const tailOf = (c) => {
    const rand = rng(Math.imul(c, 2654435761) ^ 0x7a11);
    const avail = shuffle(pool, rand);
    return Array.from({ length: tailDays }, () => takeDay(avail, rand));
  };
  const tail = tailOf(cycle);
  const used = new Set(tail.flat());
  const blocked = new Set(tailOf(cycle - 1).flat().map((x) => x.text));
  const rand = rng(Math.imul(cycle, 2654435761) ^ 0x4ead);
  const avail = shuffle(pool.filter((x) => !used.has(x)), rand);
  const head = Array.from({ length: length - tailDays }, (_, i) => takeDay(avail, rand, i < tailDays ? blocked : null));
  return [...head, ...tail];
}

/**
 * Las preguntas de un día: de tipos distintos mientras se pueda, con 4 opciones mezcladas, y sin repetir preguntas
 * de los días anteriores (ver `triviaCycle`). Devuelve [{ id, type, text, options, answer, note, person? }].
 */
export function dailyTrivia(club, day) {
  const pool = triviaPool(club);
  if (!pool.length) return [];
  const length = Math.max(1, Math.floor(pool.length / TRIVIA_SIZE));
  const picked = triviaCycle(pool, Math.floor(day / length))[day % length];
  const rand = rng(day * 2654435761);
  return picked.map((x, i) => ({
    id: `${day}-${i}`,
    type: x.type,
    text: x.text,
    answer: x.answer,
    note: x.note,
    ...(x.person ? { person: x.person } : {}),
    options: shuffle([x.answer, ...shuffle(x.wrong, rand).slice(0, OPTIONS - 1)], rand),
  }));
}

/** Texto para compartir el resultado, estilo Wordle: «El Fortín · Trivia 17/10 · 4/5 🟦🟦⬜🟦🟦». */
export function shareText(results, label) {
  const ok = results.filter(Boolean).length;
  return `El Fortín · Trivia ${label} · ${ok}/${results.length}\n${results.map((r) => (r ? '🟦' : '⬜')).join('')}`;
}

/** Días seguidos jugados hasta `day` (incluido si ya jugó hoy, o hasta ayer). `played` = números de día. */
export function playStreak(played, day) {
  const set = new Set(played);
  let d = set.has(day) ? day : day - 1;
  let n = 0;
  while (set.has(d)) {
    n++;
    d--;
  }
  return n;
}

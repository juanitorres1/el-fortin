// Trivia diaria: 5 preguntas por día, iguales para todos (salen de la fecha), armadas solas con lo que ya está en
// data/club.json (historia, palmarés, momentos, ídolos y récords). No hay preguntas escritas a mano: si se corrige
// un dato en club.json, la trivia lo sigue. Las opciones incorrectas salen de otros datos del mismo archivo.

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

function shuffle(list, rand) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const quote = (s) => (/^«.*»$/.test(s) ? s : `«${s}»`);
const unique = (list) => [...new Set(list.filter((x) => x != null && x !== ''))];

/** Pregunta con la respuesta y opciones incorrectas tomadas de `pool` (sin repetir ni incluir la correcta). */
function q(type, text, answer, pool, note) {
  const wrong = unique(pool).filter((x) => String(x) !== String(answer));
  return wrong.length >= 2 ? { type, text, answer: String(answer), wrong: wrong.map(String), note } : null;
}

const surname = (name) => name.split(' ').slice(-1)[0];
const mask = (text, name) => [name, surname(name)].reduce((t, n) => t.replaceAll(n, '…'), text);

/** Todas las preguntas posibles con los datos del club. Cada una: { type, text, answer, wrong: [...], note }. */
export function triviaPool(club) {
  if (!club) return [];
  const out = [];
  const historia = club.historia ?? [];
  for (const h of historia) {
    out.push(q('historia', `¿En qué año pasó esto? ${quote(h.titulo)}`, h.anio, historia.map((x) => x.anio), h.texto));
  }

  const rec = club.records ?? {};
  const goleadores = (rec.goleadores ?? []).filter((g) => !EXCLUDE.has(g.nombre));
  for (const g of goleadores) {
    out.push(q('goleadores', `¿Quién hizo ${g.goles} goles con la camiseta de Vélez (${g.periodo})?`, g.nombre, goleadores.map((x) => x.nombre), `${g.nombre}: ${g.goles} goles en ${g.partidos} partidos.`));
  }
  const presencias = (rec.presencias ?? []).filter((p) => !EXCLUDE.has(p.nombre));
  for (const p of presencias) {
    out.push(q('presencias', `¿Quién jugó ${p.partidos} partidos en Vélez (${p.periodo})?`, p.nombre, presencias.map((x) => x.nombre), `${p.nombre}: ${p.partidos} partidos y ${p.goles} goles.`));
  }
  const torneo = (rec.goleadoresTorneo ?? []).filter((g) => !EXCLUDE.has(g.nombre));
  for (const g of torneo) {
    out.push(q('torneo', `¿Quién fue el goleador del ${g.torneo} con ${g.goles} goles?`, g.nombre, torneo.map((x) => x.nombre), null));
  }

  // Palmarés: solo los títulos cuyo nombre no se repite (preguntar «¿en qué año ganó el Clausura?» tiene varias respuestas).
  const titles = Object.values(club.palmares ?? {}).flat().map((t) => ({ t, name: t.replace(/\s*\d{4}(\/\d{2})?$/, ''), year: t.match(/(\d{4})(\/\d{2})?$/)?.[0] }));
  const years = titles.map((x) => x.year);
  for (const x of titles) {
    if (!x.year || titles.filter((y) => y.name === x.name).length > 1) continue;
    out.push(q('palmares', `¿En qué año ganó Vélez la ${x.name}?`, x.year, years, `${x.t}.`));
  }

  // Momentos con marcador: el resto de los marcadores son las opciones incorrectas.
  const momentos = (club.momentos ?? []).filter((m) => /^\d+-\d+/.test(m.marcador ?? ''));
  for (const m of momentos) {
    out.push(q('momentos', `¿Cómo terminó ${quote(m.titulo)} (${m.fecha})?`, m.marcador, [...momentos.map((x) => x.marcador), '1-0', '2-1', '3-1', '1-1'], m.texto));
  }

  const idolos = (club.idolos ?? []).filter((i) => !EXCLUDE.has(i.nombre));
  for (const i of idolos) {
    out.push(q('idolos', `¿De qué ídolo hablamos? «${mask(i.texto, i.nombre)}»`, i.nombre, idolos.map((x) => x.nombre), i.texto));
  }
  return out.filter(Boolean);
}

/** Número de día (en la Argentina) de una fecha: la semilla de la trivia de ese día. */
export function dayNumber(date) {
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(date).split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 864e5);
}

/**
 * Las preguntas de un día: de tipos distintos mientras se pueda, con 4 opciones mezcladas.
 * Devuelve [{ id, type, text, options, answer, note }].
 */
export function dailyTrivia(club, day) {
  const rand = rng(day * 2654435761);
  const pool = shuffle(triviaPool(club), rand);
  const picked = [];
  const types = new Set();
  for (const x of pool) {
    if (picked.length >= TRIVIA_SIZE) break;
    if (!types.has(x.type)) {
      picked.push(x);
      types.add(x.type);
    }
  }
  for (const x of pool) {
    if (picked.length >= TRIVIA_SIZE) break;
    if (!picked.includes(x)) picked.push(x);
  }
  return picked.map((x, i) => ({
    id: `${day}-${i}`,
    type: x.type,
    text: x.text,
    answer: x.answer,
    note: x.note,
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

// Datos para la previa: rachas, historial contra el próximo rival y «un día como hoy».
// Lo usan el navegador (rachas con los resultados en vivo) y scripts/update-data.mjs (data/generated/facts.json).
import { VELEZ_ID, headToHead } from './espn.js';

const TZ = 'America/Argentina/Buenos_Aires';

/** Resultado por goles, sin penales (un partido definido por penales es empate, como en el historial). */
export function scoreResult(m) {
  const velezHome = m.home.id === VELEZ_ID;
  const v = velezHome ? m.home.score : m.away.score;
  const r = velezHome ? m.away.score : m.home.score;
  if (v == null || r == null) return null;
  return v > r ? 'G' : v < r ? 'P' : 'E';
}

const official = (m) => m.completed && m.comp !== 'Amistoso' && m.home.score != null;
const byDate = (a, b) => Date.parse(a.date) - Date.parse(b.date);

// Cuántos de los últimos partidos (del más reciente hacia atrás) cumplen `ok`, hasta el primero que no.
function runLength(results, ok) {
  let n = 0;
  for (let i = results.length - 1; i >= 0 && ok(results[i]); i--) n++;
  return n;
}

function runs(results) {
  return {
    ganando: runLength(results, (r) => r === 'G'),
    invicto: runLength(results, (r) => r !== 'P'),
    perdiendo: runLength(results, (r) => r === 'P'),
    sinGanar: runLength(results, (r) => r !== 'G'),
  };
}

// Frases de una racha; `where` se agrega al final («de local»). Solo las que llaman la atención.
function runLines(r, where = '') {
  const w = where ? ` ${where}` : '';
  const out = [];
  if (r.ganando >= 2) out.push(`Ganó los últimos ${r.ganando} partidos${w}`);
  if (r.invicto >= 3 && r.invicto > r.ganando) out.push(`Lleva ${r.invicto} partidos sin perder${w}`);
  if (r.perdiendo >= 2) out.push(`Perdió los últimos ${r.perdiendo} partidos${w}`);
  if (r.sinGanar >= 3 && r.sinGanar > r.perdiendo) out.push(`Lleva ${r.sinGanar} partidos sin ganar${w}`);
  return out;
}

/** Rachas de Vélez (todas las competiciones oficiales y de local) como frases cortas. */
export function streakLines(matches) {
  const played = matches.filter((m) => official(m) && m.date).sort(byDate);
  const all = played.map(scoreResult);
  const home = played.filter((m) => m.home.id === VELEZ_ID).map(scoreResult);
  return [...runLines(runs(all)), ...runLines(runs(home), 'de local')];
}

const when = (m) => (m.date ? new Intl.DateTimeFormat('es-AR', { timeZone: TZ, year: 'numeric' }).format(new Date(m.date)) : String(m.year));
const scoreline = (m) => {
  const velezHome = m.home.id === VELEZ_ID;
  return velezHome ? `${m.home.score}-${m.away.score}` : `${m.away.score}-${m.home.score}`;
};

/**
 * Historial contra un rival: totales, último partido, último triunfo y racha.
 * `matches` incluye los históricos sin fecha (ordenados por año) y los de ESPN.
 */
export function rivalFacts(matches, rivalId) {
  const row = headToHead(matches).find((r) => r.id === rivalId);
  if (!row) return null;
  const list = [...row.matches].reverse(); // del más viejo al más reciente
  const results = list.map(scoreResult);
  const lastWin = [...list].reverse().find((m) => scoreResult(m) === 'G');
  const last = list.at(-1);
  const r = runs(results);
  let streak = null;
  if (r.ganando >= 2) streak = `Le ganó los últimos ${r.ganando}`;
  // Si la racha abarca todos los partidos, «nunca le ganó» ya lo dice la tarjeta.
  else if (r.invicto >= 3 && r.invicto < results.length) streak = `Lleva ${r.invicto} partidos sin perderle`;
  else if (r.perdiendo >= 2) streak = `Perdió los últimos ${r.perdiendo}`;
  else if (r.sinGanar >= 3 && r.sinGanar < results.length) streak = `Lleva ${r.sinGanar} partidos sin ganarle`;
  return {
    id: row.id,
    name: row.name,
    pj: row.pj, g: row.g, e: row.e, p: row.p,
    last: last ? { year: when(last), score: scoreline(last), result: scoreResult(last) } : null,
    lastWin: lastWin ? { year: when(lastWin), score: scoreline(lastWin) } : null,
    streak,
  };
}

// ESPN marca un «local» aunque se juegue en cancha neutral (y su campo neutralSite viene en false): se deduce por
// competencia. Copas nacionales y supercopas van en cancha neutral; también las finales y, en la Copa de la Liga, las
// semifinales. Los playoffs de la Liga se juegan en la cancha del mejor ubicado (local de verdad).
const NEUTRAL_COMPS = new Set(['Copa Argentina', 'Supercopa Argentina', 'Supercopa Internacional', 'Trofeo de Campeones']);
export const isNeutral = (m) =>
  NEUTRAL_COMPS.has(m.comp) || /Final$/.test(m.round ?? '') || (m.comp === 'Copa de la Liga' && /Semifinal/.test(m.round ?? ''));

/**
 * Detalle del historial con un rival (para su página): de local y de visitante, mayor goleada y peor derrota,
 * últimos triunfos de local y de visitante. `list` = partidos contra ese rival, en cualquier orden.
 * Cada partido devuelto es { year, score, comp, where: 'local' | 'visitante' | 'neutral' }.
 */
export function rivalDetail(list) {
  const played = list.filter(official);
  // Del más viejo al más nuevo: los históricos (sin fecha) por año y antes que los de ESPN del mismo año.
  const ordered = [...played].sort((a, b) => (a.date ? Date.parse(a.date) : Date.UTC(a.year, 0, 1)) - (b.date ? Date.parse(b.date) : Date.UTC(b.year, 0, 1)));
  const where = (m) => (isNeutral(m) ? 'neutral' : m.home.id === VELEZ_ID ? 'local' : 'visitante');
  const info = (m) => (m ? { year: when(m), score: scoreline(m), comp: m.comp, where: where(m) } : null);
  const split = (w) => {
    const rs = ordered.filter((m) => where(m) === w).map(scoreResult);
    return { g: rs.filter((r) => r === 'G').length, e: rs.filter((r) => r === 'E').length, p: rs.filter((r) => r === 'P').length };
  };
  const diff = (m) => {
    const [v, r] = m.home.id === VELEZ_ID ? [m.home.score, m.away.score] : [m.away.score, m.home.score];
    return { d: v - r, v, r };
  };
  // Mayor goleada: más diferencia; si empata, más goles de Vélez; si empata, la más reciente.
  let best = null;
  let worst = null;
  for (const m of ordered) {
    const x = diff(m);
    if (x.d > 0 && (!best || x.d > best.x.d || (x.d === best.x.d && x.v >= best.x.v))) best = { m, x };
    if (x.d < 0 && (!worst || x.d < worst.x.d || (x.d === worst.x.d && x.r >= worst.x.r))) worst = { m, x };
  }
  const lastWin = (w) => [...ordered].reverse().find((m) => where(m) === w && scoreResult(m) === 'G');
  return {
    home: split('local'),
    away: split('visitante'),
    neutral: split('neutral'),
    biggestWin: info(best?.m),
    worstLoss: info(worst?.m),
    lastHomeWin: info(lastWin('local')),
    lastAwayWin: info(lastWin('visitante')),
  };
}

// ---------- Un día como hoy ----------

// ESPN llama «Liga Profesional» a toda la Primera; la LPF existe desde 2020.
const compLabel = (comp, year) => (comp === 'Liga Profesional' && year < 2020 ? 'la Primera División' : `la ${comp}`);

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** «31 de agosto de 1994» o «16/03/1924» → { md: '08-31', year: 1994 }; solo un año → null. */
export function parseDay(text) {
  const long = String(text).match(/^(\d{1,2}) de ([a-záéíóú]+) de (\d{4})$/i);
  if (long) {
    const month = MONTHS.indexOf(long[2].toLowerCase()) + 1;
    return month ? { md: `${String(month).padStart(2, '0')}-${long[1].padStart(2, '0')}`, year: Number(long[3]) } : null;
  }
  const short = String(text).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return short ? { md: `${short[2]}-${short[1]}`, year: Number(short[3]) } : null;
}

/** «MM-DD» en la Argentina. */
export const monthDay = (date) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, month: '2-digit', day: '2-digit' }).format(date);

/**
 * Efemérides de un día («MM-DD»): momentos e hitos del club (club.json) y triunfos de Vélez con fecha (desde 2001).
 * Devuelve [{ year, text }] del más viejo al más nuevo, con a lo sumo `max` partidos.
 */
export function onThisDay(md, { matches = [], club = null, max = 3 } = {}) {
  const out = [];
  for (const m of club?.momentos ?? []) {
    const d = parseDay(m.fecha);
    if (d?.md === md) out.push({ year: d.year, text: m.titulo, kind: 'momento' });
  }
  for (const h of club?.estadio?.hitos ?? []) {
    const d = parseDay(h.fecha);
    if (d?.md === md) out.push({ year: d.year, text: h.texto, kind: 'estadio' });
  }
  const momentYears = new Set(out.filter((x) => x.kind === 'momento').map((x) => x.year)); // el partido ya está contado como momento
  const wins = matches
    .filter((m) => official(m) && m.date && monthDay(new Date(m.date)) === md && scoreResult(m) === 'G')
    .filter((m) => !momentYears.has(Number(when(m))))
    .sort(byDate)
    .slice(-max)
    .map((m) => {
      const rival = m.home.id === VELEZ_ID ? m.away : m.home;
      const year = Number(when(m));
      return { year, text: `Vélez le ganó ${scoreline(m)} a ${rival.name}, por ${compLabel(m.comp, year)}`, kind: 'partido' };
    });
  return [...out, ...wins].sort((a, b) => a.year - b.year);
}

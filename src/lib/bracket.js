// Cuadro de los playoffs de la Liga (el «mapa» del reducido). ESPN da las rondas y los partidos, pero no el cuadro:
// los octavos salen de las posiciones de cada zona según PLAYOFF_SEEDS (rules.js) y cada ronda siguiente cruza a los
// ganadores de a dos. Si un partido de ESPN no encaja en ese cuadro (cambió el formato), se arma «plano»: cada ronda
// con sus partidos, sin líneas ni cruces por venir. Lógica pura: la usan la sección Cuadro y los tests.

/** 0 = por jugar, 1 = en juego, 2 = terminado. Un dato más avanzado nunca se pisa con uno más viejo. */
const progress = (m) => (m.completed ? 2 : m.status === 'in' ? 1 : 0);

/** Id del ganador de un partido terminado (por la marca de ESPN, el marcador o los penales); null si no hay. */
export function winnerId(m) {
  if (!m?.completed) return null;
  const flagged = [m.home, m.away].find((s) => s.winner);
  if (flagged) return flagged.id;
  const diff = (m.home.score ?? 0) - (m.away.score ?? 0) || (m.home.pen ?? 0) - (m.away.pen ?? 0);
  return diff > 0 ? m.home.id : diff < 0 ? m.away.id : null;
}

/**
 * Une los partidos del deploy (`base`) con los más nuevos (`fresh`: el scoreboard del día o de un día atrasado).
 * Un partido de `fresh` reemplaza al de `base` salvo que esté menos avanzado; los que no estaban se suman.
 */
export function mergePlayoffEvents(base, ...fresh) {
  const byId = new Map((base ?? []).map((m) => [m.id, m]));
  for (const m of fresh.flat().filter(Boolean)) {
    const prev = byId.get(m.id);
    if (!prev || progress(m) >= progress(prev)) byId.set(m.id, { ...m, slug: m.slug ?? prev?.slug });
  }
  return [...byId.values()].sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
}

/** Días («20261120», hora de la Argentina) con partidos que ya deberían haber terminado y no figuran terminados. */
export function staleDays(events, now, max = 3) {
  const LATE_MS = 3 * 3600_000; // un partido con alargue y penales dura menos de 3 h
  const days = (events ?? [])
    .filter((m) => !m.completed && m.status !== 'post' && Date.parse(m.date) < now - LATE_MS)
    .map((m) => new Date(Date.parse(m.date) - 3 * 3600_000).toISOString().slice(0, 10).replace(/-/g, ''));
  return [...new Set(days)].slice(-max);
}

const teamOf = (s) => ({ id: s.id, name: s.name, logo: s.logo });
const sideOf = (m, id) => (m ? [m.home, m.away].find((s) => s.id === id) ?? null : null);

/** Equipos por puesto: «A1» → fila del 1.º de la Zona A. */
export function seedMap(groups) {
  const out = new Map();
  for (const g of groups ?? []) {
    const zone = (g.name ?? '').trim().slice(-1).toUpperCase();
    for (const r of g.rows ?? []) out.set(`${zone}${r.rank}`, teamOf(r));
  }
  return out;
}

/** Un cruce: dos lados ({ team | null, seed?, cands }) con el marcador del partido, si hay. */
function makeTie(sides, match) {
  return {
    match: match ?? null,
    winner: winnerId(match),
    sides: sides.map((s) => {
      const x = s.team ? sideOf(match, s.team.id) : null;
      return { ...s, score: x?.score ?? null, pen: x?.pen ?? null };
    }),
  };
}

/** Lo que pasa a la ronda siguiente desde un cruce: el ganador o, si no hay, los candidatos. */
function advance(tie) {
  const w = tie.sides.find((s) => s.team && s.team.id === tie.winner);
  return w ? { team: w.team, cands: [] } : { team: null, cands: tie.sides.flatMap((s) => (s.team ? [s.team] : s.cands)) };
}

function buildTree(groups, rounds, events, seeds) {
  if (!seeds?.length || rounds.length !== Math.log2(seeds.length) + 1) return null;
  const bySeed = seedMap(groups);
  let pairs = seeds.map((pair) => pair.map((code) => (bySeed.has(code) ? { team: bySeed.get(code), seed: code, cands: [] } : null)));
  if (pairs.flat().some((s) => !s)) return null;
  const out = [];
  for (const round of rounds) {
    const evs = events.filter((m) => m.slug === round.slug);
    const used = new Set();
    const ties = pairs.map((pair) => {
      const known = pair.filter((s) => s.team).map((s) => s.team.id);
      const allowed = new Set(pair.flatMap((s) => (s.team ? [s.team.id] : s.cands.map((c) => c.id))));
      const match = evs.find((m) => !used.has(m.id) && allowed.has(m.home.id) && allowed.has(m.away.id) && known.every((id) => sideOf(m, id)));
      if (!match) return makeTie(pair, null);
      used.add(match.id);
      // Un lado sin definir en el cuadro (el resultado anterior todavía no llegó) se completa con el partido.
      const fill = (s, i) => {
        if (s.team) return s;
        const team = [match.home, match.away].find((x) => !known.includes(x.id) && s.cands.some((c) => c.id === x.id));
        return team ? { ...s, team: teamOf(team) } : pair[i];
      };
      return makeTie(pair.map(fill), match);
    });
    if (evs.some((m) => !used.has(m.id))) return null; // un partido que no encaja: el cuadro no es este
    out.push({ ...round, ties });
    pairs = [];
    for (let i = 0; i < ties.length; i += 2) pairs.push([advance(ties[i]), advance(ties[i + 1] ?? { sides: [], winner: null })]);
  }
  return out;
}

/**
 * El cuadro. `groups` = zonas de la fase regular (con `rank`), `rounds` = rondas de ESPN (playoffRounds), `events` =
 * partidos de playoffs con `slug`, `seeds` = PLAYOFF_SEEDS (null si las reglas no valen para esta temporada).
 * Devuelve { tree, rounds: [{ ...ronda, ties: [{ sides: [{ team, seed, cands, score, pen }] ×2, match, winner }] }] }.
 * Con `tree` false, cada ronda tiene solo los partidos que ESPN ya publicó.
 */
export function buildBracket({ groups, rounds, events, seeds }) {
  const tree = buildTree(groups, rounds ?? [], events ?? [], seeds);
  if (tree) return { tree: true, rounds: tree };
  return {
    tree: false,
    rounds: (rounds ?? []).map((r) => ({
      ...r,
      ties: (events ?? []).filter((m) => m.slug === r.slug).map((m) => makeTie([{ team: teamOf(m.home), cands: [] }, { team: teamOf(m.away), cands: [] }], m)),
    })),
  };
}

/** La primera ronda que todavía tiene cruces sin terminar (la «actual»); la última si ya terminó todo. */
export function currentRound(bracket) {
  const i = bracket.rounds.findIndex((r) => !r.ties.length || r.ties.some((t) => !t.winner));
  return i < 0 ? bracket.rounds.length - 1 : i;
}

/**
 * Dónde está un equipo en el cuadro: { state: 'champion' | 'out' | 'through' | 'live' | 'next', round, tie, me, rival, next }.
 * `next` = { round, other } (con quién se cruzaría si pasa: un lado con `team` o con `cands`). null si no está.
 */
export function teamPath(bracket, id) {
  let at = null;
  bracket.rounds.forEach((round, ri) => round.ties.forEach((tie, ti) => {
    if (tie.sides.some((s) => s.team?.id === id)) at = { round, ri, tie, ti };
  }));
  if (!at) return null;
  const { round, ri, tie, ti } = at;
  const me = tie.sides.find((s) => s.team?.id === id);
  const rival = tie.sides.find((s) => s !== me);
  const last = ri === bracket.rounds.length - 1;
  if (tie.winner === id && last) return { state: 'champion', round, tie, me, rival, next: null };
  if (tie.winner && tie.winner !== id) return { state: 'out', round, tie, me, rival, next: null };
  // Ganó y la ronda siguiente todavía no está publicada (solo pasa en el cuadro plano).
  if (tie.winner === id) return { state: 'through', round, tie, me, rival, next: null };
  const nextRound = bracket.rounds[ri + 1];
  const next = bracket.tree && nextRound && !tie.winner ? { round: nextRound, other: nextRound.ties[ti >> 1]?.sides[1 - (ti % 2)] ?? null } : null;
  return { state: tie.match?.status === 'in' ? 'live' : 'next', round, tie, me, rival, next };
}

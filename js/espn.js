// Cliente y normalizador de la API pública (no oficial) de ESPN.
// Lo usan el navegador (datos en vivo) y scripts/update-data.mjs (snapshot + historial).

export const VELEZ_ID = '21';
const SITE = 'https://site.api.espn.com/apis/site/v2/sports/soccer';
const STANDINGS = 'https://site.api.espn.com/apis/v2/sports/soccer';

const COMP_NAMES = {
  'arg.1': 'Liga Profesional',
  'arg.copa': 'Copa Argentina',
  'conmebol.libertadores': 'Copa Libertadores',
  'conmebol.sudamericana': 'Copa Sudamericana',
  'conmebol.recopa': 'Recopa Sudamericana',
};

const TEAM_NAMES = {
  'Vélez Sarsfield': 'Vélez',
  'Central Córdoba (Santiago del Estero)': 'Central Córdoba (SdE)',
  'Belgrano (Córdoba)': 'Belgrano',
  'Talleres (Córdoba)': 'Talleres',
  'Instituto (Córdoba)': 'Instituto',
  'Unión (Santa Fe)': 'Unión',
  'Sarmiento (Junín)': 'Sarmiento',
};

export const teamName = (name) => TEAM_NAMES[name] ?? name;
export const teamLogo = (id) => `https://a.espncdn.com/i/teamlogos/soccer/500/${id}.png`;

async function getJson(url, fetchImpl = fetch) {
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`ESPN ${res.status} en ${url}`);
  return res.json();
}

function compName(league) {
  if (!league) return 'Otro';
  if (COMP_NAMES[league.slug]) return COMP_NAMES[league.slug];
  if (/copa de la (superliga|liga)/i.test(league.name)) return 'Copa de la Liga';
  if (/supercopa internacional/i.test(league.name)) return 'Supercopa Internacional';
  if (/supercopa/i.test(league.name)) return 'Supercopa Argentina';
  if (/friendly/i.test(league.name)) return 'Amistoso';
  return league.name.replace(/^Argentine /, '');
}

function normalizeSide(c) {
  const score = c.score && typeof c.score === 'object' ? c.score.displayValue : c.score;
  return {
    id: String(c.team.id),
    name: teamName(c.team.displayName),
    logo: c.team.logos?.[0]?.href ?? c.team.logo ?? teamLogo(c.team.id),
    score: score == null || score === '' ? null : Number(score),
    pen: c.shootoutScore != null ? Number(c.shootoutScore) : null,
    winner: c.winner === true,
  };
}

export function normalizeEvent(e) {
  const c = e.competitions[0];
  const home = c.competitors.find((x) => x.homeAway === 'home') ?? c.competitors[0];
  const away = c.competitors.find((x) => x.homeAway === 'away') ?? c.competitors[1];
  const st = c.status?.type ?? {};
  return {
    id: String(e.id),
    date: e.date,
    timeValid: e.timeValid !== false,
    comp: compName(e.league),
    compSlug: e.league?.slug ?? null,
    round: e.seasonType?.name ?? null,
    status: st.state ?? 'pre', // pre | in | post
    completed: Boolean(st.completed),
    detail: st.shortDetail ?? '',
    clock: c.status?.displayClock ?? null,
    venue: c.venue?.fullName ?? null,
    home: normalizeSide(home),
    away: normalizeSide(away),
  };
}

export function normalizeStandings(json) {
  const groups = json.children?.length ? json.children : [json];
  return groups.map((g) => ({
    name: (g.name ?? '').replace(/^Group /, 'Zona '),
    rows: (g.standings?.entries ?? [])
      .map((entry) => {
        const s = Object.fromEntries(entry.stats.map((x) => [x.name, x.value ?? Number(x.displayValue)]));
        return {
          id: String(entry.team.id),
          name: teamName(entry.team.displayName),
          logo: entry.team.logos?.[0]?.href ?? teamLogo(entry.team.id),
          rank: s.rank,
          pj: s.gamesPlayed,
          g: s.wins,
          e: s.ties,
          p: s.losses,
          gf: s.pointsFor,
          gc: s.pointsAgainst,
          dg: s.pointDifferential,
          pts: s.points,
        };
      })
      .sort((a, b) => a.rank - b.rank),
  }));
}

// Los partidos históricos (data/historico.json) no tienen fecha, solo año: se ordenan por año y,
// dentro del año, mantienen el orden del dataset (sort estable).
const sortTime = (m) => (m.date ? Date.parse(m.date) : Date.UTC(m.year, 0, 1));
const byDate = (a, b) => sortTime(a) - sortTime(b);

export async function fetchSchedule({ season, fixture = false } = {}, fetchImpl) {
  const qs = new URLSearchParams();
  if (season) qs.set('season', season);
  if (fixture) qs.set('fixture', 'true');
  const json = await getJson(`${SITE}/all/teams/${VELEZ_ID}/schedule?${qs}`, fetchImpl);
  return (json.events ?? []).map(normalizeEvent).sort(byDate);
}

/**
 * Tabla anual: suma de las fases regulares (Apertura + Clausura) de la temporada, sin playoffs.
 * Desempate: puntos, diferencia de gol, goles a favor (el reglamento tiene más criterios; ESPN no los expone).
 */
export function annualTable(phases) {
  const byTeam = new Map();
  for (const groups of phases) {
    for (const r of groups.flatMap((g) => g.rows)) {
      const acc = byTeam.get(r.id) ?? { id: r.id, name: r.name, logo: r.logo, pj: 0, g: 0, e: 0, p: 0, gf: 0, gc: 0, dg: 0, pts: 0 };
      for (const k of ['pj', 'g', 'e', 'p', 'gf', 'gc', 'dg', 'pts']) acc[k] += r[k] ?? 0;
      byTeam.set(r.id, acc);
    }
  }
  return [...byTeam.values()]
    .sort((a, b) => b.pts - a.pts || b.dg - a.dg || b.gf - a.gf || a.name.localeCompare(b.name))
    .map((r, i) => ({ ...r, rank: i + 1 }));
}

export async function fetchStandings(fetchImpl) {
  const json = await getJson(`${STANDINGS}/arg.1/standings`, fetchImpl);
  const season = json.seasons?.[0];
  const now = Date.now();
  const phases = (season?.types ?? []).filter((t) => t.hasStandings && new Date(t.startDate) <= now);
  const phaseTables = await Promise.all(
    phases.map((t) => getJson(`${STANDINGS}/arg.1/standings?season=${season.year}&seasontype=${t.id}`, fetchImpl).then(normalizeStandings)),
  );
  return {
    name: json.name ?? 'Liga Profesional',
    season: season?.displayName ?? null,
    phase: phases.at(-1)?.name ?? null,
    groups: normalizeStandings(json),
    annual: phaseTables.length ? { phases: phases.map((t) => t.name), rows: annualTable(phaseTables) } : null,
  };
}

/** Lo que cambia día a día: próximos partidos, resultados de la temporada y la tabla. */
export async function fetchLive(fetchImpl) {
  const [fixture, results, standings] = await Promise.all([
    fetchSchedule({ fixture: true }, fetchImpl),
    fetchSchedule({}, fetchImpl),
    fetchStandings(fetchImpl),
  ]);
  return { updatedAt: new Date().toISOString(), fixture, results: results.filter((m) => m.completed), standings };
}

// ---------- Cálculos desde la óptica de Vélez ----------

export function velezView(m) {
  const velezHome = m.home.id === VELEZ_ID;
  const v = velezHome ? m.home : m.away;
  const rival = velezHome ? m.away : m.home;
  let result = null;
  if (m.completed && v.score != null && rival.score != null) {
    if (v.score !== rival.score) result = v.score > rival.score ? 'G' : 'P';
    else if (v.pen != null && rival.pen != null && v.pen !== rival.pen) result = v.pen > rival.pen ? 'G' : 'P';
    else if (v.winner !== rival.winner) result = v.winner ? 'G' : 'P'; // definido por penales
    else result = 'E';
  }
  return { velezHome, velez: v, rival, result };
}

/**
 * Agrupa partidos terminados por rival. Un partido definido por penales cuenta como empate
 * en el historial (criterio estadístico habitual), pero guarda el detalle de los penales.
 */
export function headToHead(matches) {
  const table = new Map();
  for (const m of matches) {
    if (!m.completed || m.home.score == null || m.comp === 'Amistoso') continue;
    const { velez, rival } = velezView(m);
    const row = table.get(rival.id) ?? { id: rival.id, name: rival.name, logo: rival.logo, pj: 0, g: 0, e: 0, p: 0, gf: 0, gc: 0, matches: [] };
    row.name = rival.name; // nos quedamos con el nombre más reciente
    row.logo = rival.logo ?? row.logo;
    row.pj += 1;
    row.gf += velez.score;
    row.gc += rival.score;
    if (velez.score > rival.score) row.g += 1;
    else if (velez.score < rival.score) row.p += 1;
    else row.e += 1;
    row.matches.push(m);
    table.set(rival.id, row);
  }
  for (const row of table.values()) row.matches.sort(byDate).reverse();
  return [...table.values()].sort((a, b) => b.pj - a.pj || a.name.localeCompare(b.name));
}

// ---------- Plantel y estadísticas de jugadores ----------

const POS = { G: 'Arquero', D: 'Defensor', M: 'Mediocampista', F: 'Delantero' };

export function normalizeRoster(json) {
  const coach = json.coach?.[0];
  return {
    coach: coach ? `${coach.firstName} ${coach.lastName}`.trim() : null,
    players: (json.athletes ?? []).map((a) => ({
      id: String(a.id),
      name: a.displayName,
      jersey: a.jersey ?? null,
      pos: a.position?.abbreviation ?? null,
      posName: POS[a.position?.abbreviation] ?? a.position?.displayName ?? '',
      age: a.age ?? null,
      nat: a.citizenship ?? null,
      flag: a.flag?.href ?? null,
      // ESPN informa lesiones de forma irregular: guardamos lo que venga, sin inventar detalle.
      injuries: (a.injuries ?? []).map((i) => ({
        status: i.status ?? i.type?.description ?? 'Lesionado',
        detail: i.details?.type ?? i.longComment ?? i.shortComment ?? null,
        returnDate: i.details?.returnDate ?? null,
      })),
    })),
  };
}

export async function fetchRoster(fetchImpl) {
  return normalizeRoster(await getJson(`${SITE}/arg.1/teams/${VELEZ_ID}/roster`, fetchImpl));
}

export async function fetchSummary(match, fetchImpl) {
  return getJson(`${SITE}/${match.compSlug ?? 'all'}/summary?event=${match.id}`, fetchImpl);
}

/** Torneo al que pertenece un partido: Apertura/Clausura por separado, copas por nombre. */
export function tournamentOf(m) {
  const year = new Date(m.date).getUTCFullYear();
  if (m.comp === 'Liga Profesional') {
    const phase = m.round?.match(/Apertura|Clausura/)?.[0] ?? 'Liga';
    return { key: `${phase}-${year}`, label: `${phase} ${year}`, league: true, playoff: !/^Torneo /.test(m.round ?? 'Torneo ') };
  }
  return { key: `${m.comp}-${year}`, label: `${m.comp} ${year}`, league: false, playoff: false };
}

const STAT_KEYS = {
  totalGoals: 'g', goalAssists: 'a', yellowCards: 'am', redCards: 'r', totalShots: 'rem',
  shotsOnTarget: 'arco', saves: 'ataj', goalsConceded: 'gc', foulsCommitted: 'fc', foulsSuffered: 'fr',
};

/** Jugadores de Vélez que entraron a la cancha en un partido (desde /summary). */
export function playersFromSummary(summary) {
  const team = summary.rosters?.find((r) => String(r.team?.id) === VELEZ_ID);
  return (team?.roster ?? [])
    .map((p) => {
      const stats = Object.fromEntries((p.stats ?? []).map((s) => [s.name, s.value ?? 0]));
      return {
        id: String(p.athlete.id),
        name: p.athlete.displayName,
        starter: Boolean(p.starter),
        played: Boolean(p.starter || p.subbedIn || stats.appearances),
        stats: Object.fromEntries(Object.entries(STAT_KEYS).map(([k, short]) => [short, stats[k] ?? 0])),
      };
    })
    .filter((p) => p.played);
}

/**
 * Suma estadísticas por torneo. `games` = [{ match, players }] en orden cronológico.
 * Devuelve [{ key, label, matches, players: [{ id, name, pj, tit, g, a, am, r, ... }] }].
 */
export function aggregateStats(games) {
  const byTournament = new Map();
  for (const { match, players } of games) {
    const t = tournamentOf(match);
    const entry = byTournament.get(t.key) ?? { key: t.key, label: t.label, matches: 0, lastDate: null, players: new Map() };
    entry.matches += 1;
    entry.lastDate = match.date;
    for (const p of players) {
      const acc = entry.players.get(p.id) ?? { id: p.id, name: p.name, pj: 0, tit: 0, ...Object.fromEntries(Object.values(STAT_KEYS).map((k) => [k, 0])) };
      acc.pj += 1;
      acc.tit += p.starter ? 1 : 0;
      for (const k of Object.values(STAT_KEYS)) acc[k] += p.stats[k] ?? 0;
      entry.players.set(p.id, acc);
    }
    byTournament.set(t.key, entry);
  }
  return [...byTournament.values()]
    .sort((a, b) => Date.parse(b.lastDate) - Date.parse(a.lastDate)) // el torneo más reciente primero
    .map((t) => ({ ...t, players: [...t.players.values()].sort((a, b) => b.g - a.g || b.a - a.a || b.pj - a.pj) }));
}

/**
 * Sanciones probables para el próximo partido de cada torneo en curso.
 * Reglamento LPF: cada 5 amarillas en un mismo torneo (Apertura o Clausura) = 1 fecha; se limpian antes de
 * los playoffs. Las amarillas de un partido con roja (doble amarilla) no suman al ciclo.
 * Es una estimación: la sanción real la define el Tribunal de Disciplina.
 * `games` en orden cronológico; `activeKeys` = torneos con partidos por jugar.
 */
export function discipline(games, activeKeys) {
  const out = [];
  const byTournament = new Map();
  for (const g of games) {
    const t = tournamentOf(g.match);
    if (!activeKeys.has(t.key)) continue;
    byTournament.set(t.key, [...(byTournament.get(t.key) ?? []), { ...g, t }]);
  }
  for (const [, list] of byTournament) {
    const last = list.at(-1);
    const yellows = new Map();
    if (last.t.league) {
      for (const g of list.filter((x) => !x.t.playoff)) {
        for (const p of g.players) {
          if (p.stats.r > 0 || !p.stats.am) continue;
          const y = yellows.get(p.id) ?? { name: p.name, count: 0, lastMatch: null };
          y.count += p.stats.am;
          y.lastMatch = g.match.id;
          yellows.set(p.id, y);
        }
      }
    }
    for (const p of last.players) {
      if (p.stats.r > 0) out.push({ id: p.id, name: p.name, tournament: last.t.label, kind: 'roja', text: 'Expulsado en el último partido' });
    }
    for (const [id, y] of yellows) {
      if (out.some((o) => o.id === id && o.tournament === last.t.label)) continue;
      if (y.count % 5 === 0 && y.lastMatch === last.match.id) {
        out.push({ id, name: y.name, tournament: last.t.label, kind: 'amarillas', yellows: y.count, text: `Llegó a ${y.count} amarillas` });
      } else if (y.count % 5 === 4 && !last.t.playoff) {
        out.push({ id, name: y.name, tournament: last.t.label, kind: 'limite', yellows: y.count, text: `${y.count} amarillas: una más y se pierde una fecha` });
      }
    }
  }
  return out;
}

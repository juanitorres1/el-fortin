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
    city: c.venue?.address?.city ?? null, // para el pronóstico del tiempo
    country: c.venue?.address?.country ?? null,
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
    phaseKey: phases.length ? phaseKey('arg.1', season.year, phases.at(-1).id) : null, // para reemplazar esta fase en los promedios
    phaseEnd: phases.at(-1)?.endDate ?? null, // fin de la fase regular: hasta ahí se piden los partidos que quedan
    year: season?.year ?? null,
    groups: normalizeStandings(json),
    annual: phaseTables.length ? { phases: phases.map((t) => t.name), rows: annualTable(phaseTables) } : null,
  };
}

// ---------- Promedios ----------

const phaseKey = (league, season, type) => `${league}-${season}${type ? `-${type}` : ''}`;
// Torneos fuera de arg.1 en ESPN que cuentan para los promedios (fase de grupos, sin playoffs).
const EXTRA_AVERAGE_PHASES = { 2024: ['arg.copa_lpf'] }; // Copa de la Liga 2024

/**
 * Tablas de cada fase regular de las últimas 3 temporadas (la actual y las 2 anteriores), que es lo que cuenta para
 * los promedios: puntos / partidos jugados en esas temporadas, sin playoffs. Validado contra Promiedos en oct-2026
 * (coinciden los 30 equipos en puntos, partidos y promedio).
 */
export async function fetchAverageParts(year, fetchImpl) {
  const parts = [];
  for (const season of [year - 2, year - 1, year]) {
    for (const league of EXTRA_AVERAGE_PHASES[season] ?? []) {
      parts.push({ key: phaseKey(league, season), season, groups: normalizeStandings(await getJson(`${STANDINGS}/${league}/standings?season=${season}`, fetchImpl)) });
    }
    const json = await getJson(`${STANDINGS}/arg.1/standings?season=${season}`, fetchImpl);
    const types = (json.seasons?.find((s) => s.year === season)?.types ?? []).filter((t) => t.hasStandings && new Date(t.startDate) <= Date.now());
    for (const t of types) {
      const groups = normalizeStandings(await getJson(`${STANDINGS}/arg.1/standings?season=${season}&seasontype=${t.id}`, fetchImpl));
      parts.push({ key: phaseKey('arg.1', season, t.id), season, groups });
    }
  }
  return parts;
}

/**
 * Tabla de promedios. `parts` = [{ key, season, groups }]; `currentIds` = equipos que juegan la temporada actual
 * (los que descendieron no figuran; los ascendidos dividen solo por los partidos que jugaron en Primera).
 * Empate en el promedio: orden alfabético (en la zona de descenso el reglamento pide un partido de desempate).
 */
export function averagesTable(parts, currentIds) {
  const seasons = [...new Set(parts.map((p) => p.season))].sort();
  const byTeam = new Map();
  for (const p of parts) {
    for (const r of p.groups.flatMap((g) => g.rows)) {
      const acc = byTeam.get(r.id) ?? { id: r.id, name: r.name, logo: r.logo, pts: 0, pj: 0, bySeason: {} };
      acc.name = r.name ?? acc.name;
      acc.logo = r.logo ?? acc.logo;
      acc.pts += r.pts ?? 0;
      acc.pj += r.pj ?? 0;
      acc.bySeason[p.season] = (acc.bySeason[p.season] ?? 0) + (r.pts ?? 0);
      byTeam.set(r.id, acc);
    }
  }
  const rows = [...byTeam.values()]
    .filter((r) => currentIds.has(r.id) && r.pj > 0)
    .map((r) => ({ ...r, prom: r.pts / r.pj }))
    .sort((a, b) => b.prom - a.prom || a.name.localeCompare(b.name, 'es'))
    .map((r, i) => ({ ...r, rank: i + 1 }));
  return { seasons, rows };
}

/**
 * Quiénes descenderían hoy (reglamento 2026): el último de los promedios y el último de la tabla anual; si es el mismo
 * equipo, el segundo descenso es para el anteúltimo de la anual. Devuelve { promedios: id, anual: id }.
 */
export function relegation(averageRows, annualRows) {
  const promedios = averageRows.at(-1)?.id ?? null;
  const anual = [...annualRows].reverse().find((r) => r.id !== promedios)?.id ?? null;
  return { promedios, anual };
}

/**
 * Partidos de la fase regular en curso que todavía no se jugaron, de todos los equipos (para «Camino a los playoffs»).
 * El scoreboard de ESPN no acepta rangos de fechas largos: se pide mes por mes hasta el fin de la fase.
 */
export async function fetchPhaseRemaining(standings, fetchImpl, now = new Date()) {
  const slug = (standings.phase ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '-');
  const end = standings.phaseEnd ? new Date(standings.phaseEnd) : new Date(now.getFullYear(), now.getMonth() + 1, 28);
  const months = [];
  for (let d = new Date(now.getFullYear(), now.getMonth(), 1); d <= end && months.length < 6; d.setMonth(d.getMonth() + 1)) {
    months.push(`${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  const lists = await Promise.all(months.map((m) => getJson(`${SITE}/arg.1/scoreboard?dates=${m}`, fetchImpl)));
  return lists
    .flatMap((json) => json.events ?? [])
    .filter((ev) => ev.season?.slug === slug)
    .map(normalizeEvent)
    .filter((m) => !m.completed);
}

// ---------- Goleadores del torneo ----------

/** Top 10 de goleadores (ESPN solo da los 10 primeros): [{ id, name, goals, pj, team: { id, name, logo } }]. */
export function normalizeScorers(json) {
  const cat = json.leaders?.categories?.find((c) => c.name === 'goalsLeaders');
  return (cat?.leaders ?? []).map((l) => ({
    id: String(l.athlete?.id ?? ''),
    name: l.athlete?.displayName ?? '',
    goals: Number(l.value ?? 0),
    pj: Number(String(l.displayValue ?? '').match(/Matches: (\d+)/)?.[1] ?? NaN) || null,
    team: l.team ? { id: String(l.team.id), name: teamName(l.team.displayName), logo: l.team.logos?.[0]?.href ?? teamLogo(l.team.id) } : null,
  }));
}

/** Goleadores de la fase en curso (Apertura o Clausura). `standings` = fetchStandings(). */
export async function fetchScorers(standings, fetchImpl) {
  const type = standings.phaseKey?.split('-').at(-1);
  // Sin la fase exacta ESPN devuelve otra (por ejemplo, los octavos del Apertura): mejor no mostrar nada.
  if (!standings.year || !type) return [];
  return normalizeScorers(await getJson(`https://site.api.espn.com/apis/site/v3/sports/soccer/arg.1/leaders?season=${standings.year}&seasontype=${type}`, fetchImpl));
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

/**
 * Minuto a minuto: los eventos importantes del partido (goles, tarjetas, cambios, penales), del más nuevo al más viejo.
 * ESPN manda el texto en inglés: se arma en castellano con el tipo de evento y los jugadores.
 * En un gol en contra, `team` es el equipo beneficiado (como lo informa ESPN).
 */
export function keyEvents(summary) {
  const teams = Object.fromEntries((summary.header?.competitions?.[0]?.competitors ?? []).map((c) => [String(c.team.id), teamName(c.team.displayName)]));
  const out = [];
  for (const e of summary.keyEvents ?? []) {
    const type = e.type?.type ?? '';
    const [p0, p1] = (e.participants ?? []).map((p) => p.athlete?.displayName);
    let kind = null;
    let text = null;
    if (type === 'own-goal') [kind, text] = ['gol', `Gol en contra de ${p0}`];
    else if (type === 'penalty---scored') [kind, text] = ['gol', `Gol de penal de ${p0}`];
    else if (type.startsWith('goal')) [kind, text] = ['gol', `Gol de ${p0}${p1 ? ` (asistencia de ${p1})` : ''}`];
    else if (type === 'yellow-card') [kind, text] = ['amarilla', `Amarilla para ${p0}`];
    else if (type === 'red-card') [kind, text] = ['roja', `Roja para ${p0}`];
    else if (type === 'substitution') [kind, text] = ['cambio', p1 ? `Entra ${p0} por ${p1}` : `Entra ${p0}`];
    else if (type === 'penalty---missed') [kind, text] = ['penal', `${p0} erró un penal`];
    else if (type === 'penalty---saved') [kind, text] = ['penal', `Le atajaron un penal a ${p0}`];
    else if (type === 'halftime') [kind, text] = ['pausa', 'Entretiempo'];
    else if (type === 'end-regular-time') [kind, text] = ['pausa', 'Fin del tiempo reglamentario'];
    if (!kind || (kind !== 'pausa' && !p0)) continue;
    if (e.shootout) text = `Penales: ${text.replace('Gol de ', 'convirtió ')}`;
    const teamId = e.team?.id != null ? String(e.team.id) : null;
    out.push({ id: String(e.id), minute: e.clock?.displayValue || '', kind, text, team: teamId && teams[teamId] ? teams[teamId] : null, velez: teamId === VELEZ_ID });
  }
  return out.reverse();
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

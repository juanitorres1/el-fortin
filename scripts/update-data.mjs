// Genera public/data/generated/{snapshot,matches,players}.json desde ESPN.
// - snapshot.json: respaldo de fixture/resultados/tabla por si la API no responde desde el navegador.
// - matches.json: todos los partidos oficiales de Vélez que ESPN tiene (desde 2001) para el historial.
// - news.json: titulares de la semana de velez.com.ar (sin IA). El resumen semanal con IA lo genera
//   .github/workflows/news-summary.yml y el deploy lo baja como artifact.
// - promedios.json: tablas de las fases que cuentan para los promedios (últimas 3 temporadas).
// - facts.json: datos para la previa del Inicio (rachas, historial con el próximo rival, un día como hoy).
// - escudos.json: ids de ESPN para los equipos del historial 1931–2000 que no los tienen (escudo y unión con sus
//   partidos desde 2001; ver src/lib/crests.js).
// - velez.ics: calendario de partidos para suscribirse (Google, Apple, Outlook).
// - players.json: estadísticas de jugadores por torneo del año y sanciones probables (desde el detalle de cada partido).
// - games.json: partido por partido del año con quién jugó y los goles con su minuto (página de cada jugador,
//   «Adiviná el once» y «Vélez en cifras»).
// - asistencias.json: asistidores de la fase en curso (desde el detalle de cada partido; lo ya leído queda en
//   cache/asistencias.json, que el deploy conserva entre corridas).
// Uso: node scripts/update-data.mjs
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { buildCalendar } from './ics.mjs';
import { writeHeadlines } from './news.mjs';
import { monthDay, onThisDay, rivalFacts } from '../src/lib/facts.js';
import { linkTeams, relinkMatch } from '../src/lib/crests.js';
import { VELEZ_ID, aggregateStats, discipline, gamesLog, fetchAverageParts, fetchLive, fetchPhaseEvents, fetchRoster, fetchSchedule, fetchSummary, fetchTeams, goalEvents, leaderboard, playersFromSummary, summaryAssists, tournamentOf } from '../src/lib/espn.js';

const OUT = new URL('../public/data/generated/', import.meta.url);
const FIRST_SEASON = 2000; // ESPN no tiene datos de Vélez anteriores a 2001

async function withRetry(fn, tries = 3) {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i >= tries) throw err;
      await new Promise((r) => setTimeout(r, 1000 * i));
    }
  }
}

async function main() {
  await mkdir(OUT, { recursive: true });

  const live = await withRetry(() => fetchLive());
  live.roster = await withRetry(() => fetchRoster());
  await writeFile(new URL('snapshot.json', OUT), JSON.stringify(live));
  console.log(`snapshot: ${live.fixture.length} próximos, ${live.results.length} resultados, ${live.standings.groups.length} zonas, ${live.roster.players.length} jugadores`);

  // Promedios: fases regulares de las últimas 3 temporadas. El navegador reemplaza la fase en curso por la tabla en vivo.
  const parts = await withRetry(() => fetchAverageParts(live.standings.year ?? new Date().getFullYear()));
  const slimParts = parts.map((p) => ({ ...p, groups: p.groups.map((g) => ({ rows: g.rows.map((r) => ({ id: r.id, name: r.name, pts: r.pts, pj: r.pj })) })) }));
  await writeFile(new URL('promedios.json', OUT), JSON.stringify({ updatedAt: new Date().toISOString(), parts: slimParts }));
  console.log(`promedios: ${parts.map((p) => p.key).join(', ')}`);

  // Calendario para suscribirse: partidos de este año (jugados, con resultado) y los que vienen.
  const year = new Date().getFullYear();
  const calendar = [...live.results.filter((m) => new Date(m.date).getFullYear() >= year), ...live.fixture];
  await writeFile(new URL('velez.ics', OUT), buildCalendar(calendar));
  console.log(`calendario: ${calendar.length} partidos`);

  await writePlayers(live);

  // Asistidores del torneo. Si falla, la sección muestra solo los goleadores: no frena el deploy.
  try {
    const assists = await writeAssists(live.standings);
    console.log(`asistencias: ${assists.read} partidos leídos ahora, ${assists.cached} del caché; líder: ${assists.top ?? '—'}`);
  } catch (err) {
    console.warn('No se pudieron armar las asistencias:', err.message);
  }

  // Titulares de la web oficial (sin IA). Si falla, la página oculta la lista: no frena el deploy.
  try {
    const headlines = await writeHeadlines();
    console.log(`titulares: ${headlines.length} notas de la semana`);
  } catch (err) {
    console.warn('No se pudieron leer los titulares de velez.com.ar:', err.message);
  }

  const byId = new Map();
  const lastSeason = new Date().getFullYear();
  for (let season = FIRST_SEASON; season <= lastSeason; season++) {
    const events = await withRetry(() => fetchSchedule({ season }));
    for (const m of events) if (m.completed) byId.set(m.id, m);
    console.log(`temporada ${season}: ${events.length} partidos`);
  }
  for (const m of live.results) byId.set(m.id, m);

  // El historial no necesita escudos repetidos en cada partido: los guarda headToHead por rival.
  const matches = [...byId.values()].sort((a, b) => new Date(a.date) - new Date(b.date));
  await writeFile(new URL('matches.json', OUT), JSON.stringify({ updatedAt: new Date().toISOString(), matches }));
  console.log(`historial: ${matches.length} partidos (${matches[0]?.date.slice(0, 10)} → ${matches.at(-1)?.date.slice(0, 10)})`);

  const crestIds = await writeCrests(matches);
  await writeFacts(matches, live, crestIds);
}

// Ligas de ESPN donde buscar a los equipos del historial viejo (de Primera a la Primera C y la Copa Argentina).
const TEAM_LEAGUES = ['arg.1', 'arg.2', 'arg.3', 'arg.4', 'arg.5', 'arg.copa'];
async function writeCrests(matches) {
  const historic = JSON.parse(await readFile(new URL('../public/data/historico.json', import.meta.url), 'utf8')).matches;
  const unlinked = new Map();
  for (const m of historic) for (const t of [m.home, m.away]) if (!/^\d+$/.test(t.id)) unlinked.set(t.id, t.name);
  const espn = matches.flatMap((m) => [m.home, m.away]).map((t) => ({ id: t.id, names: [t.name] }));
  for (const league of TEAM_LEAGUES) {
    try {
      espn.push(...(await withRetry(() => fetchTeams(league))));
    } catch (err) {
      console.warn(`escudos: no se pudo leer ${league}:`, err.message);
    }
  }
  const { ids, missing } = linkTeams([...unlinked].map(([id, name]) => ({ id, name })), espn);
  await writeFile(new URL('escudos.json', OUT), JSON.stringify({ updatedAt: new Date().toISOString(), ids }));
  console.log(`escudos: ${Object.keys(ids).length} de ${unlinked.size} equipos del historial viejo unidos con ESPN; sin escudo: ${missing.join(', ') || 'ninguno'}`);
  return ids;
}

// Datos para la previa del Inicio: lo justo para no bajar el historial entero (~900 KB) en la portada.
const RECENT_FOR_STREAKS = 60;
const FACT_DAYS = 3; // hoy y los 2 siguientes: el deploy corre cada hora, así que pasada la medianoche ya está el día nuevo
async function writeFacts(matches, live, crestIds) {
  const historic = JSON.parse(await readFile(new URL('../public/data/historico.json', import.meta.url), 'utf8')).matches.map((m) => ({
    ...relinkMatch(m, crestIds), date: null, comp: 'Primera División', completed: true,
  }));
  const club = JSON.parse(await readFile(new URL('../public/data/club.json', import.meta.url), 'utf8'));
  const all = [...historic, ...matches];
  const slim = (t) => ({ id: t.id, name: t.name, score: t.score });
  const recent = matches.filter((m) => m.comp !== 'Amistoso').slice(-RECENT_FOR_STREAKS)
    .map((m) => ({ id: m.id, date: m.date, comp: m.comp, completed: m.completed, home: slim(m.home), away: slim(m.away) }));
  const rivals = {};
  for (const m of live.fixture.filter((x) => !x.completed).slice(0, 5)) {
    const rival = m.home.id === VELEZ_ID ? m.away : m.home;
    rivals[rival.id] ??= rivalFacts(all, rival.id);
  }
  const days = {};
  for (let i = 0; i < FACT_DAYS; i++) {
    const md = monthDay(new Date(Date.now() + i * 864e5));
    days[md] = onThisDay(md, { matches, club });
  }
  await writeFile(new URL('facts.json', OUT), JSON.stringify({ updatedAt: new Date().toISOString(), recent, rivals, days }));
  console.log(`previa: ${Object.keys(rivals).length} rivales, efemérides ${Object.entries(days).map(([d, l]) => `${d}: ${l.length}`).join(', ')}`);
}

// El scoreboard no trae las asistencias: salen del detalle de cada partido terminado de la fase (~15 por fecha). Lo ya
// leído se guarda por partido; un partido cuyo detalle todavía no tiene todos los goles no se guarda y se vuelve a pedir.
async function writeAssists(standings) {
  const now = new Date();
  const from = standings.phaseStart ? new Date(standings.phaseStart) : new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const events = (await withRetry(() => fetchPhaseEvents(standings, from, now))).filter((ev) => ev.competitions?.[0]?.status?.type?.completed);
  const cacheFile = new URL('cache/asistencias.json', OUT);
  let cache = {};
  try {
    cache = JSON.parse(await readFile(cacheFile, 'utf8'));
  } catch {
    // primera corrida o caché vencido: se lee todo
  }
  const goalsOf = (list) => list.filter((x) => x.scoringPlay && !x.shootout).length;
  const byEvent = {};
  const missing = events.filter((ev) => !cache[ev.id]);
  for (let i = 0; i < missing.length; i += 8) {
    await Promise.all(missing.slice(i, i + 8).map(async (ev) => {
      const summary = await withRetry(() => fetchSummary({ id: ev.id, compSlug: 'arg.1' }));
      const list = summaryAssists(summary, ev);
      byEvent[ev.id] = list;
      if (goalsOf(summary.keyEvents ?? []) >= goalsOf(ev.competitions[0].details ?? [])) cache[ev.id] = list;
    }));
  }
  const ids = new Set(events.map((ev) => ev.id));
  await mkdir(new URL('cache/', OUT), { recursive: true });
  await writeFile(cacheFile, JSON.stringify(Object.fromEntries(Object.entries(cache).filter(([id]) => ids.has(id)))));
  const players = leaderboard(events.flatMap((ev) => cache[ev.id] ?? byEvent[ev.id] ?? [])).slice(0, 20).map(({ pen, ...p }) => p);
  await writeFile(new URL('asistencias.json', OUT), JSON.stringify({ updatedAt: now.toISOString(), phaseKey: standings.phaseKey, players }));
  return { read: missing.length, cached: events.length - missing.length, top: players[0] && `${players[0].name} (${players[0].n})` };
}

async function writePlayers(live) {
  const year = new Date().getFullYear();
  const official = (m) => m.completed && m.comp !== 'Amistoso';
  let played = live.results.filter((m) => new Date(m.date).getFullYear() === year && official(m));
  // En enero, antes del primer partido, el plantel quedaría vacío: se muestran los torneos del año anterior.
  if (!played.length) {
    played = (await withRetry(() => fetchSchedule({ season: year - 1 }))).filter(official);
    console.log(`jugadores: todavía no hay partidos en ${year}, uso los de ${year - 1}`);
  }
  const games = [];
  for (const match of played) {
    const summary = await withRetry(() => fetchSummary(match));
    games.push({ match, players: playersFromSummary(summary), goals: goalEvents(summary) });
  }
  const activeKeys = new Set(live.fixture.filter((m) => !m.completed).map((m) => tournamentOf(m).key));
  const tournaments = aggregateStats(games);
  const sanctions = discipline(games, activeKeys);
  await writeFile(new URL('players.json', OUT), JSON.stringify({ updatedAt: new Date().toISOString(), tournaments, discipline: sanctions }));
  await writeFile(new URL('games.json', OUT), JSON.stringify({ updatedAt: new Date().toISOString(), games: gamesLog(games) }));
  console.log(`jugadores: ${tournaments.map((t) => `${t.label} (${t.matches} PJ)`).join(', ')}; sanciones/alertas: ${sanctions.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

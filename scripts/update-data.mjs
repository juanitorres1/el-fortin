// Genera data/generated/{snapshot,matches,players}.json desde ESPN.
// - snapshot.json: respaldo de fixture/resultados/tabla por si la API no responde desde el navegador.
// - matches.json: todos los partidos oficiales de Vélez que ESPN tiene (desde 2001) para el historial.
// - players.json: estadísticas de jugadores por torneo del año y sanciones probables (desde el detalle de cada partido).
// Uso: node scripts/update-data.mjs
import { mkdir, writeFile } from 'node:fs/promises';
import { aggregateStats, discipline, fetchLive, fetchRoster, fetchSchedule, fetchSummary, playersFromSummary, tournamentOf } from '../js/espn.js';

const OUT = new URL('../data/generated/', import.meta.url);
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

  await writePlayers(live);

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
}

async function writePlayers(live) {
  const year = new Date().getFullYear();
  const games = [];
  for (const match of live.results.filter((m) => new Date(m.date).getFullYear() === year && m.comp !== 'Amistoso')) {
    const summary = await withRetry(() => fetchSummary(match));
    games.push({ match, players: playersFromSummary(summary) });
  }
  const activeKeys = new Set(live.fixture.filter((m) => !m.completed).map((m) => tournamentOf(m).key));
  const tournaments = aggregateStats(games);
  const sanctions = discipline(games, activeKeys);
  await writeFile(new URL('players.json', OUT), JSON.stringify({ updatedAt: new Date().toISOString(), tournaments, discipline: sanctions }));
  console.log(`jugadores: ${tournaments.map((t) => `${t.label} (${t.matches} PJ)`).join(', ')}; sanciones/alertas: ${sanctions.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

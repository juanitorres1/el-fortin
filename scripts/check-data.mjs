// Revisa los datos que generó update-data.mjs y avisa si algo quedó vacío o raro (ESPN cambió el formato, una sección
// se oculta, el reglamento es de otra temporada). Lo corre el deploy: si hay problemas, abre o actualiza un issue en
// GitHub (que llega por mail); si todo está bien, lo cierra. No frena el deploy: lo en vivo sigue andando.
// Uso: node scripts/check-data.mjs [archivo-del-reporte.md]
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { AVERAGE_SEASONS, RULES_YEAR } from '../src/lib/rules.js';

const OUT = new URL('../public/data/generated/', import.meta.url);
const MAX_AGE_H = 3;

/**
 * Problemas encontrados, como frases. `d` = { snapshot, matches, promedios, players, news, facts, ics } (null si falta).
 * Entre mediados de diciembre y fin de enero no hay partidos: ahí un fixture vacío es normal.
 */
export function checkData(d, now = new Date()) {
  const out = [];
  const month = now.getMonth() + 1;
  const offseason = (month === 12 && now.getDate() >= 15) || month === 1;
  const year = now.getFullYear();

  if (!d.snapshot) out.push('Falta `snapshot.json`: el sitio no tiene respaldo si ESPN no responde.');
  else {
    const age = (now - Date.parse(d.snapshot.updatedAt)) / 36e5;
    if (!(age < MAX_AGE_H)) out.push(`\`snapshot.json\` tiene ${Math.round(age)} h: el deploy no está actualizando los datos.`);
    const rows = d.snapshot.standings?.groups?.flatMap((g) => g.rows) ?? [];
    if (!rows.length && !offseason) out.push('La tabla de ESPN vino vacía: Inicio y Partidos no muestran posiciones.');
    if (!d.snapshot.fixture?.some((m) => !m.completed) && !offseason) out.push('No hay próximos partidos en ESPN: «Juega Vélez» y el calendario quedan vacíos.');
    if (rows.length && !d.snapshot.standings.playoffTeams) out.push('ESPN no informa la fase de playoffs: «Camino a los playoffs» está oculto.');
  }
  if (!(d.matches?.matches?.length > 1000)) out.push(`El historial tiene ${d.matches?.matches?.length ?? 0} partidos (se esperan más de 1000).`);
  const seasons = new Set((d.promedios?.parts ?? []).map((p) => p.season));
  if (seasons.size < AVERAGE_SEASONS && !offseason) out.push(`Los promedios tienen ${seasons.size} de ${AVERAGE_SEASONS} temporadas: la tabla está incompleta.`);
  if (!d.players?.tournaments?.length) out.push('No hay estadísticas de jugadores: el plantel se ve vacío.');
  if (!d.news?.headlines?.length) out.push('No se pudieron leer los titulares de velez.com.ar (¿cambió la web?).');
  if (!d.facts) out.push('Falta `facts.json`: «La previa» no se muestra.');
  if (!d.ics?.includes('BEGIN:VEVENT') && !offseason) out.push('El calendario `velez.ics` no tiene partidos.');
  if (year > RULES_YEAR) {
    out.push(`El reglamento de \`js/rules.js\` es de ${RULES_YEAR} y ya es ${year}: revisar descensos, promedios y torneos que cuentan, y actualizar \`RULES_YEAR\`. Mientras tanto no se marca quién desciende.`);
  }
  return out;
}

async function load(name, json = true) {
  try {
    const text = await readFile(new URL(name, OUT), 'utf8');
    return json ? JSON.parse(text) : text;
  } catch {
    return null;
  }
}

async function main() {
  const d = {
    snapshot: await load('snapshot.json'), matches: await load('matches.json'), promedios: await load('promedios.json'),
    players: await load('players.json'), news: await load('news.json'), facts: await load('facts.json'), ics: await load('velez.ics', false),
  };
  const problems = checkData(d);
  const report = problems.length
    ? `El chequeo del deploy encontró ${problems.length === 1 ? 'un problema' : `${problems.length} problemas`}:\n\n${problems.map((p) => `- ${p}`).join('\n')}\n\nEste issue se actualiza en cada deploy y se cierra solo cuando todo vuelve a estar bien.`
    : 'Todo bien.';
  console.log(report);
  if (process.argv[2]) await writeFile(process.argv[2], report);
  if (process.env.GITHUB_OUTPUT) await writeFile(process.env.GITHUB_OUTPUT, `problems=${problems.length}\n`, { flag: 'a' });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();

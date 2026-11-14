// Formaciones titulares de partidos recordados de Vélez, para «El Once de Liniers» (página Juegos). Dos fuentes:
// - ESPN (los partidos de `ESPN`, por id): titulares, dorsal y puesto del resumen del partido.
// - scripts/onces-a-mano.json: los anteriores a ESPN, transcriptos a mano con su fuente (`src`).
// Se corre a mano y el resultado va al repo:
//
//   node scripts/import-onces.mjs        → public/data/onces.json
//
// Las fotos de los titulares salen de public/data/jugadores.json (correr antes scripts/import-jugadores.mjs).
// Para sumar un partido: agregar su id de ESPN (está en la URL del partido) y la liga acá, o la ficha en el JSON a mano.
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { VELEZ_ID, lineupFromSummary } from '../src/lib/espn.js';

const OUT = new URL('../public/data/onces.json', import.meta.url);
const HAND = new URL('./onces-a-mano.json', import.meta.url);
const PLAYERS = new URL('../public/data/jugadores.json', import.meta.url);

// El mismo jugador con otro nombre en jugadores.json (para ponerle la foto). Solo los que no dejan dudas.
const SAME = {
  'Maxi Morález': 'Maximiliano Moralez', 'Augusto Fernández': 'Augusto Matías Fernández', 'Francisco Cerro': 'Francisco Javier Cerro',
  'Rodrigo López': 'Hernán Rodrigo López', 'Sebastián Domínguez': 'Sebastián Enrique Domínguez', 'Pablo Galdames': 'Pablo Galdames Millán',
  'Juan Martínez': 'Juan Manuel Martínez',
};
const plain = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Le pone a cada titular la foto de jugadores.json (`img` = [archivo, autor, licencia]) si el nombre coincide. */
export function withPhotos(once, players) {
  const byName = new Map(players.filter((p) => p.img).map((p) => [plain(p.n), p.img]));
  return { ...once, players: once.players.map((p) => ({ ...p, ...(byName.has(plain(SAME[p.n] ?? p.n)) ? { img: byName.get(plain(SAME[p.n] ?? p.n)) } : {}) })) };
}

const ESPN = [
  ['261311', 'arg.1', 'Clausura 2009 · última fecha'],
  ['311694', 'arg.1', 'Clausura 2011 · última fecha'],
  ['352498', 'arg.1', 'Inicial 2012'],
  ['589991', 'conmebol.sudamericana', 'Copa Sudamericana 2020 · cuartos de final'],
  ['647685', 'conmebol.libertadores', 'Copa Libertadores 2022 · cuartos de final'],
  ['702268', 'arg.copa_lpf', 'Copa de la Liga 2024 · final'],
  ['722676', 'arg.copa', 'Copa Argentina 2024 · semifinal'],
  ['694547', 'arg.1', 'Liga Profesional 2024 · última fecha'],
  ['735764', 'arg.supercopa.internacional', 'Supercopa Internacional 2024'],
  ['729692', 'arg.supercopa', 'Supercopa Argentina 2024'],
];

/** Puesto de ESPN («CD-L», «LB», «AM», «RF»…) → línea: G, D, M o F. */
export function lineOfPos(pos) {
  const p = (pos ?? '').toUpperCase();
  if (p === 'G') return 'G';
  if (/^(CD|D|LB|RB|SW|LWB|RWB)/.test(p)) return 'D';
  if (/M/.test(p)) return 'M';
  return 'F';
}

/** Ficha de un partido de ESPN con el once de Vélez; null si el resumen no trae los 11 titulares. */
export function onceFromSummary(summary, { id, title }) {
  const lineup = lineupFromSummary(summary, VELEZ_ID);
  const comp = summary.header?.competitions?.[0];
  const sides = comp?.competitors ?? [];
  const velez = sides.find((c) => String(c.team?.id) === VELEZ_ID);
  const rival = sides.find((c) => String(c.team?.id) !== VELEZ_ID);
  if (!lineup || !velez || !rival) return null;
  const order = (lineup.rows ?? [lineup.players]).flat();
  return {
    id: `e-${id}`,
    date: comp.date.slice(0, 10),
    title,
    home: velez.homeAway === 'home',
    rival: rival.team.displayName,
    rivalId: String(rival.team.id),
    score: `${velez.score}-${rival.score}`,
    src: `https://www.espn.com.ar/futbol/partido/_/juegoId/${id}`,
    players: order.map((p) => ({ n: p.name, num: p.jersey ? Number(p.jersey) : null, pos: lineOfPos(p.pos) })),
  };
}

async function main() {
  let list = JSON.parse(await readFile(HAND, 'utf8'));
  for (const [id, league, title] of ESPN) {
    const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${league}/summary?event=${id}`);
    const once = res.ok ? onceFromSummary(await res.json(), { id, title }) : null;
    if (once) list.push(once);
    else console.warn(`once: ${id} (${title}) sin formación en ESPN`);
  }
  const players = JSON.parse(await readFile(PLAYERS, 'utf8')).players;
  list = list.map((o) => withPhotos(o, players));
  list.sort((a, b) => a.date.localeCompare(b.date));
  await writeFile(OUT, `${JSON.stringify({ source: 'ESPN y Wikipedia (CC BY-SA), ver `src` en cada partido. Generado con scripts/import-onces.mjs.', onces: list }, null, 1)}\n`);
  console.log(`onces: ${list.length} partidos`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();

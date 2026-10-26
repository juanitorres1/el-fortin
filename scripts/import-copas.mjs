// Convierte scripts/copas-historicas.txt (partidos de Vélez en copas anteriores a 2001, transcriptos desde RSSSF) en
// public/data/copas-historicas.json, con el mismo formato compacto que historico.json más fecha, copa y ronda.
// Desde 2001 las copas salen de ESPN (scripts/update-data.mjs), así que no se superponen.
//
// Uso (una sola vez, o al corregir el .txt; el resultado se commitea porque el pasado no cambia):
//   node scripts/import-copas.mjs
//
// Ids de los equipos, para que se junten con sus otros partidos y tengan escudo: primero los del historial 1931–2000
// (historico.json), después los de ESPN desde 2001 (data/generated/matches.json, si está) y por último las listas de
// equipos de ESPN de Sudamérica (por nombre, como lib/crests.js). Los que no aparecen llevan id propio `c-…`.
import { readFile, writeFile } from 'node:fs/promises';
import { VELEZ_ID, fetchTeams } from '../src/lib/espn.js';
import { linkTeams, normName } from '../src/lib/crests.js';

const ROOT = new URL('../', import.meta.url);
const LEAGUES = ['arg.1', 'arg.2', 'arg.3', 'bra.1', 'bra.2', 'uru.1', 'par.1', 'col.1', 'per.1', 'ecu.1', 'ven.1', 'chi.1',
  'bol.1', 'crc.1', 'ita.1', 'conmebol.libertadores', 'conmebol.sudamericana'];
// Cómo figuran en ESPN o en el historial los que acá van con su nombre de uso.
const ALIASES = { Milan: 'AC Milan', Junior: 'Atlético Junior', 'Chacarita Juniors': 'Chacarita', Cartaginés: 'Cartaginés' };

/** Un renglón del .txt → partido (sin ids). Tira error con el número de línea si algo no cierra. */
export function parseLine(line, edition, n) {
  const [fecha, ronda, partido, notas = ''] = line.split('|').map((s) => s.trim());
  const fail = (msg) => {
    throw new Error(`copas-historicas.txt:${n}: ${msg}\n  ${line}`);
  };
  const d = fecha.match(/^(~?)(\d{4})-(\d{2})-(\d{2})$/);
  if (!d) fail('fecha inválida');
  const m = partido.match(/^(.+?) (\d+)-(\d+) (.+)$/);
  if (!m) fail('partido inválido (tiene que ser «Local 1-0 Visitante»)');
  const [, homeName, hs, as, awayName] = m;
  if (homeName !== 'Vélez' && awayName !== 'Vélez') fail('no juega Vélez');
  const out = {
    year: Number(d[2]),
    // Una fecha aproximada solo sirve para ordenar el .txt: en el sitio queda el año, como el historial viejo.
    // RSSSF no da la hora: mediodía en la Argentina (15 UTC), así el día no cambia al mostrarlo con la zona horaria.
    date: d[1] ? null : `${d[2]}-${d[3]}-${d[4]}T15:00Z`,
    comp: edition.comp,
    season: edition.season,
    round: ronda,
    home: { name: homeName, score: Number(hs) },
    away: { name: awayName, score: Number(as) },
    src: edition.url,
  };
  for (const raw of notas.split(';').map((s) => s.trim()).filter(Boolean)) {
    if (/^neutral\b/.test(raw)) {
      out.neutral = true;
      const city = raw.replace(/^neutral\s*/, '');
      if (city) out.venue = city;
    } else if (raw === 'sin cancha') out.venueUnknown = true;
    else if (raw === 'prórroga') out.aet = true;
    else if (/^pen \d+-\d+$/.test(raw)) out.pen = raw.slice(4).split('-').map(Number);
    else if (/^nota: /.test(raw)) out.note = raw.slice(6);
    else fail(`nota desconocida «${raw}»`);
  }
  // Los penales van en el partido que cerró la llave (en ida y vuelta, ese partido no tiene por qué terminar empatado).
  if (out.pen && out.pen[0] === out.pen[1]) fail('penales empatados');
  return out;
}

/** El .txt entero → partidos en orden, con su edición. */
export function parseFile(text) {
  const matches = [];
  let edition = null;
  text.split('\n').forEach((line, i) => {
    const t = line.trim();
    if (!t || t.startsWith('#')) return;
    const head = t.match(/^== (.+?) (\d{4}) \| (https?:\S+)$/);
    if (head) {
      edition = { comp: head[1], season: `${head[1]} ${head[2]}`, url: head[3] };
      return;
    }
    if (!edition) throw new Error(`copas-historicas.txt:${i + 1}: partido antes de la primera edición`);
    matches.push(parseLine(t, edition, i + 1));
  });
  return matches;
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(new URL(path, ROOT), 'utf8'));
  } catch {
    return null;
  }
}

async function main() {
  const matches = parseFile(await readFile(new URL('scripts/copas-historicas.txt', ROOT), 'utf8'));
  const known = new Map([[normName('Vélez'), VELEZ_ID]]);
  const remember = (t) => {
    const k = normName(t.name);
    if (!known.has(k)) known.set(k, String(t.id));
  };
  for (const m of (await readJson('public/data/historico.json'))?.matches ?? []) [m.home, m.away].forEach(remember);
  const espnMatches = (await readJson('public/data/generated/matches.json'))?.matches ?? [];
  if (!espnMatches.length) console.warn('Falta data/generated/matches.json (npm run data): se buscan solo en las listas de ESPN.');
  for (const m of espnMatches) [m.home, m.away].forEach(remember);

  const names = [...new Set(matches.flatMap((m) => [m.home.name, m.away.name]))];
  const lookup = (name) => known.get(normName(ALIASES[name] ?? name)) ?? known.get(normName(name));
  const pending = names.filter((n) => !lookup(n)).map((n) => ({ id: n, name: ALIASES[n] ?? n }));
  const espnTeams = [];
  for (const league of LEAGUES) {
    try {
      espnTeams.push(...(await fetchTeams(league)));
    } catch (err) {
      console.warn(`No se pudo leer ${league}:`, err.message);
    }
  }
  const { ids } = linkTeams(pending, espnTeams);
  const slug = (n) => `c-${normName(n).replace(/[^a-z0-9]+/g, '-')}`;
  const idOf = (n) => lookup(n) ?? ids[n] ?? slug(n);

  const out = matches.map((m, i) => ({
    id: `c${i + 1}`,
    ...m,
    home: { id: idOf(m.home.name), ...m.home },
    away: { id: idOf(m.away.name), ...m.away },
  }));
  const missing = names.filter((n) => idOf(n).startsWith('c-'));
  await writeFile(new URL('public/data/copas-historicas.json', ROOT), `${JSON.stringify({
    source: 'RSSSF (Rec.Sport.Soccer Statistics Foundation), rsssf.org: transcripto a mano en scripts/copas-historicas.txt',
    note: 'Copas de Vélez anteriores a 2001. date = null cuando RSSSF solo da el rango de la ronda.',
    matches: out,
  })}\n`);
  console.log(`copas-historicas.json: ${out.length} partidos, ${names.length} equipos; sin id de ESPN: ${missing.join(', ') || 'ninguno'}`);
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('import-copas.mjs')) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

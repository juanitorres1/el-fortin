// Jugadores que pasaron por Vélez, desde Wikidata (CC0): nombre, nacimiento, posición, nacionalidad y la trayectoria
// (clubes con años, partidos y goles cuando Wikidata los tiene). Además, la foto de cada jugador (Wikimedia Commons,
// con su autor y su licencia) y el escudo de cada club (ESPN si el club está en sus ligas; si no, el de Commons). Alimenta los juegos de la página Juegos (El Tapado,
// Trayectoria V y Grilla del Fortín). Se corre a mano y el resultado va al repo:
//
//   node scripts/import-jugadores.mjs        → public/data/jugadores.json
//
// Wikidata lo edita cualquiera: puede tener errores u omisiones. Para corregir un jugador, editar
// scripts/jugadores-fixes.json (ver `applyFixes`) y volver a correr; no editar el JSON generado a mano.
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const VELEZ = 'Q215163';
const ENDPOINT = 'https://query.wikidata.org/sparql';
const OUT = new URL('../public/data/jugadores.json', import.meta.url);
const FIXES = new URL('./jugadores-fixes.json', import.meta.url);
const WD = 'http://www.wikidata.org/entity/';

async function sparql(query) {
  const res = await fetch(`${ENDPOINT}?format=json&query=${encodeURIComponent(query)}`, { headers: { 'User-Agent': 'fan-site-data-import/1.0', Accept: 'application/sparql-results+json' } });
  if (!res.ok) throw new Error(`Wikidata ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()).results.bindings.map((b) => Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v.value.replace(WD, '')])));
}

const PEOPLE = `SELECT ?p ?pLabel ?links ?birth ?posLabel ?natLabel ?img WHERE {
  ?p wdt:P54 wd:${VELEZ} ; wdt:P31 wd:Q5 ; wikibase:sitelinks ?links .
  OPTIONAL { ?p wdt:P569 ?birth }
  OPTIONAL { ?p wdt:P413 ?pos }
  OPTIONAL { ?p wdt:P27 ?nat }
  OPTIONAL { ?p wdt:P18 ?img }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "es,en". }
}`;

const STINTS = `SELECT ?p ?club ?clubLabel ?countryLabel ?eu ?national ?s ?e ?apps ?goals ?logo WHERE {
  ?p wdt:P54 wd:${VELEZ} ; wdt:P31 wd:Q5 ; p:P54 ?st .
  ?st ps:P54 ?club .
  OPTIONAL { ?st pq:P580 ?s }
  OPTIONAL { ?st pq:P582 ?e }
  OPTIONAL { ?st pq:P1350 ?apps }
  OPTIONAL { ?st pq:P1351 ?goals }
  OPTIONAL { ?club wdt:P17 ?country }
  OPTIONAL { ?club wdt:P154 ?logo }
  BIND(EXISTS { ?club wdt:P17/wdt:P30 wd:Q46 } AS ?eu)
  BIND(EXISTS { ?club wdt:P31/wdt:P279* wd:Q6979593 } AS ?national)
  SERVICE wikibase:label { bd:serviceParam wikibase:language "es,en". }
}`;

const POS_WORDS = [
  ['G', /guardameta|portero|arquero|goalkeeper/i],
  ['D', /defens|lateral|central|l[ií]bero|zaguero|carrilero|back|sweeper/i],
  ['M', /centrocampista|mediocampista|volante|medio|pivote|mediapunta|interior|enganche|midfield/i],
  ['F', /delantero|extremo|punta|atacante|ariete|forward|striker|winger/i],
];
const POS_ORDER = 'GDMF';

/** «defensa central» → 'D'; null si no se reconoce. */
export function posOf(label) {
  return POS_WORDS.find(([, re]) => re.test(label ?? ''))?.[0] ?? null;
}

// Nombres que la regla general deja largos o rotos.
const ALIAS = {
  'Clube de Regatas do Flamengo': 'Flamengo', 'Godoy Cruz Antonio Tomba': 'Godoy Cruz', 'Instituto Atlético Central Córdoba': 'Instituto',
  'San Lorenzo de Almagro': 'San Lorenzo', 'Club de Gimnasia y Esgrima La Plata': 'Gimnasia (La Plata)', 'Genoa Cricket & Football Club': 'Genoa',
  'Esporte Clube Juventude': 'Juventude', 'Quilmes Atlético Club': 'Quilmes', 'Sport Club Corinthians Paulista': 'Corinthians',
  'Club Nacional de Football': 'Nacional', 'Club Atlético Vélez Sarsfield': 'Vélez Sarsfield',
};

/** Nombre corto de un club: sin «Club Atlético», «Football Club»… («Club Atlético de Madrid» → «Atlético de Madrid»). */
export function clubName(label) {
  if (ALIAS[label]) return ALIAS[label];
  const short = label
    .replaceAll('’', "'")
    .replace(/^Club Atlético (?!de )/i, '')
    .replace(/^Club (?=Atlético de )/i, '')
    .replace(/^(Club de Fútbol|Club Deportivo|Club Social y Deportivo|Club Sportivo|Asociación Atlética|Associazione Calcio|Società Sportiva|Sociedad Deportiva|Real Club Deportivo|Sport Club|Football Club|Fútbol Club|Futbol Club|Club) (?!de |del )/i, '')
    .replace(/ (Football Club|Fútbol Club|Futbol Club|Club de Fútbol|Futebol Clube|Calcio|F\.C\.|FC|CF|S\.A\.D\.)$/i, '')
    .trim();
  return ALIAS[short] ?? short;
}

/** «http://commons.wikimedia.org/wiki/Special:FilePath/Foo%20bar.jpg» → «Foo bar.jpg». */
export const commonsFile = (url) => (url ? decodeURIComponent(url.split('Special:FilePath/')[1] ?? '').replaceAll('_', ' ') || null : null);

// ---------- Escudos: los de ESPN, buscando cada club por nombre dentro de las ligas de su país ----------

const ESPN_LEAGUES = {
  Argentina: ['arg.1', 'arg.2', 'arg.3', 'arg.4', 'arg.5'], España: ['esp.1', 'esp.2'], Italia: ['ita.1', 'ita.2'], 'Reino Unido': ['eng.1', 'eng.2', 'eng.3', 'sco.1'],
  Francia: ['fra.1', 'fra.2'], Alemania: ['ger.1', 'ger.2'], México: ['mex.1', 'mex.2'], Brasil: ['bra.1', 'bra.2'], Uruguay: ['uru.1'], Paraguay: ['par.1'],
  Chile: ['chi.1'], Colombia: ['col.1'], 'Estados Unidos': ['usa.1'], Portugal: ['por.1'], Ecuador: ['ecu.1'], Perú: ['per.1'], Bolivia: ['bol.1'],
  'Países Bajos': ['ned.1'], Turquía: ['tur.1'], Grecia: ['gre.1'], Rusia: ['rus.1'], Venezuela: ['ven.1'], Bélgica: ['bel.1'], Suiza: ['sui.1'], Japón: ['jpn.1'],
};
const STOP = new Set(['club', 'atletico', 'de', 'del', 'la', 'el', 'los', 'las', 'fc', 'cf', 'cd', 'ca', 'sc', 'ac', 'as', 'ss', 'afc', 'football', 'futbol', 'futebol', 'clube', 'calcio', 'deportivo', 'sporting', 'sport', 'social', 'y', 'asociacion', 'associazione', 'societa', 'sportiva']);
/** Clave para comparar nombres de clubes: sin tildes, sin «Club», «FC», «de»… y con las palabras ordenadas. */
export function clubKey(name) {
  const words = String(name ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  const kept = words.filter((w) => !STOP.has(w));
  return (kept.length ? kept : words).sort().join(' ');
}

/** Índice de equipos de ESPN por país: Map(país → Map(clave → id)). `fetchImpl` para los tests. */
export async function espnIndex(fetchImpl = fetch) {
  const index = new Map();
  for (const [pais, leagues] of Object.entries(ESPN_LEAGUES)) {
    const byKey = new Map();
    for (const league of leagues) {
      try {
        const json = await (await fetchImpl(`https://site.api.espn.com/apis/site/v2/sports/soccer/${league}/teams`)).json();
        for (const { team: t } of json.sports?.[0]?.leagues?.[0]?.teams ?? []) {
          for (const name of [t.displayName, t.shortDisplayName, t.name, t.location]) if (name && !byKey.has(clubKey(name))) byKey.set(clubKey(name), String(t.id));
        }
      } catch (err) {
        console.warn(`escudos: no se pudo leer ${league}:`, err.message);
      }
    }
    index.set(pais, byKey);
  }
  return index;
}

/** Código del escudo de un club: «e123» (id de ESPN), «cArchivo.svg» (logo en Commons) o null. */
export function logoCode(stint, index) {
  if (stint.id === VELEZ) return 'e21';
  const byKey = index?.get(stint.pais);
  const id = byKey && [stint.label, stint.club].map((n) => byKey.get(clubKey(n))).find(Boolean);
  return id ? `e${id}` : stint.logo ? `c${stint.logo}` : null;
}

// ---------- Fotos: autor y licencia de cada una (Commons pide atribución) ----------

const text = (html) => String(html ?? '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\s+/g, ' ').trim();

/** Autor y licencia de cada archivo de Commons: Map(archivo → [autor, licencia]). */
export async function commonsCredits(files, fetchImpl = fetch) {
  const out = new Map();
  for (let i = 0; i < files.length; i += 40) {
    const titles = files.slice(i, i + 40).map((f) => `File:${f}`).join('|');
    const res = await fetchImpl(`https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=extmetadata&iiextmetadatafilter=Artist|LicenseShortName&titles=${encodeURIComponent(titles)}`, { headers: { 'User-Agent': 'fan-site-data-import/1.0' } });
    const json = await res.json();
    for (const page of Object.values(json.query?.pages ?? {})) {
      const meta = page.imageinfo?.[0]?.extmetadata;
      if (!meta) continue;
      const artist = text(meta.Artist?.value).slice(0, 70) || 'Autor en Commons';
      out.set(page.title.replace(/^File:/, ''), [artist, text(meta.LicenseShortName?.value) || 'ver licencia']);
    }
  }
  return out;
}

const yearOf = (iso) => (iso ? Number(iso.slice(0, 4)) : null);
const num = (x) => (x == null || x === '' ? null : Number(x));
const YOUTH = /sub-?\s?\d|under|u-?\d\d|ol[ií]mpic|juvenil|youth|\bB$| II$|reserva/i;

/**
 * Etapas de un jugador, limpias: sin selecciones ni juveniles, sin repetidas (Wikidata suele tener la misma etapa dos
 * veces, con y sin partidos) y ordenadas por año. Cada una: { club, id, pais, eu, from, to, pj, g }.
 * Devuelve { stints, national } (`national` = jugó en una selección mayor).
 */
export function cleanStints(rows) {
  let national = false;
  const list = [];
  for (const r of rows) {
    if (YOUTH.test(r.clubLabel)) continue;
    if (r.national === 'true' || /^selecci[oó]n |national (football )?team/i.test(r.clubLabel)) {
      national = true;
      continue;
    }
    if (/^Q\d+$/.test(r.clubLabel)) continue; // sin nombre en español ni en inglés
    list.push({ club: clubName(r.clubLabel), label: r.clubLabel, logo: commonsFile(r.logo), id: r.club, pais: r.countryLabel && !/^Q\d+$/.test(r.countryLabel) ? r.countryLabel : null, eu: r.eu === 'true', from: yearOf(r.s), to: yearOf(r.e), pj: num(r.apps), g: num(r.goals) });
  }
  list.sort((a, b) => (a.from ?? 9999) - (b.from ?? 9999) || (a.to ?? 9999) - (b.to ?? 9999) || (b.pj ?? -1) - (a.pj ?? -1));
  const out = [];
  for (const s of list) {
    const prev = out.at(-1)?.id === s.id ? out.at(-1) : null; // misma camiseta sin otro club en el medio
    const dup = prev && (prev.from === s.from || (s.from != null && prev.to != null && s.from <= prev.to && (prev.pj == null || s.pj == null || prev.pj === s.pj)));
    const next = prev && !dup && s.from != null && prev.to != null && s.from <= prev.to + 1; // renovó o volvió de un préstamo corto
    if (dup || next) {
      // De dos copias de la misma etapa vale el año de salida de la que trae los partidos.
      if (dup && prev.pj == null && s.pj != null) prev.to = s.to;
      else if (!(dup && prev.pj != null && s.pj == null)) prev.to = prev.to == null || s.to == null ? (dup ? prev.to ?? s.to : null) : Math.max(prev.to, s.to);
      const add =(k) => (prev[k] == null ? s[k] : s[k] == null ? prev[k] : dup ? Math.max(prev[k], s[k]) : prev[k] + s[k]);
      prev.pj = add('pj');
      prev.g = add('g');
      prev.logo ??= s.logo;
    } else out.push({ ...s });
  }
  return { stints: out, national };
}

/** Correcciones a mano: { "Q123": { "n": "Nombre", "pos": ["D"], "skip": true, ... } } pisa los campos del jugador. */
export function applyFixes(players, fixes) {
  return players.filter((p) => !fixes[p.id]?.skip).map((p) => ({ ...p, ...fixes[p.id] }));
}

/**
 * Arma los jugadores. `index` = equipos de ESPN por país (para los escudos). Devuelve { players, logos }: cada etapa
 * lleva en la posición 6 el índice de su escudo en `logos` (o -1).
 */
export function buildPlayers(people, stintRows, index) {
  const logos = [];
  const logoAt = (code) => {
    if (!code) return -1;
    if (!logos.includes(code)) logos.push(code);
    return logos.indexOf(code);
  };
  const byId = new Map();
  for (const r of people) {
    const p = byId.get(r.p) ?? { id: r.p, n: r.pLabel, links: Number(r.links), b: null, pos: new Set(), nat: new Set(), imgs: new Set() };
    if (r.img) p.imgs.add(commonsFile(r.img));
    p.b ??= yearOf(r.birth);
    const pos = posOf(r.posLabel);
    if (pos) p.pos.add(pos);
    if (r.natLabel && !/^Q\d+$/.test(r.natLabel)) p.nat.add(r.natLabel);
    byId.set(r.p, p);
  }
  const rowsBy = Map.groupBy(stintRows, (r) => r.p);
  const out = [];
  for (const p of byId.values()) {
    if (/^Q\d+$/.test(p.n)) continue;
    const { stints, national } = cleanStints(rowsBy.get(p.id) ?? []);
    const velez = stints.filter((s) => s.id === VELEZ);
    if (!velez.length) continue;
    const from = Math.min(...velez.map((s) => s.from ?? Infinity));
    const to = Math.max(...velez.map((s) => s.to ?? s.from ?? -Infinity));
    const sum = (k) => (velez.some((s) => s[k] != null) ? velez.reduce((n, s) => n + (s[k] ?? 0), 0) : null);
    out.push({
      id: p.id,
      n: p.n,
      b: p.b,
      pos: [...p.pos].sort((a, b) => POS_ORDER.indexOf(a) - POS_ORDER.indexOf(b)),
      nat: [...p.nat].sort((a, b) => (a === 'Argentina') - (b === 'Argentina') || a.localeCompare(b, 'es')),
      links: p.links,
      sel: national,
      img: [...p.imgs].sort()[0] ?? null,
      v: { from: Number.isFinite(from) ? from : null, to: Number.isFinite(to) ? to : null, pj: sum('pj'), g: sum('g') },
      // Trayectoria: [club, desde, hasta, país, ¿Europa?, ¿es Vélez?, escudo (índice en `logos`)]
      c: stints.map((s) => [s.club, s.from, s.to, s.pais, s.eu ? 1 : 0, s.id === VELEZ ? 1 : 0, logoAt(logoCode(s, index))]),
    });
  }
  return { players: out.sort((a, b) => b.links - a.links || a.n.localeCompare(b.n, 'es')), logos };
}

async function main() {
  const [people, stints] = [await sparql(PEOPLE), await sparql(STINTS)];
  const fixes = JSON.parse(await readFile(FIXES, 'utf8').catch(() => '{}'));
  const built = buildPlayers(people, stints, await espnIndex());
  const players = applyFixes(built.players, fixes);
  // Foto: [archivo, autor, licencia]. Sin esos datos no se muestra (la licencia pide nombrar al autor).
  const credits = await commonsCredits(players.map((p) => p.img).filter(Boolean));
  for (const p of players) p.img = typeof p.img === 'string' && credits.has(p.img) ? [p.img, ...credits.get(p.img)] : Array.isArray(p.img) ? p.img : null;
  await writeFile(OUT, `${JSON.stringify({
    source: 'Wikidata (wikidata.org), CC0. Fotos y logos: Wikimedia Commons (autor y licencia en cada foto). Escudos: ESPN. Importado con scripts/import-jugadores.mjs.',
    note: 'Jugadores con paso por Vélez. Wikidata puede tener errores u omisiones: las correcciones van en scripts/jugadores-fixes.json. c = [club, desde, hasta, país, europa, esVélez, escudo]; img = [archivo de Commons, autor, licencia]; logos = «e» + id de ESPN o «c» + archivo de Commons.',
    importedAt: new Date().toISOString().slice(0, 10),
    logos: built.logos,
    players,
  })}\n`);
  const full = players.filter((p) => p.b && p.pos.length && p.nat.length && p.v.from);
  const stintCount = players.reduce((n, p) => n + p.c.length, 0);
  console.log(`jugadores: ${players.length} (${full.length} con nacimiento, posición, país y año de llegada; ${players.filter((p) => p.img).length} con foto)`);
  console.log(`escudos: ${players.reduce((n, p) => n + p.c.filter((c) => c[6] >= 0).length, 0)} de ${stintCount} etapas (${built.logos.filter((l) => l[0] === 'e').length} clubes de ESPN, ${built.logos.filter((l) => l[0] === 'c').length} de Commons)`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();

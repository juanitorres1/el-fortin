// Convierte el dataset «Liga Argentina 1931-2023» (Kaggle, ivanramosctes, licencia PDDL) en
// data/historico.json: los partidos de Vélez en Primera División anteriores a 2001.
// Desde 2001 los datos salen de ESPN (scripts/update-data.mjs), así que no se superponen.
//
// Uso (una sola vez; el resultado se commitea porque el pasado no cambia):
//   node scripts/import-historico.mjs ruta/a/liga_2023.csv
//
// El dataset no trae fechas por partido, solo el nombre del torneo. Validado contra ESPN:
// en 2003-2021 coinciden 638 de 641 partidos (rival, localía y resultado).
import { readFile, writeFile } from 'node:fs/promises';

const LAST_YEAR = 2000;
const VELEZ = 'Velez';

// Nombre del dataset → id de ESPN (mismo id que en matches.json, así el historial se une por rival).
// Los que ESPN no tiene llevan id propio `k<id>` y un nombre legible.
const TEAMS = {
  'Boca Juniors': '5', 'River Plate': '16', 'Racing Club': '15', Independiente: '11', 'San Lorenzo': '18',
  Huracan: '10', 'Estudiantes (LP)': '8', 'Gimnasia (LP)': '9', Newells: '14', 'Rosario Central': '17',
  Argentinos: '3', Lanus: '12', Banfield: '235', Platense: '7764', Chacarita: '6', Colon: '7', Union: '20',
  Quilmes: '2741', Tigre: '7767', 'Talleres (C)': '19', Belgrano: '4', Instituto: '2975', Arsenal: '2635',
  'Gimnasia (J)': '5263', 'Godoy Cruz': '6756', 'San Martin (T)': '8713', 'Atl Tucuman': '9785',
  'San Martin (SJ)': '7845', 'Sarmiento (J)': '10158', 'Atl Rafaela': '9747', 'Def y Justicia': '8950',
  'Central Cba (SdE)': '11989', 'Gimnasia (M)': '11972', 'Ind Rivadavia': '9744', 'Huracan (TA)': '2974',
  'Tiro Federal (R)': '5262', 'Dep. Armenio': '10152', 'Estudiantes (BA)': '17352', 'Gimnasia (S)': '10743',
  'Crucero (M)': '11958', 'Los Andes': '13', 'Nueva Chicago': '236', Olimpo: '2636', Almagro: '2',
  'All Boys': '9786', Temperley: '10162', Aldosivi: '9739', Patronato: '10374', 'Dep. Espanol': '17701', Cipolletti: '11927',
};
const NAMES = {
  Ferro: 'Ferro Carril Oeste', Atlanta: 'Atlanta', 'Dep Mandiyu (C)': 'Deportivo Mandiyú',
  'Talleres (RdE)': 'Talleres (RdE)', 'Racing (C)': 'Racing (Córdoba)', 'San Martin (M)': 'San Martín (Mendoza)',
  'Chaco For Ever': 'Chaco For Ever', 'San Lorenzo (MdP)': 'San Lorenzo (MdP)', 'Central Cba (R)': 'Central Córdoba (Rosario)',
  'Kimberley (MdP)': 'Kimberley (MdP)', 'Dep. Roca': 'Deportivo Roca', 'Altos Hornos Zapla': 'Altos Hornos Zapla',
  'Guarani (M)': 'Guaraní Antonio Franco', 'Huracan (IW)': 'Huracán (Ing. White)', 'Dep. Moron': 'Deportivo Morón',
  'Huracan (CR)': 'Huracán (Comodoro Rivadavia)', 'Sarmiento (R)': 'Sarmiento (Resistencia)',
  'Juv. Unida (SL)': 'Juventud Unida (San Luis)', 'Atl Ledesma (J)': 'Atlético Ledesma', 'Huracan (SR)': 'Huracán (San Rafael)',
  'Renato Cesarini (R)': 'Renato Cesarini', 'Central Norte (S)': 'Central Norte (Salta)', 'Arg de Firmat': 'Argentino de Firmat',
  'Juv. Alianza (SJ)': 'Juventud Alianza', 'Atl. Concepcion (T)': 'Atlético Concepción', 'Sp. Italiano': 'Sportivo Italiano',
  'Huracan (C)': 'Huracán (C)', Desamparados: 'Sportivo Desamparados', 'Bartolome Mitre (M)': 'Bartolomé Mitre',
  'Juv. Antoniana': 'Juventud Antoniana', 'San Telmo': 'San Telmo',
};

// El CSV trae algunos caracteres rotos (p. ej. «Dep. Espa�ol»): comparamos sin ellos.
const key = (s) => s.normalize('NFKD').replace(/[^A-Za-z0-9()]/g, '').toLowerCase();
const TEAM_BY_KEY = new Map(Object.entries(TEAMS).map(([n, id]) => [key(n), id]));
const NAME_BY_KEY = new Map(Object.entries(NAMES).map(([n, pretty]) => [key(n), pretty]));

function parseCsv(text) {
  const [header, ...lines] = text.trim().split(/\r?\n/);
  const cols = header.split(',');
  return lines.map((l) => Object.fromEntries(l.split(',').map((v, i) => [cols[i], v.trim()])));
}

// Formato compacto: el logo se deriva del id en el navegador (ver hydrateHistoric en js/app.js).
function side(name, kaggleId, score, espnNames, unknown) {
  if (name === VELEZ) return { id: '21', name: 'Vélez', score };
  const id = TEAM_BY_KEY.get(key(name));
  if (id) return { id, name: espnNames.get(id) ?? name, score };
  if (!NAME_BY_KEY.has(key(name))) unknown.add(name);
  return { id: `k${kaggleId}`, name: NAME_BY_KEY.get(key(name)) ?? name, score };
}

async function main() {
  const csvPath = process.argv[2];
  if (!csvPath) throw new Error('Uso: node scripts/import-historico.mjs ruta/a/liga_2023.csv');
  const rows = parseCsv(await readFile(csvPath, 'utf8'));

  // Usamos los nombres de ESPN cuando existen, para que el selector de rivales no muestre dos variantes.
  const espnNames = new Map();
  try {
    const { matches } = JSON.parse(await readFile(new URL('../data/generated/matches.json', import.meta.url), 'utf8'));
    for (const m of matches) for (const s of [m.home, m.away]) espnNames.set(s.id, s.name);
  } catch {
    console.warn('Sin data/generated/matches.json: se usan los nombres del dataset. Corré antes `npm run data`.');
  }

  const unknown = new Set();
  const matches = [];
  rows.forEach((r, i) => {
    if (r.local_team !== VELEZ && r.visitor_team !== VELEZ) return;
    const year = Number(r.date_name.match(/\d{4}/)?.[0]);
    if (!year || year > LAST_YEAR) return;
    matches.push({
      id: `k${i}`,
      year,
      season: r.date_name.replace(/\s+/g, ' ').trim(),
      home: side(r.local_team, r.local_team_id, Number(r.local_result), espnNames, unknown),
      away: side(r.visitor_team, r.visitor_team_id, Number(r.visitor_result), espnNames, unknown),
    });
  });

  if (unknown.size) console.warn('Rivales sin nombre mapeado (se muestran tal cual):', [...unknown].join(', '));
  const out = {
    source: 'Liga Argentina 1931-2023 (Kaggle: ivanramosctes/liga-argentina-1931-2023), licencia ODC-PDDL',
    note: 'Solo Primera División. Sin fechas por partido: se ordena por torneo.',
    matches,
  };
  await writeFile(new URL('../data/historico.json', import.meta.url), JSON.stringify(out));
  console.log(`historico: ${matches.length} partidos de Vélez (${matches[0]?.season} → ${matches.at(-1)?.season})`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});

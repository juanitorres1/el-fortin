// Los alrededores reales del Amalfitani para el estadio 3D (época «hoy»), desde OpenStreetMap (ODbL): calles con su
// ancho, la Autopista Perito Moreno elevada con sus bajadas, las vías del Sarmiento, parques, canchas, playas de
// estacionamiento, edificios con su altura (cuando OSM la tiene) y árboles. Se corre a mano y el resultado va al repo:
//
//   node scripts/import-entorno.mjs              → public/data/entorno.json (pide a Overpass)
//   node scripts/import-entorno.mjs osm.json     → lo mismo, desde una respuesta de Overpass ya bajada
//
// Coordenadas: metros desde el centro de la cancha, girados para que la cancha quede como en la escena (x = a lo largo
// de la cancha, hacia la Popular Este; z = hacia la Platea Sur). El giro sale de la cancha de OSM (mide 105 × 68 m,
// igual que la de la escena). Lo que OSM no tiene (la mayoría de las casas del barrio) lo completa src/lib/barrio.js.
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const OUT = new URL('../public/data/entorno.json', import.meta.url);
const OVERPASS = 'https://overpass-api.de/api/interpreter';
// Centro de la cancha principal (way 310741554) y radio de lo que se baja.
const CENTER = { lat: -34.6353515, lon: -58.5206862 };
const PITCH_WAY = 310741554;
const STADIUM_WAY = 23243149;
const RADIUS = 900;
// Lo que OSM no dice y sí se ve en la foto aérea de feb-2026: las dos canchas al sur de la playa del Este son de piso
// azul (en OSM, `leisure=pitch` sin superficie).
const FIXES = { 1214854979: 'azul', 1214854980: 'azul' };

const QUERY = (r) => `[out:json][timeout:170];
(
  way(around:${r},${CENTER.lat},${CENTER.lon})["building"];
  relation(around:${r},${CENTER.lat},${CENTER.lon})["building"];
  way(around:${r},${CENTER.lat},${CENTER.lon})["highway"];
  way(around:${r},${CENTER.lat},${CENTER.lon})["railway"];
  way(around:${r},${CENTER.lat},${CENTER.lon})["landuse"];
  relation(around:${r},${CENTER.lat},${CENTER.lon})["landuse"];
  way(around:${r},${CENTER.lat},${CENTER.lon})["leisure"];
  relation(around:${r},${CENTER.lat},${CENTER.lon})["leisure"];
  way(around:${r},${CENTER.lat},${CENTER.lon})["natural"];
  way(around:${r},${CENTER.lat},${CENTER.lon})["amenity"~"^(parking|school|hospital)$"];
  node(around:${r},${CENTER.lat},${CENTER.lon})["natural"="tree"];
);
out geom;`;

/** Ancho de calzada (m) por tipo de calle de OSM; las avenidas, por carriles. 0 = no se dibuja. */
const WIDTH = {
  motorway: 0, motorway_link: 7, trunk: 0, primary: 0, primary_link: 7, secondary: 12, secondary_link: 7, tertiary: 10,
  tertiary_link: 7, unclassified: 8, residential: 8.5, living_street: 7, service: 4.5, pedestrian: 5,
};
const LANE = 3.3;
const DECK = 9; // altura de la calzada de la autopista elevada (la escena la dibuja con el mismo número)

/** Proyección plana alrededor del centro, girada `rot` (radianes). Devuelve [x, z] en metros. */
export function projector(rot = 0) {
  const R = 6371008.8;
  const kx = (Math.cos((CENTER.lat * Math.PI) / 180) * R * Math.PI) / 180;
  const ky = (R * Math.PI) / 180;
  const [c, s] = [Math.cos(rot), Math.sin(rot)];
  return ({ lat, lon }) => {
    const x = (lon - CENTER.lon) * kx;
    const z = -(lat - CENTER.lat) * ky; // al sur, positivo
    return [x * c - z * s, x * s + z * c];
  };
}

/** El giro que deja el lado largo de la cancha sobre el eje x. */
export function pitchRotation(geometry) {
  const p = projector(0);
  const pts = geometry.map(p);
  let best = null;
  for (let i = 0; i < pts.length - 1; i++) {
    const [[x0, z0], [x1, z1]] = [pts[i], pts[i + 1]];
    const len = Math.hypot(x1 - x0, z1 - z0);
    if (!best || len > best.len) best = { len, a: Math.atan2(z1 - z0, x1 - x0) };
  }
  let a = -best.a;
  while (a > Math.PI / 2) a -= Math.PI;
  while (a < -Math.PI / 2) a += Math.PI;
  return a;
}

const r1 = (v) => Math.round(v * 10) / 10;
const key = ([x, z]) => `${r1(x)},${r1(z)}`;

/** Douglas-Peucker: saca los puntos que se apartan menos de `tol` metros de la recta. */
export function simplify(pts, tol = 0.4) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [[ax, az], [bx, bz]] = [pts[a], pts[b]];
    const len = Math.hypot(bx - ax, bz - az) || 1e-9;
    let far = -1;
    let dmax = tol;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((bx - ax) * (az - pts[i][1]) - (ax - pts[i][0]) * (bz - az)) / len;
      if (d > dmax) [dmax, far] = [d, i];
    }
    if (far > 0) {
      keep[far] = 1;
      stack.push([a, far], [far, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

const flat = (pts) => pts.flatMap(([x, z]) => [r1(x), r1(z)]);

/** Punto dentro de un polígono [[x, z]] (par-impar). */
export function inside([x, z], poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [[xi, zi], [xj, zj]] = [poly[i], poly[j]];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}

const centroid = (poly) => poly.reduce(([a, b], [x, z]) => [a + x / poly.length, b + z / poly.length], [0, 0]);

/** Altura de un edificio (m): `height`, si no los pisos (3 m cada uno) y si no, según el tipo. null = no se dibuja. */
export function buildingHeight(t) {
  if (t.building === 'roof' || t.building === 'construction' || t.location === 'underground') return null;
  const h = parseFloat(t.height);
  if (h > 0) return h;
  const lv = parseFloat(t['building:levels']);
  if (lv > 0) return lv * 3 + 1;
  return { garage: 3, garages: 3, shed: 3, kiosk: 3, church: 14, school: 9, hospital: 15, apartments: 13, industrial: 8, warehouse: 8, retail: 6, commercial: 7, train_station: 7 }[t.building] ?? 6;
}

/** Qué es cada superficie (o null si no se usa). `club` = terreno de un club, escuela, etc.: no lleva casas ni se pinta. */
export function areaKind(t) {
  if (t.leisure === 'pitch') {
    if (/tennis/.test(t.sport ?? '') && !/hard|concrete|asphalt|acrylic/.test(t.surface ?? '')) return 'tenis';
    if (/grass|artificial_turf/.test(t.surface ?? '') || /soccer|football|rugby/.test(t.sport ?? '')) return 'cesped';
    return 'piso';
  }
  if (t.leisure === 'swimming_pool' || t.natural === 'water' || t.landuse === 'basin') return 'agua';
  if (t.leisure === 'track') return 'pista';
  if (t.leisure === 'playground') return 'arena';
  if (['park', 'garden', 'dog_park'].includes(t.leisure) || ['grass', 'recreation_ground', 'village_green', 'meadow', 'cemetery'].includes(t.landuse) || ['grassland', 'scrub'].includes(t.natural)) return 'verde';
  if (t.landuse === 'forest' || t.natural === 'wood') return 'bosque';
  if (t.amenity === 'parking' && t.parking !== 'underground' && t.parking !== 'multi-storey') return 'playa';
  if (t.landuse === 'railway') return 'vias';
  if (['construction', 'brownfield', 'greenfield'].includes(t.landuse)) return 'tierra';
  if (t.leisure === 'schoolyard') return 'piso';
  if (['sports_centre', 'stadium'].includes(t.leisure) || ['industrial', 'education', 'religious'].includes(t.landuse) || ['school', 'hospital'].includes(t.amenity)) return 'club';
  return null;
}

/** Los anillos exteriores de un way cerrado o de una relación (multipolígono). */
function rings(e, P) {
  if (e.type === 'way') return e.geometry?.length > 3 ? [e.geometry.map(P)] : [];
  // Une los tramos exteriores en anillos cerrados.
  const parts = (e.members ?? []).filter((m) => m.role === 'outer' && m.geometry?.length > 1).map((m) => m.geometry.map(P));
  const out = [];
  const same = (a, b) => Math.abs(a[0] - b[0]) < 0.01 && Math.abs(a[1] - b[1]) < 0.01;
  while (parts.length) {
    let ring = parts.shift();
    let grown = true;
    while (!same(ring[0], ring.at(-1)) && grown) {
      grown = false;
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        if (same(ring.at(-1), p[0])) ring = ring.concat(p.slice(1));
        else if (same(ring.at(-1), p.at(-1))) ring = ring.concat(p.slice(0, -1).reverse());
        else continue;
        parts.splice(i, 1);
        grown = true;
        break;
      }
    }
    if (ring.length > 3) out.push(ring);
  }
  return out;
}

/**
 * La altura de cada punto de una calle: lo que es puente va a DECK; las bajadas van de DECK a 0 entre el punto que
 * toca la autopista y el que toca el piso. `level` = alturas conocidas por punto (clave "x,z", ver `key`).
 */
export function rampHeights(pts, { bridge, level }) {
  if (bridge) return pts.map(() => DECK);
  const known = pts.map((p) => level.get(key(p)) ?? null);
  if (known.every((v) => v == null)) return pts.map(() => 0);
  const dist = [0];
  for (let i = 1; i < pts.length; i++) dist.push(dist[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const idx = known.map((v, i) => (v == null ? -1 : i)).filter((i) => i >= 0);
  return pts.map((_, i) => {
    if (known[i] != null) return known[i];
    const a = idx.filter((j) => j < i).at(-1);
    const b = idx.find((j) => j > i);
    if (a == null) return known[b];
    if (b == null) return known[a];
    return known[a] + ((known[b] - known[a]) * (dist[i] - dist[a])) / (dist[b] - dist[a]);
  });
}

/** Ancho total de una calle según sus etiquetas (la calzada; sin veredas). */
export function roadWidth(t) {
  const w = parseFloat(t.width);
  if (w > 0) return w;
  const lanes = parseInt(t.lanes, 10);
  if (['motorway', 'trunk', 'primary', 'secondary'].includes(t.highway)) return (lanes > 0 ? lanes : 2) * LANE + 1;
  return WIDTH[t.highway] ?? 0;
}

/** De la respuesta de Overpass al entorno de la escena. */
export function buildEntorno(osm, date = new Date().toISOString().slice(0, 10)) {
  const els = osm.elements;
  const pitch = els.find((e) => e.id === PITCH_WAY);
  if (!pitch) throw new Error('Falta la cancha del Amalfitani en la respuesta');
  const rot = pitchRotation(pitch.geometry);
  const P = projector(rot);
  const stadium = els.find((e) => e.id === STADIUM_WAY)?.geometry.map(P) ?? [];
  const inStadium = (p) => stadium.length > 3 && inside(p, stadium);

  const calles = [];
  const vias = [];
  const areas = [];
  const edificios = [];
  const arboles = [];
  // Un cartel por calle con nombre: en su punto más cercano al estadio (entre todos sus tramos), a la altura de la calzada.
  const nombres = new Map();
  const name = (n, tipo, pts, heights) => pts.forEach((p, i) => {
    const d = Math.hypot(p[0], p[1]);
    if (!nombres.has(n) || d < nombres.get(n).d) nombres.set(n, { d, tipo, p, alto: heights?.[i] ?? 0 });
  });

  // Primero, la altura de los puntos que se saben: arriba, todo lo que es puente de la autopista (y sus bajadas en
  // puente); en el piso, las calles comunes. Después, las bajadas que no son puente van de una altura a la otra: se
  // repite unas vueltas porque una bajada puede estar partida en varios tramos.
  const level = new Map();
  const ways = els.filter((e) => e.type === 'way' && e.tags?.highway && e.geometry);
  const isRamp = (t) => /^motorway/.test(t.highway) && !t.bridge;
  for (const e of ways) {
    const t = e.tags;
    if (/^motorway/.test(t.highway) || t.bridge || parseInt(t.layer, 10) > 0) continue;
    for (const p of e.geometry.map(P)) level.set(key(p), 0);
  }
  for (const e of ways) if (/^motorway/.test(e.tags.highway) && e.tags.bridge) for (const p of e.geometry.map(P)) level.set(key(p), DECK);
  for (let pass = 0; pass < 4; pass++) {
    for (const e of ways) {
      if (!isRamp(e.tags)) continue;
      const pts = simplify(e.geometry.map(P));
      const hs = rampHeights(pts, { bridge: false, level });
      for (const i of [0, pts.length - 1]) if (!level.has(key(pts[i])) && hs.some((h) => h > 0)) level.set(key(pts[i]), hs[i]);
    }
  }

  for (const e of els) {
    const t = e.tags ?? {};
    if (e.type === 'node') {
      if (t.natural === 'tree') {
        const p = P(e);
        if (!inStadium(p)) arboles.push(r1(p[0]), r1(p[1]));
      }
      continue;
    }
    if (t.building) {
      const h = buildingHeight(t);
      if (h == null) continue;
      for (const ring of rings(e, P)) {
        if (inStadium(centroid(ring))) continue; // al estadio lo dibuja la escena
        edificios.push([r1(h), flat(simplify(ring.slice(0, -1), 0.2))]);
      }
      continue;
    }
    if (t.highway && e.type === 'way' && e.geometry) {
      if (t.tunnel === 'yes' || parseInt(t.layer, 10) < 0 || t.area === 'yes') continue;
      const pts = simplify(e.geometry.map(P));
      const motorway = /^motorway/.test(t.highway);
      const w = roadWidth(t);
      if (!w) continue;
      const heights = motorway ? rampHeights(pts, { bridge: !!t.bridge, level }) : null;
      const tipo = motorway ? 'autopista' : ['primary', 'secondary', 'trunk'].includes(t.highway) ? 'avenida' : /service|pedestrian/.test(t.highway) ? 'servicio' : 'calle';
      const row = [tipo, r1(w), flat(pts)];
      if (heights?.some((h) => h > 0)) row.push(heights.map(r1));
      calles.push(row);
      if (t.name && !/service/.test(t.highway)) name(t.name, tipo, pts, heights);
      continue;
    }
    if (t.railway === 'rail' && e.geometry && t.tunnel !== 'yes' && !(parseInt(t.layer, 10) < 0)) {
      const pts = simplify(e.geometry.map(P), 0.3);
      vias.push(flat(pts));
      if (t.name) name(t.name, 'tren', pts);
      continue;
    }
    if (e.id === PITCH_WAY) continue; // el estadio queda como `club`: sin casas encima
    const kind = FIXES[e.id] ?? areaKind(t);
    if (kind) for (const ring of rings(e, P)) areas.push([kind, flat(simplify(ring.slice(0, -1), 0.3))]);
  }

  const carteles = [...nombres].sort((a, b) => a[1].d - b[1].d).map(([n, { tipo, p, alto }]) => [n, tipo, r1(p[0]), r1(p[1]), r1(alto)]);

  // Lo más grande primero: así los pisos chicos (canchas, piletas) quedan arriba de los parques al dibujar.
  const area = (f) => {
    let s = 0;
    for (let i = 0; i < f.length; i += 2) {
      const j = (i + 2) % f.length;
      s += f[i] * f[j + 1] - f[j] * f[i + 1];
    }
    return Math.abs(s / 2);
  };
  areas.sort((a, b) => area(b[1]) - area(a[1]));

  return {
    fuente: '© colaboradores de OpenStreetMap',
    licencia: 'ODbL 1.0 (openstreetmap.org/copyright)',
    fecha: date,
    origen: { lat: CENTER.lat, lon: CENTER.lon, giro: Math.round((rot * 180 / Math.PI) * 100) / 100 },
    radio: RADIUS,
    calles,
    vias,
    areas,
    edificios,
    arboles,
    carteles,
  };
}

/** Overpass suele estar lleno (502/429): reintenta con espera creciente, alternando con un espejo. */
export async function overpass() {
  const servers = [OVERPASS, 'https://overpass.private.coffee/api/interpreter'];
  let last;
  for (let i = 0; i < 6; i++) {
    const res = await fetch(servers[i % servers.length], {
      method: 'POST',
      headers: { 'User-Agent': 'fan-site-data-import/1.0', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(QUERY(RADIUS))}`,
    }).catch((err) => ({ ok: false, status: err.message, text: async () => '' }));
    if (res.ok) return res.json();
    last = `Overpass ${res.status}: ${(await res.text()).slice(0, 200)}`;
    console.warn(`${last.split('\n')[0]} · reintento ${i + 1}`);
    await new Promise((r) => setTimeout(r, 5000 * 2 ** i));
  }
  throw new Error(last);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const osm = process.argv[2] ? JSON.parse(await readFile(process.argv[2], 'utf8')) : await overpass();
  const entorno = buildEntorno(osm, osm.osm3s?.timestamp_osm_base?.slice(0, 10));
  await writeFile(OUT, `${JSON.stringify(entorno)}\n`);
  const n = (k) => entorno[k].length;
  console.log(`entorno.json: giro ${entorno.origen.giro}°, ${n('calles')} calles, ${n('vias')} vías, ${n('areas')} áreas, ${n('edificios')} edificios, ${n('arboles') / 2} árboles, ${n('carteles')} carteles`);
}

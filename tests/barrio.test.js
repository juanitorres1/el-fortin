// El barrio real del estadio 3D: el importador de OpenStreetMap (scripts/import-entorno.mjs), los datos que quedaron en
// public/data/entorno.json y las casas y árboles que completan las manzanas (src/lib/barrio.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { corners, fillBarrio, inPolygon, overlaps, pairs, segDist } from '../src/lib/barrio.js';
import { areaKind, buildEntorno, buildingHeight, pitchRotation, rampHeights, roadWidth, simplify } from '../scripts/import-entorno.mjs';

const entorno = JSON.parse(readFileSync(new URL('../public/data/entorno.json', import.meta.url), 'utf8'));

test('entorno.json: lo que se sabe del lugar (Juan B. Justo al norte; la AU6 y, más al sur, el Sarmiento)', () => {
  assert.match(entorno.fuente, /OpenStreetMap/);
  assert.match(entorno.licencia, /ODbL/);
  const at = (name) => entorno.carteles.find(([n]) => n === name);
  const [justo, au6, tren] = ['Avenida Juan Bautista Justo', 'Autopista Perito Moreno', 'FC Sarmiento'].map(at);
  assert.ok(justo && au6 && tren, 'están las tres');
  assert.ok(justo[3] < -100, 'Juan B. Justo, del lado de la Norte');
  assert.ok(au6[3] > 90 && au6[4] > 5, 'la autopista, del lado de la Sur y elevada');
  assert.ok(tren[3] > au6[3], 'las vías, más allá de la autopista');
  // El giro deja la cancha de OSM alineada con la de la escena (unos 8° respecto de los puntos cardinales).
  assert.ok(Math.abs(entorno.origen.giro - 8.4) < 1);
  for (const [tipo, w, f, hs] of entorno.calles) {
    assert.ok(w > 0 && f.length >= 4 && f.length % 2 === 0, `${tipo}: ancho y puntos`);
    if (hs) assert.equal(hs.length, f.length / 2, 'una altura por punto');
  }
});

test('importador: giro de la cancha, anchos, alturas y superficies', () => {
  // Un rectángulo de 105 × 68 girado 10°: el giro lo vuelve a poner sobre el eje x.
  const lat0 = -34.6353515;
  const lon0 = -58.5206862;
  const kx = (Math.cos((lat0 * Math.PI) / 180) * 6371008.8 * Math.PI) / 180;
  const ky = (6371008.8 * Math.PI) / 180;
  const a = (10 * Math.PI) / 180;
  const pt = (x, z) => {
    const [rx, rz] = [x * Math.cos(a) - z * Math.sin(a), x * Math.sin(a) + z * Math.cos(a)];
    return { lon: lon0 + rx / kx, lat: lat0 - rz / ky };
  };
  const rect = [[-52.5, -34], [52.5, -34], [52.5, 34], [-52.5, 34], [-52.5, -34]].map(([x, z]) => pt(x, z));
  assert.ok(Math.abs(pitchRotation(rect) + a) < 1e-3);

  assert.equal(roadWidth({ highway: 'primary', lanes: '3' }), 3 * 3.3 + 1);
  assert.equal(roadWidth({ highway: 'residential', width: '11' }), 11);
  assert.equal(roadWidth({ highway: 'footway' }), 0, 'las veredas no se dibujan');
  assert.equal(buildingHeight({ building: 'yes', height: '20' }), 20);
  assert.equal(buildingHeight({ building: 'yes', 'building:levels': '4' }), 13);
  assert.equal(buildingHeight({ building: 'roof' }), null);
  assert.equal(areaKind({ leisure: 'pitch', sport: 'tennis' }), 'tenis');
  assert.equal(areaKind({ leisure: 'pitch', sport: 'tennis', surface: 'acrylic' }), 'piso');
  assert.equal(areaKind({ amenity: 'parking' }), 'playa');
  assert.equal(areaKind({ amenity: 'parking', parking: 'underground' }), null);
  assert.equal(areaKind({ landuse: 'residential' }), null, 'las manzanas no se pintan: ahí van las casas');

  // Una bajada: de la autopista (9 m) al piso, repartida por distancia.
  const level = new Map([['0,0', 9], ['30,0', 0]]);
  assert.deepEqual(rampHeights([[0, 0], [10, 0], [30, 0]], { bridge: false, level }), [9, 6, 0]);
  assert.deepEqual(rampHeights([[0, 0], [5, 0]], { bridge: true, level: new Map() }), [9, 9]);
  assert.deepEqual(simplify([[0, 0], [5, 0.1], [10, 0]]), [[0, 0], [10, 0]]);
});

test('importador: de una respuesta de Overpass chica al entorno', () => {
  const g = (pts) => pts.map(([lat, lon]) => ({ lat, lon }));
  const c = { lat: -34.6353515, lon: -58.5206862 };
  const d = 0.0005;
  const osm = {
    elements: [
      { type: 'way', id: 310741554, tags: { leisure: 'pitch' }, geometry: g([[c.lat, c.lon - 0.00057], [c.lat, c.lon + 0.00057], [c.lat - 0.0003, c.lon + 0.00057], [c.lat - 0.0003, c.lon - 0.00057], [c.lat, c.lon - 0.00057]]) },
      { type: 'way', id: 23243149, tags: { leisure: 'stadium' }, geometry: g([[c.lat + d, c.lon - d], [c.lat + d, c.lon + d], [c.lat - d, c.lon + d], [c.lat - d, c.lon - d], [c.lat + d, c.lon - d]]) },
      { type: 'way', id: 1, tags: { building: 'yes' }, geometry: g([[c.lat, c.lon], [c.lat, c.lon + 0.0001], [c.lat + 0.0001, c.lon + 0.0001], [c.lat, c.lon]]) },
      { type: 'way', id: 2, tags: { building: 'yes', 'building:levels': '2' }, geometry: g([[c.lat + 0.003, c.lon], [c.lat + 0.003, c.lon + 0.0001], [c.lat + 0.0031, c.lon + 0.0001], [c.lat + 0.003, c.lon]]) },
      { type: 'way', id: 3, tags: { highway: 'residential', name: 'Barragán' }, geometry: g([[c.lat + 0.002, c.lon - 0.002], [c.lat + 0.002, c.lon + 0.002]]) },
      { type: 'way', id: 4, tags: { highway: 'footway' }, geometry: g([[c.lat + 0.002, c.lon], [c.lat + 0.0025, c.lon]]) },
      { type: 'way', id: 5, tags: { highway: 'motorway', bridge: 'yes', lanes: '3', name: 'Autopista Perito Moreno' }, geometry: g([[c.lat - 0.002, c.lon - 0.002], [c.lat - 0.002, c.lon + 0.002]]) },
      { type: 'node', id: 6, tags: { natural: 'tree' }, lat: c.lat + 0.004, lon: c.lon },
    ],
  };
  const e = buildEntorno(osm, '2026-11-16');
  assert.equal(e.fecha, '2026-11-16');
  assert.equal(e.edificios.length, 1, 'el edificio dentro del estadio no va (lo dibuja la escena)');
  assert.equal(e.edificios[0][0], 7);
  assert.equal(e.calles.length, 2, 'la vereda no va');
  const au6 = e.calles.find(([t]) => t === 'autopista');
  assert.deepEqual(au6[3], [9, 9]);
  assert.ok(e.carteles.some(([n]) => n === 'Barragán'));
  assert.equal(e.arboles.length, 2);
  assert.ok(e.areas.some(([k]) => k === 'club'), 'el estadio queda como terreno sin casas');
});

test('barrio: las casas van en las manzanas, sin pisar calles, edificios, parques ni el estadio', () => {
  const keepOut = (x, z) => x > -96 && x < 96 && z > -121 && z < 104;
  const b = fillBarrio(entorno, { keepOut });
  assert.deepEqual(fillBarrio(entorno, { keepOut }), b, 'siempre sale igual');
  assert.ok(b.casas.length > 2000 && b.casas.length < 6000, `${b.casas.length} casas`);
  assert.ok(b.arboles.length > 2000 && b.arboles.length < 6000, `${b.arboles.length} árboles`);
  const segs = entorno.calles.flatMap(([, w, f]) => pairs(f).slice(1).map((p, i, a) => [i ? a[i - 1] : pairs(f)[0], p, w / 2]));
  const polys = [...entorno.areas.map(([, f]) => pairs(f)), ...entorno.edificios.map(([, f]) => pairs(f))];
  for (const [x, z, w, d, , rot] of b.casas.filter((_, i) => i % 7 === 0)) {
    assert.ok(!keepOut(x, z), 'fuera del estadio');
    // Con 0,3 m de tolerancia: las medidas guardadas están redondeadas.
    for (const [px, pz] of [[x, z], ...corners(x, z, w - 0.6, d - 0.6, rot)]) {
      assert.ok(segs.every(([[ax, az], [bx, bz], half]) => segDist(px, pz, ax, az, bx, bz) >= half), `casa en (${x}, ${z}) sobre una calle`);
      assert.ok(polys.every((poly) => !inPolygon(px, pz, poly)), `casa en (${x}, ${z}) dentro de un área o edificio`);
    }
  }
  // Ninguna casa pisa a otra (se comparan las vecinas).
  const C = b.casas.map(([x, z, w, d, , rot]) => ({ x, z, c: corners(x, z, w, d, rot) }));
  for (let i = 0; i < C.length; i += 5) {
    for (const o of C) if (o !== C[i] && Math.hypot(o.x - C[i].x, o.z - C[i].z) < 12) assert.ok(!overlaps(o.c, C[i].c), `casas pisadas en (${C[i].x}, ${C[i].z})`);
  }
});

test('barrio: rectángulos girados', () => {
  const a = corners(0, 0, 10, 4, 0);
  assert.deepEqual(a.map((p) => p.map((v) => Math.round(v * 10) / 10 + 0)), [[-5, -2], [5, -2], [5, 2], [-5, 2]]);
  assert.ok(overlaps(a, corners(9, 0, 10, 4, 0)));
  assert.ok(!overlaps(a, corners(11, 0, 10, 4, 0)));
  assert.ok(!overlaps(a, corners(0, 5, 10, 4, Math.PI / 2 * 0)), 'arriba, sin tocarse');
  assert.ok(overlaps(a, corners(0, 3, 10, 4, Math.PI / 2)), 'girada, se cruzan');
});

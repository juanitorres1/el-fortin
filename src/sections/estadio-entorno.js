// Los alrededores reales del Amalfitani en la época «hoy»: lo que dice OpenStreetMap (data/entorno.json, ver
// scripts/import-entorno.mjs) más las casas y los árboles genéricos que completan las manzanas (lib/barrio.js).
// Todo va en pocas mallas: una con todos los pisos (parques, canchas, playas), una por material de calle, una con los
// edificios de OSM, las casas y los autos instanciados. Lo llama estadio-scene.js; no carga nada por su cuenta.
import * as THREE from 'three';
import { fillBarrio, inPolygon, pairs } from '../lib/barrio.js';

// Pisos de OSM: color (sRGB) y altura sobre el terreno (lo chico, arriba de lo grande; separados para que no titilen).
const AREA = {
  verde: [0x6f8f4e, 0.05], bosque: [0x5a7741, 0.05], tierra: [0x9a8b70, 0.05], vias: [0x857a6c, 0.05],
  playa: [0x7c8189, 0.08], piso: [0x8d9196, 0.1], arena: [0xc9b48a, 0.1], azul: [0x2f74c0, 0.11],
  cesped: [0x4f8a3a, 0.12], tenis: [0xc9703f, 0.12], pista: [0xb5503f, 0.12], agua: [0x4db3d9, 0.14],
};
const ROAD_Y = { servicio: 0.15, calle: 0.18, avenida: 0.21, autopista: 0.21 };
// Carteles: las vías grandes siempre; las calles, solo las que pasan cerca del estadio.
const SHORT = { 'Avenida Juan Bautista Justo': 'Av. Juan B. Justo', 'Autopista Perito Moreno': 'Autopista Perito Moreno (AU6)', 'FC Sarmiento': 'Tren Sarmiento', 'Avenida Álvarez Jonte': 'Av. Álvarez Jonte', 'Avenida Rivadavia': 'Av. Rivadavia' };
const CERCA = 170;
const SHADOW_R = 230; // más lejos, la sombra del sol no llega (ver la cámara de sombras de la escena)

/**
 * Agrega el entorno a la escena. `ctx`: lo que presta la escena (scene, keep, mat, unitBox, houseMat, bldMat,
 * laneTex y `keepOut(x, z)`, donde no va nada porque está el estadio). Devuelve los carteles de calles
 * ([texto, [x, y, z]]) y los árboles ([x, z, radio]) para que la escena los dibuje con los suyos.
 */
export function drawEntorno(entorno, ctx) {
  const { scene, keep, mat, unitBox, houseMat, bldMat, laneTex, keepOut } = ctx;
  const meshOf = (geo, material, { cast = false } = {}) => {
    const m = new THREE.Mesh(keep(geo), material);
    m.castShadow = cast;
    m.receiveShadow = true;
    scene.add(m);
    return m;
  };
  const color = new THREE.Color();

  // Pisos: todos los polígonos en una sola malla con color por vértice.
  {
    const pos = [];
    const col = [];
    for (const [kind, f] of entorno.areas) {
      if (!AREA[kind]) continue;
      const [c, y] = AREA[kind];
      color.set(c);
      const ring = pairs(f);
      const tris = THREE.ShapeUtils.triangulateShape(ring.map(([x, z]) => new THREE.Vector2(x, z)), []);
      for (const t of tris) {
        // Cara hacia arriba: (b - a) × (c - a) con y > 0.
        const [a, b, d] = t.map((k) => ring[k]);
        const up = (b[1] - a[1]) * (d[0] - a[0]) - (b[0] - a[0]) * (d[1] - a[1]) > 0;
        for (const [x, z] of up ? [a, b, d] : [a, d, b]) {
          pos.push(x, y, z);
          col.push(color.r, color.g, color.b);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.computeVertexNormals();
    meshOf(geo, mat(0xffffff, { vertexColors: true, roughness: 0.95 }));
  }

  // Calles: cintas a lo largo de cada tramo, con el ancho de OSM. La autopista elevada y sus bajadas llevan la altura
  // de cada punto; abajo, la losa, los costados (con baranda) y las pilas.
  const strips = { textured: [[], []], calle: [[], []], servicio: [[], []], concrete: [[], []] };
  const piers = [];
  const cars = [];
  /** Agrega a `into` la cinta entre dos bordes (distancia al eje e y de cada uno, por punto). */
  const ribbon = (into, pts, offA, yA, offB, yB) => {
    const [pos, uv] = into;
    let dist = 0;
    const normals = pts.map((p, i) => {
      const prev = pts[Math.max(0, i - 1)];
      const next = pts[Math.min(pts.length - 1, i + 1)];
      const [dx, dz] = [next[0] - prev[0], next[1] - prev[1]];
      const l = Math.hypot(dx, dz) || 1;
      return [-dz / l, dx / l];
    });
    for (let i = 0; i < pts.length - 1; i++) {
      const seg = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
      const v = (k, off, y) => [pts[k][0] + normals[k][0] * off, y(k), pts[k][1] + normals[k][1] * off];
      const [a0, a1, b0, b1] = [v(i, offA, yA), v(i, offB, yB), v(i + 1, offA, yA), v(i + 1, offB, yB)];
      const [u0, u1] = [dist / 125, (dist + seg) / 125];
      pos.push(...a0, ...b0, ...a1, ...a1, ...b0, ...b1);
      uv.push(u0, 0, u1, 0, u0, 1, u0, 1, u1, 0, u1, 1);
      dist += seg;
    }
  };
  for (const [tipo, w, f, hs] of entorno.calles) {
    const pts = pairs(f);
    if (pts.length < 2) continue;
    const y0 = ROAD_Y[tipo] ?? 0.18;
    const h = (i) => (hs ? hs[i] : 0);
    const into = tipo === 'autopista' || tipo === 'avenida' ? strips.textured : strips[tipo] ?? strips.calle;
    ribbon(into, pts, -w / 2, (i) => h(i) + y0, w / 2, (i) => h(i) + y0);
    if (hs) {
      const below = (i) => Math.max(0.05, h(i) - 1.6);
      ribbon(strips.concrete, pts, -w / 2 - 0.4, below, w / 2 + 0.4, below);
      for (const side of [-1, 1]) ribbon(strips.concrete, pts, side * (w / 2 + 0.4), below, side * (w / 2 + 0.4), (i) => h(i) + 1);
      // Una pila cada ~28 m donde la calzada va alta.
      let next = 0;
      let dist = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        const [[ax, az], [bx, bz]] = [pts[i], pts[i + 1]];
        const seg = Math.hypot(bx - ax, bz - az);
        while (next <= dist + seg) {
          const t = (next - dist) / seg;
          const top = h(i) + (h(i + 1) - h(i)) * t - 1.6;
          if (top > 2) piers.push([ax + (bx - ax) * t, top / 2, az + (bz - az) * t, 1.6, top, w * 0.55, -Math.atan2(bz - az, bx - ax)]);
          next += 28;
        }
        dist += seg;
      }
    }
    // Autos en las avenidas y la autopista: uno cada 15 a 55 m por carril (todas las calzadas de OSM son de una mano).
    if (tipo === 'avenida' || tipo === 'autopista') {
      const lanes = Math.max(1, Math.round((w - 1) / 3.3));
      for (let k = 0; k < lanes; k++) {
        const off = -w / 2 + 0.5 + 3.3 * (k + 0.5);
        let gap = ((k * 37 + f.length * 13) % 40) + 5;
        for (let i = 0; i < pts.length - 1; i++) {
          const [[ax, az], [bx, bz]] = [pts[i], pts[i + 1]];
          const seg = Math.hypot(bx - ax, bz - az);
          const [ux, uz] = [(bx - ax) / seg, (bz - az) / seg];
          for (; gap < seg; gap += 15 + ((gap * 7919) % 40)) {
            const t = gap / seg;
            cars.push([ax + ux * gap - uz * off, h(i) + (h(i + 1) - h(i)) * t + y0 + 0.72, az + uz * gap + ux * off, -Math.atan2(uz, ux)]);
          }
          gap -= seg;
        }
      }
    }
  }
  // Vías del tren: un balasto de 3,2 m por vía.
  for (const f of entorno.vias) {
    const pts = pairs(f);
    if (pts.length > 1) ribbon(strips.servicio, pts, -1.6, () => 0.13, 1.6, () => 0.13);
  }
  const stripGeo = ([pos, uv]) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.computeVertexNormals();
    return geo;
  };
  meshOf(stripGeo(strips.textured), mat(0xffffff, { map: laneTex, side: THREE.DoubleSide, roughness: 0.85 }));
  meshOf(stripGeo(strips.calle), mat(0x575b61, { side: THREE.DoubleSide, roughness: 0.9 }));
  meshOf(stripGeo(strips.servicio), mat(0x6f6a62, { side: THREE.DoubleSide, roughness: 1 }));
  meshOf(stripGeo(strips.concrete), mat(0x9aa1aa, { side: THREE.DoubleSide }), { cast: true });
  if (piers.length) {
    const m = new THREE.InstancedMesh(unitBox, mat(0xa9b0b8), piers.length);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    piers.forEach(([x, y, z, sx, sy, sz, r], i) => m.setMatrixAt(i, m4.compose(new THREE.Vector3(x, y, z), q.setFromAxisAngle(up, r), new THREE.Vector3(sx, sy, sz))));
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
  }

  // Edificios de OSM: paredes y techo plano, con la altura de OSM (o la estimada por tipo). Los cercanos tiran sombra.
  {
    const sets = [{ pos: [], col: [] }, { pos: [], col: [] }];
    let seed = 5;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (const [h, f] of entorno.edificios) {
      let ring = pairs(f);
      let area = 0;
      for (let i = 0; i < ring.length; i++) {
        const [a, b] = [ring[i], ring[(i + 1) % ring.length]];
        area += a[0] * b[1] - b[0] * a[1];
      }
      if (area > 0) ring = ring.reverse(); // así las paredes miran hacia afuera
      const [cx, cz] = ring.reduce(([a, b], [x, z]) => [a + x / ring.length, b + z / ring.length], [0, 0]);
      const set = sets[Math.hypot(cx, cz) < SHADOW_R ? 0 : 1];
      // Altos: hormigón claro; galpones: chapa gris; casas: el mismo abanico que las genéricas.
      if (h >= 12) color.setHSL(0.08, 0.06, 0.74 + rnd() * 0.1, THREE.SRGBColorSpace);
      else if (Math.abs(area) / 2 > 1500) color.setHSL(0.58, 0.04, 0.68 + rnd() * 0.08, THREE.SRGBColorSpace);
      else color.setHSL(0.07 + rnd() * 0.05, 0.08, 0.58 + rnd() * 0.15, THREE.SRGBColorSpace);
      const push = (...ps) => ps.forEach(([x, y, z]) => {
        set.pos.push(x, y, z);
        set.col.push(color.r, color.g, color.b);
      });
      for (let i = 0; i < ring.length; i++) {
        const [a, b] = [ring[i], ring[(i + 1) % ring.length]];
        push([a[0], 0, a[1]], [b[0], 0, b[1]], [b[0], h, b[1]], [a[0], 0, a[1]], [b[0], h, b[1]], [a[0], h, a[1]]);
      }
      for (const t of THREE.ShapeUtils.triangulateShape(ring.map(([x, z]) => new THREE.Vector2(x, z)), [])) {
        const [a, b, d] = t.map((k) => ring[k]);
        const up = (b[1] - a[1]) * (d[0] - a[0]) - (b[0] - a[0]) * (d[1] - a[1]) > 0;
        for (const [x, z] of up ? [a, b, d] : [a, d, b]) push([x, h, z]);
      }
    }
    sets.forEach(({ pos, col }, i) => {
      if (!pos.length) return;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      geo.computeVertexNormals();
      meshOf(geo, bldMat, { cast: i === 0 });
    });
  }

  // Las manzanas: casas genéricas sobre las calles reales y los árboles (lib/barrio.js).
  const { casas, arboles } = fillBarrio(entorno, { keepOut });
  {
    const near = casas.filter(([x, z]) => Math.hypot(x, z) < SHADOW_R);
    const farH = casas.filter(([x, z]) => Math.hypot(x, z) >= SHADOW_R);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    // La caja sin la cara de abajo (no se ve nunca): 10 triángulos por casa en vez de 12.
    const box = keep(new THREE.BoxGeometry(1, 1, 1));
    box.setIndex([...box.index.array].filter((_, i) => i < 18 || i >= 24));
    box.clearGroups();
    [near, farH].forEach((list, k) => {
      if (!list.length) return;
      const mesh = new THREE.InstancedMesh(box, houseMat, list.length);
      list.forEach(([x, z, w, d, h, rot, t], i) => {
        mesh.setMatrixAt(i, m4.compose(new THREE.Vector3(x, h / 2, z), q.setFromAxisAngle(up, -rot), new THREE.Vector3(w, h, d)));
        // En sRGB (si no, three toma los valores como lineales y todo sale lavado). Una de cada cinco, techo de teja.
        mesh.setColorAt(i, t < 0.2 ? color.setHSL(0.045, 0.22, 0.5 + t, THREE.SRGBColorSpace) : color.setHSL(0.07 + t * 0.05, 0.06, 0.55 + ((t * 7) % 1) * 0.2, THREE.SRGBColorSpace));
      });
      mesh.castShadow = k === 0;
      mesh.receiveShadow = true;
      scene.add(mesh);
    });
  }

  // Autos estacionados en las playas: filas cada 2,7 m, no todos los lugares ocupados.
  let seed = 3;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const parked = [];
  for (const [kind, f] of entorno.areas) {
    if (kind !== 'playa') continue;
    const ring = pairs(f);
    const xs = ring.map((p) => p[0]);
    const zs = ring.map((p) => p[1]);
    for (let x = Math.min(...xs) + 4; x < Math.max(...xs) - 2; x += 6) {
      for (let z = Math.min(...zs) + 2; z < Math.max(...zs) - 2; z += 2.7) {
        if (rnd() < 0.3 && inPolygon(x, z, ring)) parked.push([x, 0.8, z, 0]);
      }
    }
  }
  // Tope de autos: los de la calle se ralean parejo (uno de cada k) para no dejar tramos vacíos.
  const spread = (a, n) => (a.length <= n ? a : a.filter((_, i) => i % Math.ceil(a.length / n) === 0));
  const list = [...spread(parked, 260), ...spread(cars.filter(([x, , z]) => Math.hypot(x, z) < 700), 440)];
  if (list.length) {
    const paint = [0xf2f2f2, 0xd9dcdf, 0x9ea4ab, 0x2b2f36, 0x1c1f24, 0xa32a2a, 0x25508f, 0xf2f2f2, 0x7c8590];
    const m = new THREE.InstancedMesh(keep(new THREE.BoxGeometry(4.3, 1.4, 1.8)), mat(0xffffff, { roughness: 0.35, metalness: 0.3 }), list.length);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const one = new THREE.Vector3(1, 1, 1);
    list.forEach(([x, y, z, r], i) => {
      m.setMatrixAt(i, m4.compose(new THREE.Vector3(x, y, z), q.setFromAxisAngle(up, r), one));
      m.setColorAt(i, color.set(paint[Math.floor(rnd() * paint.length)]));
    });
    m.receiveShadow = true;
    scene.add(m);
  }

  // «Avenida Álvarez Jonte» y «Álvarez Jonte» son la misma calle (OSM la nombra distinto por tramo): un cartel.
  const same = (n) => n.replace(/^Avenida /, '');
  const labels = entorno.carteles
    .filter(([n, tipo, x, z]) => SHORT[n] || (tipo !== 'tren' && Math.hypot(x, z) < CERCA))
    .filter(([n], i, all) => all.findIndex(([m]) => same(m) === same(n)) === i)
    .map(([n, , x, z, alto]) => [SHORT[n] ?? n, [x, alto + 3, z]]);
  return { labels, trees: arboles };
}


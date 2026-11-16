// El barrio alrededor del estadio 3D a partir de los datos reales de data/entorno.json (OpenStreetMap, ver
// scripts/import-entorno.mjs). OSM tiene las calles, las vías, los parques y unos 300 edificios, pero casi ninguna
// casa: acá se completan las manzanas con casas genéricas sobre las calles reales (lotes de 8,66 m de frente, como
// el loteo porteño, con 3 m de vereda), árboles de vereda y árboles en los parques. Es inferencia: las casas no son
// las de verdad, pero están donde hay manzanas de verdad. Sin React ni Three: se prueba en tests/barrio.test.js.

const LOT = 8.66; // frente del lote porteño típico
const VEREDA = 3;
const LEJOS = 400;

/** Generador pseudoaleatorio con semilla fija (el barrio sale siempre igual). */
export function seeded(seed = 1) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/** [x0, z0, x1, z1, ...] → [[x, z], ...] */
export const pairs = (f) => {
  const out = [];
  for (let i = 0; i < f.length; i += 2) out.push([f[i], f[i + 1]]);
  return out;
};

/** Punto dentro de un polígono [[x, z]] (par-impar). */
export function inPolygon(x, z, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}

/** Distancia de un punto a un segmento. */
export function segDist(x, z, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz || 1e-9;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
  return Math.hypot(x - ax - t * dx, z - az - t * dz);
}

/** Índice espacial simple: celdas de `size` metros con lo que toca cada una (por su caja). */
function grid(size = 24) {
  const cells = new Map();
  const k = (i, j) => i * 100003 + j;
  return {
    add(item, x0, z0, x1, z1) {
      for (let i = Math.floor(x0 / size); i <= Math.floor(x1 / size); i++) {
        for (let j = Math.floor(z0 / size); j <= Math.floor(z1 / size); j++) {
          const key = k(i, j);
          if (!cells.has(key)) cells.set(key, []);
          cells.get(key).push(item);
        }
      }
    },
    near(x, z, r = 0) {
      const out = new Set();
      for (let i = Math.floor((x - r) / size); i <= Math.floor((x + r) / size); i++) {
        for (let j = Math.floor((z - r) / size); j <= Math.floor((z + r) / size); j++) for (const it of cells.get(k(i, j)) ?? []) out.add(it);
      }
      return out;
    },
  };
}

const bbox = (poly) => poly.reduce(([a, b, c, d], [x, z]) => [Math.min(a, x), Math.min(b, z), Math.max(c, x), Math.max(d, z)], [Infinity, Infinity, -Infinity, -Infinity]);

/** Las cuatro esquinas de un rectángulo girado (centro, medidas, ángulo). */
export function corners(x, z, w, d, rot) {
  const [c, s] = [Math.cos(rot), Math.sin(rot)];
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [x + (a * w * c) / 2 - (b * d * s) / 2, z + (a * w * s) / 2 + (b * d * c) / 2]);
}

/** ¿Se pisan dos rectángulos girados? (ejes separadores) */
export function overlaps(A, B) {
  for (const P of [A, B]) {
    for (let i = 0; i < 4; i++) {
      const [x0, z0] = P[i];
      const [x1, z1] = P[(i + 1) % 4];
      const [nx, nz] = [z0 - z1, x1 - x0];
      const proj = (Q) => Q.map(([x, z]) => x * nx + z * nz);
      const [a, b] = [proj(A), proj(B)];
      if (Math.max(...a) <= Math.min(...b) || Math.max(...b) <= Math.min(...a)) return false;
    }
  }
  return true;
}

/**
 * Casas y árboles que completan el barrio. `entorno` = data/entorno.json. Opciones: `radius` (hasta dónde, desde el
 * centro de la cancha), `keepOut(x, z)` (true donde no va nada: el estadio de la escena) y `seed`.
 * Devuelve { casas: [[x, z, frente, fondo, alto, giro, tono]], arboles: [[x, z, radio]] } (tono: 0..1, < 0,2 = teja).
 */
export function fillBarrio(entorno, { radius = 850, keepOut = () => false, seed = 7 } = {}) {
  const rnd = seeded(seed);
  const streets = grid();
  const polys = grid(40);
  const houses = grid(16);
  const trees = grid(12);

  // Calles y vías: segmentos con medio ancho (la autopista elevada también: debajo no hay casas).
  for (const [tipo, w, f] of entorno.calles) {
    const pts = pairs(f);
    const half = w / 2 + (tipo === 'autopista' ? 3 : 0);
    for (let i = 0; i < pts.length - 1; i++) {
      const [[ax, az], [bx, bz]] = [pts[i], pts[i + 1]];
      streets.add({ ax, az, bx, bz, half }, Math.min(ax, bx) - half, Math.min(az, bz) - half, Math.max(ax, bx) + half, Math.max(az, bz) + half);
    }
  }
  for (const f of entorno.vias) {
    const pts = pairs(f);
    for (let i = 0; i < pts.length - 1; i++) {
      const [[ax, az], [bx, bz]] = [pts[i], pts[i + 1]];
      streets.add({ ax, az, bx, bz, half: 3 }, Math.min(ax, bx) - 3, Math.min(az, bz) - 3, Math.max(ax, bx) + 3, Math.max(az, bz) + 3);
    }
  }
  const onStreet = (x, z, margin = 0) => {
    for (const s of streets.near(x, z, 20)) if (segDist(x, z, s.ax, s.az, s.bx, s.bz) < s.half + margin) return true;
    return false;
  };
  // Superficies (parques, canchas, clubes, playas) y edificios de OSM: ahí no van casas.
  const polyList = [
    ...entorno.areas.map(([kind, f]) => ({ kind, poly: pairs(f) })),
    ...entorno.edificios.map(([, f]) => ({ kind: 'edificio', poly: pairs(f) })),
  ];
  for (const p of polyList) {
    const [x0, z0, x1, z1] = bbox(p.poly);
    polys.add(p, x0, z0, x1, z1);
  }
  const inArea = (x, z, ok = () => false) => {
    for (const p of polys.near(x, z)) if (!ok(p.kind) && inPolygon(x, z, p.poly)) return p.kind;
    return null;
  };
  const freeHouse = (C) => {
    const [x, z] = C.reduce(([a, b], [u, v]) => [a + u / 4, b + v / 4], [0, 0]);
    for (const h of houses.near(x, z, 12)) if (overlaps(h, C)) return false;
    return true;
  };
  const treeFree = (x, z, r) => {
    for (const [tx, tz, tr] of trees.near(x, z, 10)) if (Math.hypot(tx - x, tz - z) < (r + tr) * 0.8) return false;
    return true;
  };
  const casas = [];
  const arboles = [];
  const addTree = (x, z, r) => {
    const t = [Math.round(x * 10) / 10, Math.round(z * 10) / 10, Math.round(r * 10) / 10];
    arboles.push(t);
    trees.add(t, x, z, x, z);
  };
  const far = (x, z) => Math.hypot(x, z) > radius || keepOut(x, z);
  // Lejos (más de LEJOS metros) van menos árboles: casi no se distinguen y son los que más triángulos suman.
  const thin = (x, z, p) => (Math.hypot(x, z) > LEJOS ? p * 0.45 : p);

  // Los árboles que OSM tiene uno por uno van primero.
  for (const [x, z] of pairs(entorno.arboles)) if (!far(x, z)) addTree(x, z, 3 + rnd() * 1.5);

  // Casas: por cada calle (no autopista ni servicio), lotes a los dos lados.
  for (const [tipo, w, f] of entorno.calles) {
    if (tipo !== 'calle' && tipo !== 'avenida') continue;
    const pts = pairs(f);
    const setback = w / 2 + VEREDA;
    for (let i = 0; i < pts.length - 1; i++) {
      const [[ax, az], [bx, bz]] = [pts[i], pts[i + 1]];
      const len = Math.hypot(bx - ax, bz - az);
      if (len < LOT) continue;
      const [ux, uz] = [(bx - ax) / len, (bz - az) / len];
      const rot = Math.atan2(uz, ux);
      for (const side of [-1, 1]) {
        const [nx, nz] = [-uz * side, ux * side];
        for (let d = LOT / 2; d < len - LOT / 2; d += LOT) {
          const [px, pz] = [ax + ux * d, az + uz * d];
          const r = [rnd(), rnd(), rnd(), rnd()];
          // Árbol de vereda en dos de cada tres lotes (el barrio es muy arbolado).
          const [tx, tz] = [px + nx * (w / 2 + 1.2), pz + nz * (w / 2 + 1.2)];
          const tr = 2.4 + r[3] * 2;
          if (r[2] < thin(tx, tz, 0.66) && !far(tx, tz) && !onStreet(tx, tz, 0.3) && !inArea(tx, tz, (k) => k === 'verde') && treeFree(tx, tz, tr)) addTree(tx, tz, tr);
          // La casa: fondo de 10 a 22 m, 1 a 3 pisos; en las avenidas, más edificios.
          const depth = 10 + r[0] * 12;
          const [cx, cz] = [px + nx * (setback + depth / 2), pz + nz * (setback + depth / 2)];
          if (far(cx, cz)) continue;
          const C = corners(cx, cz, LOT - 0.2, depth, rot);
          if ([[cx, cz], ...C].some(([x, z]) => onStreet(x, z, 1) || inArea(x, z))) continue;
          if (!freeHouse(C)) continue;
          const tall = r[1] < (tipo === 'avenida' ? 0.22 : 0.035);
          const h = tall ? 12 + rnd() * 18 : 3.2 + rnd() * rnd() * 6.5;
          const casa = [cx, cz, LOT - 0.2, depth, h, rot, rnd()].map((v, k) => (k === 5 ? Math.round(v * 1000) / 1000 : Math.round(v * 10) / 10));
          casas.push(casa);
          houses.add(C, cx - 12, cz - 12, cx + 12, cz + 12);
          // En el fondo del lote, a veces, un árbol del patio.
          if (rnd() < thin(cx, cz, 0.3)) {
            const back = setback + depth + 3 + rnd() * 6;
            const [bx2, bz2] = [px + nx * back, pz + nz * back];
            const br = 3 + rnd() * 2;
            if (!far(bx2, bz2) && !onStreet(bx2, bz2, 1) && !inArea(bx2, bz2) && treeFree(bx2, bz2, br)) addTree(bx2, bz2, br);
          }
        }
      }
    }
  }
  // Las casas quedaron por calle; ahora se sacan los árboles de patio que cayeron dentro de una casa de otra calle.
  const inHouse = ([x, z]) => [...houses.near(x, z, 12)].some((C) => inPolygon(x, z, C));
  const kept = arboles.filter((t) => !inHouse(t));

  // Parques y plazas: árboles cada ~13 m, no todos.
  for (const { kind, poly } of polyList) {
    if (kind !== 'verde' && kind !== 'bosque') continue;
    const [x0, z0, x1, z1] = bbox(poly);
    for (let x = x0 + 6; x < x1; x += 13) {
      for (let z = z0 + 6; z < z1; z += 13) {
        const [jx, jz, p, r] = [x + rnd() * 6 - 3, z + rnd() * 6 - 3, rnd(), 3.5 + rnd() * 2.5];
        if (p > thin(jx, jz, kind === 'bosque' ? 0.9 : 0.55) || far(jx, jz) || !inPolygon(jx, jz, poly) || onStreet(jx, jz, 1) || !treeFree(jx, jz, r)) continue;
        if (inArea(jx, jz, (k) => k === 'verde' || k === 'bosque' || k === 'club')) continue;
        addTree(jx, jz, r);
        kept.push(arboles.at(-1));
      }
    }
  }
  return { casas, arboles: kept };
}

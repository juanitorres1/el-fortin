// Estadio en 3D (Club › Estadio): medidas del Amalfitani y cuentas que no dependen de Three.js (perfiles de las
// gradas, dónde se pone la cámara), para poder testearlas. El dibujo está en src/sections/estadio-scene.js.
//
// Medidas en metros, tomadas de una foto aérea: cancha de 105 × 68, populares (este y oeste) curvas detrás de los
// arcos, Platea Norte con tres bandejas («VELEZ» escrito con butacas en la alta) y la estructura de la visera atrás,
// y Platea Sur con la baja (bloque rojo y la V) y una alta grande, más larga que la cancha y sin techo.
// Es una aproximación: las alturas no salen de la foto.
// Ejes: x hacia el este, z hacia el sur (el norte es -z) e y hacia arriba.

export const PITCH = { length: 105, width: 68 };
export const GAP = 4; // de la línea de cal a la primera fila

/** Una bandeja: profundidad en planta, altura de la primera y la última fila, largo y si es parte de un sector. */
const tier = (d, y0, y1, len, extra = {}) => ({ d, y0, y1, len, ...extra });

/**
 * Cada lado, de adelante (la cancha) hacia atrás. `level` = índice del nivel del sector en club.json (las piezas sin
 * `level`, como los palcos o las cabinas, son parte del sector pero no se eligen aparte).
 */
export const LAYOUT = {
  norte: [
    tier(13, 1, 6, 100, { level: 0 }),
    tier(1.5, 6, 9, 98, { kind: 'palcos' }),
    tier(9, 9, 13, 100, { level: 1 }),
    tier(28, 14, 27, 100, { level: 2 }),
    tier(16, 0, 30, 102, { kind: 'visera' }),
  ],
  sur: [
    tier(24, 1, 9, 104, { level: 0 }),
    tier(1.5, 9, 11, 102, { kind: 'palcos' }),
    tier(34, 12, 28, 116, { level: 1 }),
  ],
  este: [tier(30, 1, 16, 76, { level: 0, curved: true })],
  oeste: [tier(30, 1, 16, 76, { level: 0, curved: true })],
};

/** Distancia del centro a la primera fila de cada lado (las populares, detrás del arco). */
export const FRONT = { norte: PITCH.width / 2 + GAP, sur: PITCH.width / 2 + GAP, este: PITCH.length / 2 + GAP, oeste: PITCH.length / 2 + GAP };

/** Hacia dónde mira cada lado desde el centro (vector en el plano x, z). */
export const OUT = { norte: [0, -1], sur: [0, 1], este: [1, 0], oeste: [-1, 0] };

/** Profundidad total de un lado (hasta la espalda de la última pieza). */
export const depthOf = (lado) => LAYOUT[lado].reduce((t, p) => t + p.d, 0);

/**
 * Perfil escalonado de una bandeja en su corte: [u, v] con u = distancia hacia afuera desde su frente y v = altura.
 * Escalones de `row` metros de fondo; cierra contra el piso (es un sólido). El primer punto es el pie del frente.
 */
export function stepProfile(d, y0, y1, row = 1.2) {
  const n = Math.max(1, Math.round(d / row));
  const pts = [[0, 0], [0, y0]];
  for (let i = 0; i < n; i++) {
    const u0 = (d * i) / n;
    const u1 = (d * (i + 1)) / n;
    const v = y0 + ((y1 - y0) * (i + 1)) / n;
    pts.push([u0, v], [u1, v]);
  }
  pts.push([d, 0]);
  return pts;
}

/** Dónde empieza cada pieza de un lado (u desde el frente del lado). */
export function offsets(lado) {
  let u = 0;
  return LAYOUT[lado].map((p) => {
    const at = u;
    u += p.d;
    return at;
  });
}

const rotate = ([u, w], lado) => {
  // Del sistema de una tribuna (u hacia afuera, w a lo largo) al plano x, z.
  const [ox, oz] = OUT[lado];
  return [u * ox - w * oz, u * oz + w * ox];
};

/**
 * Cámara para cada vista. `general`: de afuera y arriba, detrás del lado (queda adelante, cerca de quien mira).
 * `tribuna`: sentado en el medio del sector, mirando la cancha. `arriba`: desde arriba, con el norte arriba.
 * Devuelve { pos: [x, y, z], target: [x, y, z] }.
 */
export function cameraFor(lado, mode = 'general') {
  if (mode === 'arriba') return { pos: [0, 340, 1], target: [0, 0, 0] };
  const front = FRONT[lado];
  if (mode === 'tribuna') {
    const p = LAYOUT[lado].find((x) => x.level != null && x.level === (lado === 'norte' ? 2 : lado === 'sur' ? 1 : 0)) ?? LAYOUT[lado][0];
    const u = offsets(lado)[LAYOUT[lado].indexOf(p)] + p.d * 0.45;
    const [x, z] = rotate([front + u, 0], lado);
    return { pos: [x, (p.y0 + p.y1) / 2 + 2.5, z], target: [0, 0, 0] };
  }
  const [x, z] = rotate([front + depthOf(lado) + 95, lado === 'norte' || lado === 'sur' ? 40 : 30], lado);
  return { pos: [x, 115, z], target: [0, 0, 0] };
}

/** Vista inicial: desde el sudeste, como la foto de la entrada. */
export const DEFAULT_VIEW = { pos: [150, 120, 170], target: [0, 0, 0] };

/** El lado que queda más cerca de una cámara en `pos` (para describir la vista). */
export function sideNearest([x, , z]) {
  return Object.entries(OUT).map(([lado, [ox, oz]]) => [lado, x * ox + z * oz]).sort((a, b) => b[1] - a[1])[0][0];
}

/** Capacidad de un sector (suma de sus niveles) y del estadio. */
export const sectorCapacity = (s) => (s.niveles ?? []).reduce((n, l) => n + (l.capacidad ?? 0), 0);
export const totalCapacity = (sectores) => (sectores ?? []).reduce((n, s) => n + sectorCapacity(s), 0);

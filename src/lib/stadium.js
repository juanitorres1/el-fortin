// Estadio en 3D (Club › Estadio): medidas del Amalfitani y cuentas que no dependen de Three.js (perfiles de las
// gradas, dónde se pone la cámara), para poder testearlas. El dibujo está en src/sections/estadio-scene.js.
//
// Medidas en metros, tomadas de una foto aérea: cancha de 105 × 68, populares (este y oeste) curvas detrás de los
// arcos, Platea Norte con tres bandejas («VELEZ» escrito con butacas en la alta, que vuela sobre la media) y, atrás,
// un edificio con azotea (la «visera» es una cercha con reflectores sobre el borde de la azotea, no un techo), y
// Platea Sur con la baja (la V) y una alta grande, sin techo, en voladizo sobre la baja y con las puntas en diagonal.
// Es una aproximación: las alturas no salen de la foto.
// Ejes: x hacia el este, z hacia el sur (el norte es -z) e y hacia arriba.

export const PITCH = { length: 105, width: 68 };
export const GAP = 4; // de la línea de cal a la primera fila

/**
 * Una bandeja: profundidad en planta, altura de la primera y la última fila, largo y si es parte de un sector.
 * Opcionales: `over` = metros que el frente vuela sobre la pieza de adelante (bandeja en voladizo) y `flare` =
 * metros que se abre cada punta hacia atrás (planta en trapecio: `len` es el largo del frente). En la pieza
 * `visera`, `back` = metros que el edificio sigue hacia afuera (no cuenta en `depthOf`: cámaras y carteles no se mueven).
 */
const tier = (d, y0, y1, len, extra = {}) => ({ d, y0, y1, len, ...extra });

const SIDE = PITCH.length + 2 * GAP; // de esquina a esquina: las plateas llegan hasta donde arrancan las curvas

/**
 * Cada lado, de adelante (la cancha) hacia atrás. `level` = índice del nivel del sector en club.json (las piezas sin
 * `level`, como los palcos o las cabinas, son parte del sector pero no se eligen aparte).
 */
export const LAYOUT = {
  norte: [
    tier(13, 1, 6, SIDE, { level: 0 }),
    tier(1.5, 6, 9, SIDE, { kind: 'palcos' }),
    tier(9, 9, 13, SIDE, { level: 1 }),
    tier(28, 14, 27, SIDE, { level: 2, over: 4 }), // la alta avanza sobre la media
    // El edificio de atrás (foto aérea de feb-2026): 6 + 22 m de fondo, con azotea al nivel del borde de la alta.
    // El fondo es estimado (±8 m). Crece hacia la avenida, que no se mueve.
    tier(6, 0, 28.5, SIDE + 2, { kind: 'visera', back: 22 }),
  ],
  sur: [
    tier(24, 1, 9, SIDE, { level: 0 }),
    tier(1.5, 9, 11, SIDE, { kind: 'palcos' }),
    // La alta vuela 7 m sobre la baja y es un trapecio apenas abierto: 113 m adelante (de curva a curva, sin
    // ranura en las esquinas) y 123 atrás (las puntas, en diagonal, montan sobre las curvas).
    tier(34, 12, 28, SIDE, { level: 1, over: 7, flare: 5 }),
  ],
  este: [tier(30, 1, 16, 76, { level: 0, curved: true })],
  oeste: [tier(30, 1, 16, 76, { level: 0, curved: true })],
};

// ---------- Línea de tiempo: el estadio en cada época ----------
// Formas aproximadas a partir de fotos aéreas de época (Club › Estadio). Los textos de cada época están en
// data/club.json (estadio.epocas). `style` define colores y detalles; `layout`, las tribunas.
// Campos opcionales de `style` que la escena ya sabe leer: `pitch` = césped ({ stripes, wear, arcs, tone }: ver
// pitchTexture), `fence` = alambrado alrededor de la cancha, `barriers` = paravalanchas en las populares curvas,
// `paint` = parapetos pintados de blanco con una franja azul. Y de cada pieza: `material` (otra grada que la de la
// época), `tone` (color propio: hormigón más nuevo) y `techo` = { aguas: 1 | 2, len } (chapa sobre postes; `len` =
// largo del tramo techado, centrado; sin `len`, toda la tribuna).

const cement = (d, y0, y1, len, extra = {}) => tier(d, y0, y1, len, { level: 0, ...extra });

export const ERAS = {
  1924: {
    // Cancha sin franjas de corte y gastada; sin medialunas en las áreas (se sumaron al reglamento en 1937: dato de
    // memoria, sin fuente revisada). Sin luz artificial: la del Fortín es de diciembre de 1928.
    style: { seats: 'madera', towers: null, screen: null, glass: false, decals: false, streets: 'villa-luro', pitch: { stripes: 0, wear: 1, arcs: false, tone: ['#4f7a2e', '#55782f'] } },
    // La cancha de Basualdo: tribunas bajas de tablones alrededor, sin curvas. La principal, sobre Basualdo (sur),
    // con el módulo central techado a dos aguas y los extremos descubiertos (confirmado por el usuario; las medidas
    // son estimadas).
    layout: {
      norte: [cement(6, 0.6, 3, 104)],
      sur: [cement(9, 0.8, 5.2, 84, { techo: { aguas: 2, len: 36 } })],
      este: [cement(5, 0.6, 2.4, 70)],
      oeste: [cement(5, 0.6, 2.4, 70)],
    },
  },
  1951: {
    style: { seats: 'cemento', towers: null, screen: null, glass: false, decals: false, streets: 'liniers-viejo', fence: true, pitch: { stripes: 0, wear: 0.8, tone: ['#4f7a2e', '#55782f'] } },
    // Liniers en cemento, asimétrico y sin segundas bandejas: la Este, alta y completa (su curva cierra contra la
    // Sur); la Oeste, más baja, recta y con tablones del estadio de madera atrás; la Norte, todavía la vieja tribuna
    // techada de madera del primer estadio de Liniers (la forma del techo es una inferencia: chapa a un agua).
    layout: {
      norte: [cement(16, 1, 7, 96, { material: 'madera', techo: { aguas: 1 } })],
      sur: [cement(22, 1, 10, SIDE)],
      este: [cement(22, 1, 10, 76, { curved: true })],
      oeste: [cement(10, 1, 4, 76), tier(5, 4.4, 6, 76, { material: 'madera' })],
    },
  },
  1970: {
    style: { seats: 'cemento', towers: 'clasicas', screen: null, glass: false, decals: false, streets: 'liniers-viejo', fence: true, paint: true, pitch: { stripes: 0.35, wear: 0.5 } },
    // Con las torres y la Norte cerrando el anillo (confirmado por el usuario): la Norte, en dos bandejas (la baja y
    // la alta de 1969, que vuela sobre la baja), de curva a curva y con los codos cerrados; la Sur, una sola bandeja
    // baja y descubierta (la misma de hoy, todavía sin la alta); populares curvas en las dos cabeceras.
    layout: {
      norte: [cement(23, 1, 11.5, SIDE), cement(28, 14, 27, SIDE, { over: 4 })],
      sur: [cement(24, 1, 9, SIDE)],
      este: [cement(26, 1, 13, 76, { curved: true })],
      oeste: [cement(26, 1, 13, 76, { curved: true })],
    },
  },
  1978: {
    style: { seats: 'cemento', towers: 'rayadas', screen: 'tablero', glass: false, decals: false, streets: 'liniers-viejo', fence: true, paint: true, pitch: { stripes: 0.6, wear: 0.3 } },
    // Para el Mundial: las mismas piezas de hoy. La Sur suma la alta con palcos (hormigón recién hecho: `tone`),
    // descubierta; torres rayadas en rojo y blanco. El edificio de atrás de la Norte (pieza `visera`) no se dibuja:
    // no hay confirmación de que ya existiera. Tampoco los cuerpos de rampas de la Sur.
    layout: {
      norte: LAYOUT.norte.filter((p) => p.kind !== 'visera'),
      sur: LAYOUT.sur.map((p) => (p.over ? { ...p, tone: 0xbfbbb0 } : p)),
      este: LAYOUT.este,
      oeste: LAYOUT.oeste,
    },
  },
  hoy: {
    style: { seats: 'azul', towers: 'led', screen: 'led', glass: true, decals: true, streets: 'liniers', pitch: { wear: 0.1 }, barriers: true },
    layout: LAYOUT,
  },
};

/** El orden de la línea de tiempo. */
export const ERA_ORDER = ['1924', '1951', '1970', '1978', 'hoy'];

/** Distancia del centro a la primera fila de cada lado (las populares, detrás del arco). */
export const FRONT = { norte: PITCH.width / 2 + GAP, sur: PITCH.width / 2 + GAP, este: PITCH.length / 2 + GAP, oeste: PITCH.length / 2 + GAP };

/** Hacia dónde mira cada lado desde el centro (vector en el plano x, z). */
export const OUT = { norte: [0, -1], sur: [0, 1], este: [1, 0], oeste: [-1, 0] };

/** Profundidad total de un lado (hasta la espalda de la última pieza; lo que vuela sobre la de adelante no suma). */
export const depthOf = (lado, layout = LAYOUT) => layout[lado].reduce((t, p) => t + p.d - (p.over ?? 0), 0);

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

/** Dónde empieza cada pieza de un lado (u desde el frente del lado). Una pieza con `over` arranca antes. */
export function offsets(lado, layout = LAYOUT) {
  let u = 0;
  return layout[lado].map((p) => {
    const at = u - (p.over ?? 0);
    u = at + p.d;
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
export function cameraFor(lado, mode = 'general', layout = LAYOUT) {
  if (mode === 'arriba') return { pos: [0, 340, 1], target: [0, 0, 0] };
  const front = FRONT[lado];
  const pieces = layout[lado];
  if (mode === 'tribuna') {
    // La bandeja más alta con butacas (la última que tiene nivel).
    const p = [...pieces].reverse().find((x) => x.level != null) ?? pieces[0];
    const u = offsets(lado, layout)[pieces.indexOf(p)] + p.d * 0.45;
    const [x, z] = rotate([front + u, 0], lado);
    return { pos: [x, (p.y0 + p.y1) / 2 + 2.5, z], target: [0, 0, 0] };
  }
  // Si detrás de la última pieza sigue un edificio (`back`), la cámara se aleja eso mismo: si no, queda encima.
  const [x, z] = rotate([front + depthOf(lado, layout) + (pieces.at(-1).back ?? 0) + 95, lado === 'norte' || lado === 'sur' ? 40 : 30], lado);
  return { pos: [x, 115, z], target: [0, 0, 0] };
}

/** Límites de la cámara (OrbitControls). */
export const ORBIT = { minDistance: 40, maxDistance: 460, maxPolarAngle: Math.PI * 0.47 };

/** Vista inicial: desde el sudeste, como la foto de la entrada. */
export const DEFAULT_VIEW = { pos: [150, 120, 170], target: [0, 0, 0] };

/** El lado que queda más cerca de una cámara en `pos` (para describir la vista). */
export function sideNearest([x, , z]) {
  return Object.entries(OUT).map(([lado, [ox, oz]]) => [lado, x * ox + z * oz]).sort((a, b) => b[1] - a[1])[0][0];
}

/** Capacidad de un sector (suma de sus niveles) y del estadio. */
export const sectorCapacity = (s) => (s.niveles ?? []).reduce((n, l) => n + (l.capacidad ?? 0), 0);
export const totalCapacity = (sectores) => (sectores ?? []).reduce((n, s) => n + sectorCapacity(s), 0);

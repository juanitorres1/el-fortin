// La escena 3D del Amalfitani con Three.js. Solo corre en el navegador y se carga aparte (import dinámico desde
// Estadio3D.jsx), así el resto del sitio no baja Three.js. Las medidas y las cuentas están en lib/stadium.js.
//
// Lo que se ve, según las fotos aéreas (la que manda es la de febrero de 2026, tomada desde el norte): todo azul;
// populares curvas detrás de los arcos; Platea Norte con tres bandejas, palcos y «VELEZ» escrito con butacas blancas
// en la alta; detrás, un edificio con azotea, fachada de parasoles blancos y, sobre el borde de la azotea, la cercha
// blanca con los reflectores y una cabina azul (no hay techo sobre la alta); Platea Sur con la V blanca en la baja,
// palcos y la alta descubierta; frentes de vidrio en las plateas, cuatro torres LED y la pantalla detrás de la
// Popular Este. Alrededor: Av. Juan B. Justo por el norte y la Autopista Perito Moreno (elevada) al sur.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { DEFAULT_VIEW, ERAS, FRONT, GAP, ORBIT, OUT, PITCH, cameraFor, depthOf, offsets, stepProfile } from '../lib/stadium.js';

// `frame` = el azul de la estructura pintada de hoy (foto de feb-2026: más saturado y apenas más cian que las butacas).
const COLOR = { facade: 0xe8ebef, roof: 0x2f6388, frame: 0x0f4f9e, frameDark: 0x0f4590, palcos: 0x1b2430 };
// Colores de las gradas según la época: butacas azules hoy, cemento antes, madera en Villa Luro. En las fotos el
// cemento pintado de las populares es más profundo y saturado que el plástico de las butacas.
const SEATS = { azul: [0x2a6cbc, 0x3075c4, 0x0a4f9c], cemento: [0xadb2b9, 0xa2a8b0, 0xb3b8be], madera: [0x8a6a48, 0x7c5e3f, 0x8a6a48] };
// Calles alrededor: hoy Juan B. Justo y la AU6; antes de la autopista, solo Juan B. Justo; en Villa Luro, la manzana.
// La avenida no se mueve: es la misma en todas las épocas de Liniers (medida en la foto aérea de hoy).
const Z_JUSTO = -153.5;
/**
 * Entorno por época. Todo es opcional; sin nada, queda el de hoy. Campos que la escena ya lee:
 * `ground` (color del piso entre las casas) · `plaza` (color de la explanada, texto CSS) · `slabs` (false = sin losas) ·
 * `calle` ('tierra' | 'vieja': calzada de oldRoadTexture en vez de la de hoy) · `avenida` (parámetros de roadTexture:
 * { base, center, lanes }, si no hay `calle`) · `arbolAv` (tamaño de los árboles de la avenida, 0 = no hay) ·
 * `green` y `trees` (lotes vacíos y cuántos con árbol; número o función (x, z)) · `libre` ((x, z, { nearAu6, inBox,
 * zSurHoy }) => true donde no hay casas) · `naves` (true = galpones ferroviarios al sudeste) · `barrio` (parámetros
 * de más para barrio(): step, size, low, streets).
 */
// Y los de las épocas viejas: `muro` (tinte de las paredes de hormigón), `autos` y `pintura` (cuántos autos de
// época en la avenida y de qué colores: cajas genéricas, sin marca), `campo` (árboles sueltos fuera del barrio).
// Respaldo: 1924, calles de tierra y casitas humildes (El Gráfico, 1933); Liniers, terreno rellenado y vecinos
// ferroviarios, autopista en obra recién desde nov-1978. Los porcentajes y los rectángulos libres son inferencias.
const ENTORNO = {
  1924: {
    ground: 0x8a8f63, plaza: '#a39a7c', slabs: false, calle: 'tierra', campo: 46,
    // Manzanas vecinas con lotes vacíos; más afuera, quintas. Pocos árboles (frutales, sin arbolado de vereda).
    green: (x, z) => (Math.abs(x) < 234 && Math.abs(z) < 180 ? 0.4 : 0.72), trees: 0.35,
    barrio: { step: 12, size: [6.5, 2], low: [3, 1.6], streets: false },
  },
  1951: {
    // Estadio en medio de terreno rellenado: tierra, avenida recién hecha de hormigón claro, sin árboles y casi sin
    // autos; nada construido al este, al sudeste (talleres del ferrocarril) ni pegado al oeste.
    ground: 0x9a957e, plaza: '#a29c84', slabs: false, calle: 'losas', arbolAv: 0, naves: true, muro: 0xffffff,
    autos: 6, pintura: [0x1c1f24, 0x2b2f36, 0x3a2a26, 0x2f3d33, 0xd8d2c0],
    green: (x, z) => (z < Z_JUSTO ? 0.55 : 0.42), trees: 0.3,
    libre: (x, z, { nearAu6, inBox, zSurHoy }) => nearAu6(x, z, 60) || inBox(x, z, 150, 330, -125, 170) || inBox(x, z, -60, 330, zSurHoy + 20, zSurHoy + 190) || inBox(x, z, -230, -150, -60, 120),
  },
  1970: {
    // Avenida con una sola línea blanca y árboles jóvenes; playa de tierra al este y la franja sur todavía libre.
    ground: 0x8b8f8a, plaza: '#a8a497', calle: 'vieja', arbolAv: 0.6, naves: true, muro: 0xe9e5dc,
    autos: 26, pintura: [0xe9e6dc, 0xd9dcdf, 0x8fb0c9, 0xc9552e, 0x2f5d3a, 0x1c1f24, 0xd8b23a],
    green: 0.3, trees: 0.6,
    libre: (x, z, { nearAu6, inBox, zSurHoy }) => nearAu6(x, z, 45) || inBox(x, z, 150, 262, -112, 120) || inBox(x, z, 20, 262, zSurHoy + 70, zSurHoy + 170),
  },
  1978: {
    // Avenida ya moderna (demarcación blanca, sin doble amarilla); la traza de la futura autopista, solo libre de casas.
    ground: 0x8b8f8a, plaza: '#b5b2ac', avenida: { base: '#4f535a', center: 'rgba(255,255,255,0.75)', lanes: 2 }, arbolAv: 0.85, naves: true, muro: 0xe2ded6,
    autos: 44, pintura: [0xe9e6dc, 0xd9dcdf, 0x8fb0c9, 0xc9552e, 0x2f5d3a, 0x1c1f24, 0xd8b23a, 0xa32a2a],
    green: 0.22, trees: 0.75,
    libre: (x, z, { nearAu6, inBox, zSurHoy }) => nearAu6(x, z, 34) || inBox(x, z, 150, 262, -112, 66) || inBox(x, z, 20, 262, zSurHoy + 70, zSurHoy + 170),
  },
  hoy: { naves: true },
};
// Tonos de las gradas por época (guía: la tabla de materiales que pasó el usuario): [platea, alterna, popular] y la
// rugosidad del cemento. Sin fotos en color: son inferencias.
const TONOS = {
  1924: { madera: [0x8f7d66, 0x86745d, 0x8f7d66] }, // tablones envejecidos, gris y marrón deslavado
  1951: { cemento: [0xc6c2b7, 0xc6c2b7, 0xc1bdb1], madera: [0x705b46, 0x67533f, 0x705b46], rough: 0.76 }, // hormigón recién hecho; madera reciclada, más oscura
  1970: { cemento: [0xb4afa3, 0xb4afa3, 0xaea99c], rough: 0.68 }, // hormigón visto, ya manchado
  1978: { cemento: [0xaeaa9e, 0xaeaa9e, 0xa9a598], rough: 0.72 }, // gris medio (la Sur Alta, más nueva, lleva `tone`)
};
const VILLA_LURO = { norte: 'Guardia Nacional', sur: 'Basualdo', oeste: 'Schmidl', este: 'Pizarro' };
const ANGLE = { este: 0, norte: Math.PI / 2, sur: -Math.PI / 2, oeste: Math.PI };
const TOWERS = [[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([sx, sz]) => [sx * (PITCH.length / 2 + GAP + 26), sz * (PITCH.width / 2 + GAP + 26)]);

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Césped. `stripes` 0..1 = cuánto se marcan las franjas de corte; `wear` 0..1 = pasto ralo y tierra;
 *  `arcs` = medialunas del área (son de 1937). */
function pitchTexture({ stripes = 1, wear = 0, arcs = true, tone = ['#3d7228', '#4a8230'] } = {}) {
  const s = 8; // px por metro
  const W = (PITCH.length + 2 * GAP) * s;
  const H = (PITCH.width + 2 * GAP) * s;
  return canvasTexture(W, H, (g) => {
    const x0 = GAP * s;
    const y0 = GAP * s;
    const L = PITCH.length * s;
    const A = PITCH.width * s;
    g.fillStyle = tone[1];
    g.fillRect(0, 0, W, H);
    g.globalAlpha = stripes;
    g.fillStyle = tone[0];
    for (let i = 1; i * 9 * s < W; i += 2) g.fillRect(i * 9 * s, 0, 9 * s, H);
    for (let j = 0; j * 9 * s < H; j++) {
      g.fillStyle = j % 2 ? 'rgba(0,0,0,0.035)' : 'rgba(255,255,255,0.03)';
      g.fillRect(0, j * 9 * s, W, 9 * s);
    }
    g.globalAlpha = 1;
    let seed = 5;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 9000; i++) {
      g.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.045)';
      g.fillRect(rnd() * W, rnd() * H, 2 + rnd() * 4, 2 + rnd() * 4);
    }
    if (wear) {
      const blot = (x, y, rx, ry, rgb, a) => {
        g.save();
        g.translate(x, y);
        g.scale(rx, ry);
        const gr = g.createRadialGradient(0, 0, 0, 0, 0, 1);
        gr.addColorStop(0, `rgba(${rgb},${a.toFixed(2)})`);
        gr.addColorStop(0.6, `rgba(${rgb},${(a * 0.6).toFixed(2)})`);
        gr.addColorStop(1, `rgba(${rgb},0)`);
        g.fillStyle = gr;
        g.fillRect(-1, -1, 2, 2);
        g.restore();
      };
      // Pasto ralo y amarillento, desparejo.
      for (let i = 0; i < 70; i++) blot(rnd() * W, rnd() * H, (4 + rnd() * 14) * s, (3 + rnd() * 9) * s, '150,140,70', 0.18 * wear);
      // Tierra: las áreas chicas, el punto del penal y el círculo central.
      for (const side of [0, 1]) {
        const x = side ? x0 + L : x0;
        const dir = side ? -1 : 1;
        blot(x + dir * 4 * s, y0 + A / 2, 7 * s, 9 * s, '128,104,70', 0.75 * wear);
        blot(x + dir * 11 * s, y0 + A / 2, 2 * s, 2 * s, '128,104,70', 0.5 * wear);
      }
      blot(x0 + L / 2, y0 + A / 2, 6 * s, 6 * s, '128,104,70', 0.35 * wear);
      // Polvo de cal a los costados de la línea.
      g.strokeStyle = `rgba(255,255,255,${(0.1 * wear).toFixed(2)})`;
      g.lineWidth = 0.6 * s;
      g.strokeRect(x0, y0, L, A);
    }
    g.strokeStyle = `rgba(255,255,255,${(0.92 - 0.22 * wear).toFixed(2)})`;
    g.lineWidth = (0.14 + 0.05 * wear) * s;
    g.strokeRect(x0, y0, L, A);
    g.beginPath();
    g.moveTo(x0 + L / 2, y0);
    g.lineTo(x0 + L / 2, y0 + A);
    g.stroke();
    g.beginPath();
    g.arc(x0 + L / 2, y0 + A / 2, 9.15 * s, 0, Math.PI * 2);
    g.stroke();
    for (const side of [0, 1]) {
      const x = side ? x0 + L : x0;
      const dir = side ? -1 : 1;
      g.strokeRect(Math.min(x, x + dir * 16.5 * s), y0 + A / 2 - 20.16 * s, 16.5 * s, 40.32 * s);
      g.strokeRect(Math.min(x, x + dir * 5.5 * s), y0 + A / 2 - 9.16 * s, 5.5 * s, 18.32 * s);
      if (arcs) {
        g.beginPath();
        g.arc(x + dir * 11 * s, y0 + A / 2, 9.15 * s, side ? Math.PI - 0.93 : -0.93, side ? Math.PI + 0.93 : 0.93);
        g.stroke();
      }
    }
    if (wear) {
      // La cal no es una línea perfecta: tramos comidos por el pasto, sobre todo en las bandas y la mitad.
      g.fillStyle = tone[1];
      g.globalAlpha = Math.min(0.75, 0.35 + wear);
      const nicks = Math.round(260 + 900 * Math.min(wear, 0.4)); // con más, de cerca la línea parece punteada
      for (let i = 0; i < nicks; i++) {
        const t = rnd();
        const k = Math.floor(rnd() * 5);
        const len = (0.3 + rnd() * 1.1) * s;
        if (k < 2) g.fillRect(x0 + t * L, (k ? y0 + A : y0) - 1.5, len, 3);
        else g.fillRect((k === 2 ? x0 : k === 3 ? x0 + L : x0 + L / 2) - 1.5, y0 + t * A, 3, len);
      }
      g.globalAlpha = 1;
    }
  });
}

/** Rugosidad del césped (canal verde): cada franja de corte refleja distinto. 1 px por metro. */
function pitchRoughTexture(stripes = 1) {
  const W = PITCH.length + 2 * GAP;
  const H = PITCH.width + 2 * GAP;
  const t = canvasTexture(W, H, (g) => {
    for (let i = 0; i * 9 < W; i++) {
      const v = Math.round(255 * (0.9 + (i % 2 ? -0.08 : 0.04) * stripes)); // con más diferencia, de noche las franjas claras se lavan
      g.fillStyle = `rgb(0,${v},0)`;
      g.fillRect(i * 9, 0, 9, H);
    }
  });
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

/** Norte Alta: «VELEZ» escrito con butacas blancas (se lee desde la cancha). */
function velezTexture() {
  return canvasTexture(1600, 440, (g, w, h) => {
    g.fillStyle = '#ffffff';
    g.font = '900 300px Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('VELEZ', w / 2, h / 2 + 8);
    asSeats(g, w, h, 8, 24); // son butacas blancas sueltas, no pintura: de lejos queda un blanco azulado
  });
}

/** Sur Baja: la V blanca sobre las butacas azules (el vértice hacia la cancha, como la de la camiseta). */
function surTexture() {
  return canvasTexture(1600, 480, (g, w, h) => {
    g.strokeStyle = '#ffffff';
    // Foto de feb-2026: los brazos se abren unos 60 m arriba (de los 98 del dibujo) y miden unos 5 m de ancho.
    g.lineWidth = 64;
    g.lineJoin = 'miter';
    g.beginPath();
    g.moveTo(w * 0.19, 0);
    g.lineTo(w * 0.5, h - 30);
    g.lineTo(w * 0.81, 0);
    g.stroke();
    asSeats(g, w, h, 8, 32);
  });
}

/** Mástil rayado en rojo y blanco (torres del Mundial 78): 9 franjas de unos 5 m, rojo arriba y abajo, mugre al pie. */
function stripesTexture() {
  return canvasTexture(16, 144, (g, w, h) => {
    for (let i = 0; i < 9; i++) {
      g.fillStyle = i % 2 ? '#ece9e0' : '#b8261f';
      g.fillRect(0, (i * h) / 9, w, h / 9);
    }
    const dirt = g.createLinearGradient(0, h * 0.8, 0, h);
    dirt.addColorStop(0, 'rgba(40,34,28,0)');
    dirt.addColorStop(1, 'rgba(40,34,28,0.3)');
    g.fillStyle = dirt;
    g.fillRect(0, h * 0.8, w, h * 0.2);
  });
}

/** Chapa acanalada de un techo viejo: ondas, solapes y óxido leve. */
function chapaTexture() {
  return canvasTexture(64, 64, (g, w, h) => {
    let seed = 13;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let y = 0; y < h; y += 8) {
      const gr = g.createLinearGradient(0, y, 0, y + 8);
      gr.addColorStop(0, '#7c8387');
      gr.addColorStop(0.5, '#b3b9bc');
      gr.addColorStop(1, '#7c8387');
      g.fillStyle = gr;
      g.fillRect(0, y, w, 8);
    }
    g.fillStyle = 'rgba(40,44,48,0.35)'; // solape entre chapas
    g.fillRect(0, 0, 2, h);
    for (let i = 0; i < 9; i++) { // óxido
      g.fillStyle = `rgba(134,78,40,${(0.12 + rnd() * 0.2).toFixed(2)})`;
      g.fillRect(2 + rnd() * 10, rnd() * h, 6 + rnd() * 26, 3 + rnd() * 5);
    }
  });
}

/** 16 m de pared de hormigón a la vista (épocas viejas): encofrado, pilastras, vanos, chorreaduras y pie húmedo. */
function concreteWallTexture() {
  return canvasTexture(512, 512, (g, w, h) => {
    let seed = 17;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    g.fillStyle = '#b5b0a4';
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(0,0,0,0.05)'; // tablas del encofrado
    for (let y = 0; y < h; y += h / 24) g.fillRect(0, y, w, 2);
    g.fillStyle = '#a39e92'; // pilastras
    for (let i = 0; i <= 4; i++) g.fillRect((i * w) / 4 - 8, 0, 16, h);
    g.fillStyle = '#2b2925'; // vanos sin vidrio y un portón
    for (let i = 0; i < 4; i++) g.fillRect((i * w) / 4 + 34, h * 0.3, w / 4 - 68, h * 0.06);
    g.fillRect(w * 0.5 + 26, h * 0.8, w / 4 - 52, h * 0.2);
    for (let i = 0; i < 46; i++) wallStreak(g, rnd, w, h, rnd() < 0.5 ? 0 : h * 0.36);
    wallFoot(g, w, h);
  });
}

/** Tablero viejo, sin pantalla LED. */
function boardTexture() {
  return canvasTexture(512, 210, (g, w, h) => {
    g.fillStyle = '#16181b';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#f2f2f2';
    g.font = '700 70px Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('VÉLEZ  0', w / 2, h * 0.32);
    g.fillText('VISITA 0', w / 2, h * 0.72);
  });
}

/**
 * Calzada con carriles (para Juan B. Justo y la autopista). Sin parámetros, la de hoy. `center` = color de la línea
 * del medio (null = sin línea) y `lanes` = 4, 2 o 0 carriles marcados.
 */
function roadTexture({ base = '#4b5059', center = '#d9b43a', lanes = 4 } = {}) {
  return canvasTexture(1024, 160, (g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    if (center) {
      g.fillStyle = center; // en la autopista queda debajo del separador central de hormigón
      g.fillRect(0, h / 2 - 2, w, 4);
    }
    g.fillStyle = 'rgba(255,255,255,0.7)';
    const ys = lanes === 4 ? [h / 6, h / 3, (2 * h) / 3, (5 * h) / 6] : lanes === 2 ? [h / 4, (3 * h) / 4] : [];
    for (let x = 0; x < w; x += 48) for (const y of ys) g.fillRect(x, y, 24, 3);
  });
}

const shade = (hex, k) => new THREE.Color(hex).multiplyScalar(k).getStyle();

const RISER = 0.3; // parte de cada celda (abajo) que es contrahuella; el resto (arriba) es la huella

/** Una fila de butacas vista desde arriba (70 % de arriba) y su contrahuella (30 % de abajo). */
function seatTile(base) {
  return canvasTexture(512, 64, (g, w, h) => {
    const th = h * (1 - RISER);
    g.fillStyle = shade(base, 0.62); // el piso por donde se camina
    g.fillRect(0, 0, w, th);
    g.fillStyle = 'rgba(0,0,0,0.22)'; // oclusión horneada: la junta con la contrahuella de atrás
    g.fillRect(0, 0, w, 3);
    const aisle = w * 0.05;
    const n = 18;
    const sw = (w - 2 * aisle) / n;
    for (let i = 0; i < n; i++) {
      const x = aisle + i * sw + 3;
      g.fillStyle = 'rgba(0,0,0,0.25)'; // sombra al pie de la butaca
      g.fillRect(x + 1, 30, sw - 6, 4);
      g.fillStyle = shade(base, 1.05);
      g.fillRect(x, 5, sw - 6, 25);
      g.fillStyle = shade(base, 1.22); // el respaldo
      g.fillRect(x, 5, sw - 6, 7);
    }
    g.fillStyle = shade(base, 0.85); // contrahuella (el mismo tono que hoy)
    g.fillRect(0, th, w, h - th);
    g.fillStyle = shade(base, 0.9); // la escalera
    g.fillRect(0, 0, aisle, h);
    g.fillRect(w - aisle, 0, aisle, h);
  });
}

/** Rugosidad de las butacas (canal verde): plástico satinado, piso mate. Mismo dibujo que seatTile. */
function seatRoughTile() {
  const t = canvasTexture(256, 32, (g, w, h) => {
    const th = h * (1 - RISER);
    g.fillStyle = 'rgb(0,240,0)'; // 0,94
    g.fillRect(0, 0, w, h);
    const aisle = w * 0.05;
    const sw = (w - 2 * aisle) / 18;
    g.fillStyle = 'rgb(0,105,0)'; // 0,41
    for (let i = 0; i < 18; i++) g.fillRect(aisle + i * sw + 1.5, 2.5, sw - 3, th * 0.56);
  });
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

/** Escalones: 'pintado' (populares de hoy), 'cemento' (a la vista, con juntas y manchas) o 'madera' (tablones). */
function terraceTile(base, mode = 'pintado') {
  const rows = mode === 'pintado' ? 1 : 4; // cuatro filas distintas para que no se note la repetición
  return canvasTexture(256, 64 * rows, (g, w, h) => {
    let seed = mode === 'madera' ? 31 : 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const rh = h / rows;
    const th = rh * (1 - RISER);
    g.fillStyle = shade(base, mode === 'madera' ? 0.3 : 1);
    g.fillRect(0, 0, w, h);
    if (mode === 'madera') {
      for (let r = 0; r < rows; r++) {
        const y0 = r * rh;
        for (let k = 0; k < 3; k++) { // tres tablones por escalón, con empalmes corridos
          const y = y0 + (k * th) / 3;
          for (let x = -rnd() * 60; x < w;) {
            const len = 70 + rnd() * 90;
            g.fillStyle = shade(base, 0.8 + rnd() * 0.4);
            g.fillRect(x, y, len - 1, th / 3 - 1.5);
            if (rnd() < 0.3) { // tabla agrisada por la intemperie
              g.fillStyle = 'rgba(160,158,150,0.28)';
              g.fillRect(x, y, len - 1, th / 3 - 1.5);
            }
            x += len;
          }
        }
        for (let i = 0; i < 90; i++) { // veta
          g.fillStyle = rnd() < 0.5 ? 'rgba(30,18,8,0.14)' : 'rgba(255,235,200,0.08)';
          g.fillRect(rnd() * w, y0 + rnd() * th, 15 + rnd() * 50, 1);
        }
        g.fillStyle = '#1c1611'; // contrahuella abierta: la sombra de abajo
        g.fillRect(0, y0 + th, w, rh - th);
        g.fillStyle = shade(base, 0.45); // parantes
        for (let x = 30; x < w; x += 64) g.fillRect(x, y0 + th, 4, rh - th);
        g.fillStyle = shade(base, 1.15); // canto del tablón
        g.fillRect(0, y0 + th, w, 2);
      }
      return;
    }
    if (mode === 'cemento') {
      for (let i = 0; i < 14; i++) { // manchas de humedad
        const x = rnd() * w;
        const y = rnd() * h;
        const rad = 18 + rnd() * 40;
        const gr = g.createRadialGradient(x, y, 0, x, y, rad);
        gr.addColorStop(0, 'rgba(58,52,42,0.16)');
        gr.addColorStop(1, 'rgba(58,52,42,0)');
        g.fillStyle = gr;
        g.fillRect(x - rad, y - rad, 2 * rad, 2 * rad);
      }
    }
    for (let i = 0; i < 500 * rows; i++) { // grano
      g.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.06)';
      g.fillRect(rnd() * w, rnd() * h, 2 + rnd() * 5, 1 + rnd() * 2);
    }
    for (let r = 0; r < rows; r++) {
      const y0 = r * rh;
      const ao = g.createLinearGradient(0, y0, 0, y0 + 9); // junta huella–contrahuella (oclusión horneada)
      ao.addColorStop(0, 'rgba(0,0,0,0.26)');
      ao.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = ao;
      g.fillRect(0, y0, w, 9);
      g.fillStyle = mode === 'cemento' ? 'rgba(0,0,0,0.14)' : shade(base, 0.72); // contrahuella
      g.fillRect(0, y0 + th, w, rh - th);
      if (mode === 'cemento') {
        for (let i = 0; i < 10; i++) { // chorreaduras
          g.fillStyle = `rgba(45,40,32,${(0.08 + rnd() * 0.14).toFixed(2)})`;
          g.fillRect(rnd() * w, y0 + th + 2, 2 + rnd() * 5, (rh - th - 2) * (0.5 + rnd() * 0.5));
        }
      }
      g.fillStyle = mode === 'cemento' ? 'rgba(255,255,255,0.16)' : shade(base, 1.25); // el filo
      g.fillRect(0, y0 + th, w, 3);
    }
    if (mode === 'cemento') {
      g.fillStyle = 'rgba(20,18,15,0.38)'; // juntas de dilatación cada 4 m
      for (const x of [0, w / 2]) g.fillRect(x, 0, 2, h);
      g.fillStyle = 'rgba(255,255,255,0.1)'; // la escalera, gastada
      g.fillRect(2, 0, w * 0.04, h);
    } else {
      g.fillStyle = shade(base, 1.25); // la escalera
      g.fillRect(0, 0, w * 0.04, h);
      g.fillRect(w * 0.96, 0, w * 0.04, h);
    }
  });
}

// Público por época: ropa, parte de gente de claro, sombreros (el ala vista desde arriba) y parte con sombrero.
const CROWD = {
  hoy: { clothes: ['#ffffff', '#e8eaee', '#0b4f96', '#12336b', '#1c2430', '#2a2d33', '#3a3f47', '#4b4038', '#5a5148', '#6b7078', '#7f8791', '#c9ced6'], light: [], lightShare: 0, hats: [], hatShare: 0 },
  1924: { clothes: ['#17181c', '#1f1d1b', '#2a2622', '#34302b', '#3d3a36', '#4a443c', '#5b554c', '#23262d'], light: ['#e9e4d6', '#d8d2c2'], lightShare: 0.07, hats: ['#d8c79a', '#cdb98a', '#e3d6b0', '#2a2623', '#3a332c', '#6f6a60', '#4a4a4a'], hatShare: 0.8 },
  1951: { clothes: ['#1b1d22', '#2a2a2c', '#3a3835', '#4b463f', '#5d5a55', '#6e6a62', '#2b3340', '#40362c'], light: ['#f2f0ea', '#e4e1d8', '#cfd6de'], lightShare: 0.3, hats: ['#3a332c', '#5a554c', '#77705f', '#2a2623'], hatShare: 0.25 },
  1970: { clothes: ['#2a2d33', '#3a3f47', '#4b4038', '#6b4a2f', '#7a5b3a', '#8a3b2c', '#2f4f7a', '#4c6a8c', '#6b7078', '#59633f', '#a8763a'], light: ['#ffffff', '#e8eaee', '#d9d2bf', '#c9ced6'], lightShare: 0.3, hats: [], hatShare: 0 },
};
CROWD[1978] = CROWD[1970];

/** Filas con gente: 2 tramos × 8 filas. En la huella, la gente vista desde arriba; en la contrahuella, el busto de
 *  la fila de adelante (lo que se ve de frente). `standing` = popular. `era` elige ropa y sombreros. */
function crowdTile(base, standing, era = 'hoy') {
  return canvasTexture(1024, 512, (g, w, h) => {
    let seed = 23;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const pick = (list) => list[Math.floor(rnd() * list.length)];
    const P = CROWD[era] ?? CROWD.hoy;
    const skin = ['#e9c4a0', '#d2a57c', '#b98560', '#f0d2b4', '#8f6244'];
    const rows = 8;
    const rh = h / rows;
    const th = rh * (1 - RISER);
    const half = w / 2;
    const aisle = half * 0.05;
    const n = standing ? 22 : 18;
    const sw = (half - 2 * aisle) / n;
    const dress = () => (rnd() < P.lightShare ? pick(P.light) : pick(P.clothes));
    const head = (cx, cy, r) => {
      const hat = rnd() < P.hatShare;
      g.fillStyle = hat ? pick(P.hats) : pick(skin);
      g.beginPath();
      g.arc(cx, cy, hat ? r * 1.4 : r, 0, Math.PI * 2);
      g.fill();
      if (hat) { // la copa
        g.fillStyle = 'rgba(255,255,255,0.14)';
        g.beginPath();
        g.arc(cx, cy, r * 0.75, 0, Math.PI * 2);
        g.fill();
      }
    };
    g.fillStyle = '#171a21'; // sombra entre la gente
    g.fillRect(0, 0, w, h);
    for (let r = 0; r < rows; r++) {
      const y0 = r * rh;
      for (const x0 of [0, half]) {
        for (let i = 0; i < n; i++) {
          const cx = x0 + aisle + (i + 0.5) * sw + (standing ? (rnd() - 0.5) * sw * 0.5 : 0);
          if (rnd() < (standing ? 0.08 : 0.13)) {
            if (!standing) { // butaca vacía
              g.fillStyle = shade(base, 1.05);
              g.fillRect(cx - sw * 0.38, y0 + 5, sw * 0.76, th * 0.55);
            }
          } else {
            g.fillStyle = dress(); // hombros redondeados: de cerca un rectángulo se ve pixelado
            g.beginPath();
            g.ellipse(cx, y0 + th * 0.5, sw * 0.46, th * 0.4, 0, 0, Math.PI * 2);
            g.fill();
            head(cx, y0 + th * 0.4, sw * 0.25);
          }
          if (rnd() < (standing ? 0.92 : 0.87)) { // el busto de quien está en la fila de adelante
            const bx = cx + (rnd() - 0.5) * sw * 0.3;
            g.fillStyle = dress();
            g.fillRect(bx - sw * 0.44, y0 + th + (rh - th) * 0.42, sw * 0.88, (rh - th) * 0.58);
            head(bx, y0 + th + (rh - th) * 0.32, sw * 0.24);
          }
        }
        g.fillStyle = shade(base, 0.9);
        g.fillRect(x0, y0, aisle, rh);
        g.fillRect(x0 + half - aisle, y0, aisle, rh);
      }
    }
  });
}

/** Telones de la popular: banderas largas a rayas azules y blancas, una al lado de la otra. */
function flagsTexture() {
  return canvasTexture(1024, 128, (g, w, h) => {
    const widths = [0.3, 0.22, 0.26, 0.18];
    let x = 6;
    widths.forEach((k, i) => {
      const fw = k * w - 12;
      const bands = i % 2 ? ['#ffffff', '#0b4f96', '#ffffff'] : ['#0b4f96', '#ffffff', '#0b4f96'];
      bands.forEach((c, j) => {
        g.fillStyle = c;
        g.fillRect(x, 8 + (j * (h - 16)) / 3, fw, (h - 16) / 3);
      });
      x += k * w;
    });
  });
}

/** 16 m del exterior de una platea de hoy: todo azul, con las losas y columnas de las rampas a la vista. */
function blueFrameTexture() {
  return canvasTexture(512, 512, (g, w, h) => {
    g.fillStyle = '#0b2452';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#0f4f9e';
    for (let k = 1; k < 6; k++) g.fillRect(0, (k * h) / 6 - 9, w, 18);
    g.fillStyle = '#125aaa';
    g.fillRect(0, 0, w, h * 0.1);
    g.fillStyle = '#1055a4';
    for (let i = 0; i <= 4; i++) g.fillRect((i * w) / 4 - 10, 0, 20, h);
    g.fillStyle = '#0d4590';
    g.fillRect(0, h * 0.84, w, h * 0.16);
    g.fillStyle = '#081730';
    g.fillRect(w * 0.5 + 30, h * 0.87, w / 4 - 60, h * 0.13);
    grime(g, w, h, 37, 20);
  });
}

/** 16 m de la espalda del edificio de la Norte: parasoles blancos cada 3,2 m, losa intermedia y franja azul arriba. */
function parasolTexture() {
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#4f6076'; // el fondo en sombra entre parasoles
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#eef1f4';
    for (let i = 0; i < 5; i++) g.fillRect((i * w) / 5 + 6, h * 0.1, 28, h * 0.82);
    g.fillRect(0, h * 0.4, w, h * 0.06); // losa intermedia
    g.fillStyle = 'rgba(40,52,70,0.12)'; // la sombra que cada parasol le tira al de al lado
    for (let i = 0; i < 5; i++) g.fillRect((i * w) / 5 + 28, h * 0.1, 6, h * 0.82);
    g.fillStyle = '#0f55a4'; // franja azul de arriba
    g.fillRect(0, 0, w, h * 0.1);
    g.fillStyle = '#1b2430'; // planta baja
    g.fillRect(0, h * 0.92, w, h * 0.08);
    grime(g, w, h, 43, 8);
  });
}

/** El cartel de la azotea de la Norte: el nombre del club y del estadio (no es una marca), blanco sobre azul. */
function nameTexture() {
  return canvasTexture(1024, 256, (g, w, h) => {
    g.fillStyle = '#0b4f9e';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#f4f6f8';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '900 118px Arial, sans-serif';
    g.fillText('VÉLEZ SARSFIELD', w / 2, h * 0.38, w - 60);
    g.font = '700 56px Arial, sans-serif';
    g.fillText('ESTADIO JOSÉ AMALFITANI', w / 2, h * 0.78, w - 60);
  });
}

/** El nombre de la Platea Sur en la franja entre bandejas (sin el escudo del medio). */
function plateaTexture() {
  return canvasTexture(512, 32, (g, w, h) => {
    g.fillStyle = '#0d4590';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#f4f6f8';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '700 24px Arial, sans-serif';
    g.fillText('PLATEA CARLOS BIANCHI', w / 2, h / 2 + 1, w - 20);
  });
}

/**
 * Explanada: manchas, losas (opcional) y la sombra de contacto al pie de las tribunas (oclusión horneada, sin SSAO).
 * `W` × `D` = tamaño del plano en metros; `foot` = la planta del estadio: rectángulos [x0, z0, x1, z1] y círculos
 * [x, z, radio] (las curvas de las populares), en metros desde el centro.
 */
function plazaTexture(base, W, D, foot, slabs = true) {
  return canvasTexture(256, 256, (g, w, h) => {
    let seed = 29;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) {
      const x = rnd() * w;
      const y = rnd() * h;
      const rad = 8 + rnd() * 26;
      const rgb = rnd() < 0.5 ? '40,38,32' : '255,250,240';
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, `rgba(${rgb},0.1)`);
      gr.addColorStop(1, `rgba(${rgb},0)`);
      g.fillStyle = gr;
      g.fillRect(x - rad, y - rad, 2 * rad, 2 * rad);
    }
    if (slabs) {
      g.fillStyle = 'rgba(0,0,0,0.07)';
      for (let k = 0; k < w; k += 8) {
        g.fillRect(k, 0, 1, h);
        g.fillRect(0, k, w, 1);
      }
    }
    // El plano se acuesta con -90° en x: el norte (z negativo) queda arriba del dibujo.
    const px = (x) => w / 2 + (x * w) / W;
    const pz = (z) => h / 2 + (z * h) / D;
    g.shadowColor = 'rgba(0,0,0,0.55)';
    g.shadowBlur = 9;
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.beginPath();
    for (const p of foot) {
      if (p.length === 4) g.rect(px(p[0]), pz(p[1]), ((p[2] - p[0]) * w) / W, ((p[3] - p[1]) * h) / D);
      else {
        g.moveTo(px(p[0]) + (p[2] * w) / W, pz(p[1]));
        g.arc(px(p[0]), pz(p[1]), (p[2] * w) / W, 0, Math.PI * 2);
      }
    }
    g.fill();
    g.shadowBlur = 0;
  });
}

/** Pared de afuera de una popular de hoy: toda azul, cerrada, con juntas y un resalte apenas más claro arriba. */
function blueWallTexture() {
  return canvasTexture(512, 512, (g, w, h) => {
    g.fillStyle = '#0a4f9c';
    g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(0,0,0,0.13)';
    for (let y = h / 8; y < h; y += h / 8) g.fillRect(0, y, w, 4);
    g.fillStyle = '#08458c';
    for (let i = 0; i <= 4; i++) g.fillRect((i * w) / 4 - 6, 0, 12, h);
    g.fillStyle = '#2463b3';
    g.fillRect(0, h * 0.12, w, h * 0.07);
    g.fillStyle = '#0a1a38';
    g.fillRect(w * 0.5 + 34, h * 0.86, w / 4 - 68, h * 0.14);
    grime(g, w, h, 41, 20);
  });
}

/**
 * Calzada vieja: 'vieja' (con juntas y una sola línea blanca), 'losas' (hormigón claro recién hecho, sin pintura: la
 * avenida de 1951) o 'tierra' (Villa Luro). La de hoy no cambia.
 */
function oldRoadTexture(kind) {
  return canvasTexture(512, 96, (g, w, h) => {
    let seed = 41;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const dirt = kind === 'tierra';
    const fresh = kind === 'losas';
    g.fillStyle = dirt ? '#8d7b60' : fresh ? '#a8a59b' : '#6d6b64';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.07)' : 'rgba(255,245,220,0.06)';
      g.fillRect(rnd() * w, rnd() * h, 2 + rnd() * 8, 1 + rnd() * 2);
    }
    if (dirt) {
      g.fillStyle = 'rgba(196,176,138,0.3)'; // huellas de carros
      for (const y of [h * 0.3, h * 0.42, h * 0.58, h * 0.7]) g.fillRect(0, y, w, 3);
      g.fillStyle = 'rgba(74,84,44,0.45)'; // pasto y zanja a los costados
      g.fillRect(0, 0, w, 7);
      g.fillRect(0, h - 7, w, 7);
      for (let i = 0; i < 6; i++) { // charcos secos
        g.fillStyle = 'rgba(60,50,38,0.22)';
        g.beginPath();
        g.ellipse(rnd() * w, 14 + rnd() * (h - 28), 10 + rnd() * 22, 4 + rnd() * 6, 0, 0, Math.PI * 2);
        g.fill();
      }
    } else {
      g.fillStyle = 'rgba(0,0,0,0.16)'; // juntas de las losas
      for (let x = 0; x < w; x += 32) g.fillRect(x, 0, 1.5, h);
      g.fillRect(0, h / 4, w, 1.5);
      g.fillRect(0, (3 * h) / 4, w, 1.5);
      if (fresh) return; // sin pintura ni huellas todavía
      g.fillStyle = 'rgba(236,234,224,0.5)'; // una sola línea central, blanca y gastada
      for (let x = 0; x < w; x += 48) g.fillRect(x, h / 2 - 1, 26, 2);
      g.fillStyle = 'rgba(20,18,16,0.12)'; // la huella oscura de los neumáticos
      for (const y of [h * 0.14, h * 0.36, h * 0.6, h * 0.82]) g.fillRect(0, y, w, 5);
    }
  });
}

/** Chorreadura desde `y` hacia abajo (suciedad horneada; sirve en cualquier pared). */
function wallStreak(g, rnd, w, h, y) {
  const len = h * (0.12 + rnd() * 0.4);
  const gr = g.createLinearGradient(0, y, 0, y + len);
  gr.addColorStop(0, `rgba(52,46,38,${(0.1 + rnd() * 0.2).toFixed(2)})`);
  gr.addColorStop(1, 'rgba(52,46,38,0)');
  g.fillStyle = gr;
  g.fillRect(rnd() * w, y, 2 + rnd() * 7, len);
}

/** Pie de pared oscuro: humedad y oclusión horneadas. */
function wallFoot(g, w, h) {
  const foot = g.createLinearGradient(0, h * 0.86, 0, h);
  foot.addColorStop(0, 'rgba(20,24,18,0)');
  foot.addColorStop(1, 'rgba(20,24,18,0.38)');
  g.fillStyle = foot;
  g.fillRect(0, h * 0.86, w, h * 0.14);
}

/** Suciedad horneada de una pared: `n` chorreaduras desde arriba o desde media altura y el pie oscuro. */
function grime(g, w, h, seed0, n) {
  let seed = seed0;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < n; i++) wallStreak(g, rnd, w, h, rnd() < 0.5 ? h * 0.1 : h * 0.5);
  wallFoot(g, w, h);
}

/** Deja de un dibujo solo las butacas: la V y «VELEZ» están hechas con butacas blancas sueltas, no pintadas. */
function asSeats(g, w, h, sx, sy) {
  g.globalCompositeOperation = 'destination-in';
  g.beginPath();
  for (let y = 0; y < h; y += sy) for (let x = 0; x < w; x += sx) g.rect(x + 0.5, y + 2, sx - 1, sy * 0.8);
  g.fill();
  g.globalCompositeOperation = 'source-over';
}

/** Haz de una torre (solo de noche): degradé de la punta hacia la cancha. */
function beamTexture() {
  return canvasTexture(4, 64, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, 'rgba(255,255,255,0.55)');
    gr.addColorStop(0.5, 'rgba(255,255,255,0.12)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
  });
}

/** Resplandor de una torre encendida. */
function haloTexture() {
  return canvasTexture(128, 128, (g, w, h) => {
    const grad = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    grad.addColorStop(0, 'rgba(255,255,255,0.95)');
    grad.addColorStop(0.12, 'rgba(255,250,240,0.5)');
    grad.addColorStop(0.4, 'rgba(240,244,255,0.14)');
    grad.addColorStop(1, 'rgba(240,244,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  });
}

/** Red del arco: cuadrícula blanca sobre transparente. */
function netTexture() {
  return canvasTexture(64, 64, (g, w, h) => {
    g.strokeStyle = 'rgba(255,255,255,0.85)';
    g.lineWidth = 3;
    g.strokeRect(0, 0, w, h);
  });
}

/** Carteles LED al borde de la cancha (texto propio, sin marcas). */
function boardsTexture() {
  return canvasTexture(1024, 64, (g, w, h) => {
    const words = ['VÉLEZ SARSFIELD', 'EL FORTÍN'];
    g.font = '900 44px Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (let i = 0; i < 2; i++) {
      g.fillStyle = i ? '#ffffff' : '#0061a8';
      g.fillRect((i * w) / 2, 0, w / 2, h);
      g.fillStyle = i ? '#0061a8' : '#ffffff';
      g.fillText(words[i], (i * w) / 2 + w / 4, h / 2 + 3);
    }
  });
}

/** Los reflectores de una torre: filas de focos. */
function lampsTexture(warm, cols = 9, rows = 5) {
  return canvasTexture(cols * 28, rows * 28, (g, w, h) => {
    g.fillStyle = warm ? '#20252c' : '#8e949c'; // hoy la parrilla es un reticulado blanco, no un panel oscuro
    g.fillRect(0, 0, w, h);
    g.fillStyle = warm ? '#fff0b8' : '#f6f9ff';
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        g.beginPath();
        g.arc(((c + 0.5) * w) / cols, ((r + 0.5) * h) / rows, 9, 0, Math.PI * 2);
        g.fill();
      }
    }
  });
}

/** Cielo: degradé de arriba hacia el horizonte. */
function skyTexture(top, horizon) {
  return canvasTexture(4, 256, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, top);
    grad.addColorStop(0.75, horizon);
    grad.addColorStop(1, horizon);
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  });
}
const SKY = { day: ['#5f9bd6', '#dce8f3'], dusk: ['#121822', '#2b3542'], night: ['#02050b', '#0d1626'] };

/**
 * La cara de arriba de una bandeja (escalones y contrahuellas) con el dibujo de las filas: u a lo largo (una
 * escalera cada `period` metros, ajustado para que caiga justo en las puntas) y v = número de fila (la parte
 * `RISER` de abajo de cada fila es la contrahuella, que es lo que se ve de frente).
 */
function stepsGeometry(p, period, row = 1.2) {
  const n = Math.max(1, Math.round(p.d / row));
  const h = p.len / 2;
  const reps = Math.max(1, Math.round(p.len / period));
  const pos = [];
  const nor = [];
  const uv = [];
  const idx = [];
  const quad = (ua, va, ub, vb, normal, t0, t1) => {
    const i = pos.length / 3;
    pos.push(ua, va, -h, ua, va, h, ub, vb, h, ub, vb, -h);
    for (let k = 0; k < 4; k++) nor.push(...normal);
    uv.push(0, t0, reps, t0, reps, t1, 0, t1);
    idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
  };
  for (let i = 0; i < n; i++) {
    const u0 = (p.d * i) / n;
    const u1 = (p.d * (i + 1)) / n;
    const vPrev = p.y0 + ((p.y1 - p.y0) * i) / n;
    const v = p.y0 + ((p.y1 - p.y0) * (i + 1)) / n;
    // Cada celda de la textura es el escalón desplegado: abajo la contrahuella, arriba la huella.
    quad(u0, vPrev, u0, v, [-1, 0, 0], i, i + RISER);
    quad(u0, v, u1, v, [0, 1, 0], i + RISER, i + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  return geo;
}

/**
 * Planta en trapecio: abre cada punta `p.flare` metros hacia atrás. Vale para las geometrías de una bandeja, que
 * van con la distancia al frente en x y el largo en z.
 */
function flared(geo, p) {
  if (!p.flare) return geo;
  const a = geo.attributes.position;
  const k = (2 * p.flare) / p.len;
  for (let i = 0; i < a.count; i++) a.setZ(i, a.getZ(i) * (1 + (k * a.getX(i)) / p.d));
  geo.computeVertexNormals();
  return geo;
}

function screenTexture() {
  return canvasTexture(512, 210, (g, w, h) => {
    g.fillStyle = '#0b2f63';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffffff';
    g.font = '900 96px Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('VÉLEZ', w / 2, h / 2);
  });
}

/**
 * Crea la escena en `container`. `sectores` = club.json › estadio.tribunas.sectores. `onPick(id, level)` se llama
 * al tocar una tribuna. `era`, `night` y `crowd` = con qué arranca (así el primer dibujo ya sale bien).
 * Devuelve { select, view, reset, getCamera, setAutoRotate, setCrowd, setNight, dispose }.
 */
export function createStadium(container, options) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  try {
    return buildStadium(container, renderer, options);
  } catch (err) {
    // Si el armado falla a mitad de camino no tienen que quedar el canvas ni el contexto WebGL dando vueltas.
    renderer.dispose();
    renderer.forceContextLoss();
    renderer.domElement.remove();
    container.querySelector('.st3d-labels')?.remove();
    throw err;
  }
}

/** La escena sobre un renderer ya creado (aparte para poder armarla en los tests con un renderer falso). */
export function buildStadium(container, renderer, { sectores, era = 'hoy', start, onPick, reducedMotion = false, night: startNight = false, crowd: startCrowd = false }) {
  const { layout, style } = ERAS[era] ?? ERAS.hoy;
  const E = ENTORNO[era] ?? {};
  const today = layout === ERAS.hoy.layout; // las tribunas de hoy son las que se pueden elegir
  const T = TONOS[era] ?? {};
  const tones = (name) => T[name] ?? SEATS[name]; // los colores de una grada en esta época
  const [seat, seatAlt, popular] = tones(style.seats);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  // Nada de lo que tira sombra se mueve: el mapa de sombras se dibuja una sola vez, en el primer cuadro.
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // Sin esto, de noche los reflectores recortan canal por canal y el césped se vuelve menta.
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1;
  container.appendChild(renderer.domElement);
  renderer.domElement.className = 'st3d-canvas';

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 1, 2000);
  camera.position.set(...(start?.pos ?? DEFAULT_VIEW.pos));
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enablePan = false;
  Object.assign(controls, ORBIT);
  controls.autoRotateSpeed = 0.6;
  controls.target.set(...(start?.target ?? DEFAULT_VIEW.target));

  // El sol viene del noreste (en Buenos Aires nunca del sur): la Sur queda a pleno sol y la Norte, en sombra propia.
  // El relleno (hemisférica) alto para que la Norte no quede negra; el sol, apenas cálido para no comerse el azul.
  // Parte del relleno lo pone el mapa de entorno (ver envOf): por eso la hemisférica bajó de 1,05 a 0,8.
  const DAY = { hemi: 0.8, sun: 2.6 };
  const hemi = new THREE.HemisphereLight(0xbcd6f5, 0x7f8690, DAY.hemi);
  const sun = new THREE.DirectionalLight(0xfff8ee, DAY.sun);
  sun.position.set(90, 240, -130);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -190, right: 190, top: 190, bottom: -190, near: 10, far: 600 });
  scene.add(hemi, sun);

  const disposables = [];
  const keep = (x) => {
    disposables.push(x);
    return x;
  };
  const mat = (color, extra = {}) => keep(new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.05, ...extra }));
  const add = (geo, material, { cast = true, receive = true } = {}) => {
    keep(geo);
    const m = new THREE.Mesh(geo, material);
    m.castShadow = cast;
    m.receiveShadow = receive;
    return m;
  };
  /**
   * Todo lo repetido va en una sola malla instanciada (un draw call). `items`: [[x, y, z, sx, sy, sz, rotY, color]],
   * con la medida en la escala (la geometría suele ser la caja unitaria). Lo de menos de 0,5 m de grosor, sin sombra.
   */
  const instanced = (geo, material, items, { cast = true, parent = scene } = {}) => {
    const mesh = new THREE.InstancedMesh(geo, material, items.length);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const c = new THREE.Color();
    items.forEach(([x, y, z, sx = 1, sy = 1, sz = 1, rot = 0, color], i) => {
      mesh.setMatrixAt(i, m4.compose(new THREE.Vector3(x, y, z), q.setFromAxisAngle(up, rot), new THREE.Vector3(sx, sy, sz)));
      if (color != null) mesh.setColorAt(i, c.set(color));
    });
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const unitBox = keep(new THREE.BoxGeometry(1, 1, 1));

  // Piso y explanada alrededor del estadio.
  // El piso entre las casas son calles (asfalto); la explanada, cemento.
  const GROUND_DAY = E.ground ?? 0x8b8f8a;
  const groundMat = mat(GROUND_DAY);
  const ground = add(new THREE.PlaneGeometry(3200, 3200), groundMat, { cast: false });
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.05;
  scene.add(ground);
  // La explanada lleva horneada la sombra de contacto al pie de las tribunas (la planta del estadio, con las curvas).
  // En Villa Luro no hay explanada: solo el terreno pisado de la manzana, entre las cuatro calles de tierra.
  const VL = { x: 78, z: 60 }; // ejes de las cuatro calles de la manzana
  const villa = style.streets === 'villa-luro';
  const PW = villa ? 2 * (VL.x - 4) : PITCH.length + 2 * 92;
  const PD = villa ? 2 * (VL.z - 4) : PITCH.width + 2 * 104;
  const foot = [];
  for (const lado of Object.keys(layout)) {
    const [ox, oz] = OUT[lado];
    const last = layout[lado].at(-1);
    const deep = FRONT[lado] + depthOf(lado, layout) + (last.back ?? 0);
    const half = Math.max(...layout[lado].map((p) => p.len / 2 + (p.flare ?? 0)));
    foot.push(ox ? [Math.min(ox * FRONT[lado], ox * deep), -half, Math.max(ox * FRONT[lado], ox * deep), half] : [-half, Math.min(oz * FRONT[lado], oz * deep), half, Math.max(oz * FRONT[lado], oz * deep)]);
    for (const p of layout[lado]) if (p.curved) for (const sgn of [-1, 1]) foot.push([ox * FRONT[lado], (sgn * p.len) / 2, p.d]);
  }
  const plaza = add(new THREE.PlaneGeometry(PW, PD), mat(0xffffff, { map: keep(plazaTexture(E.plaza ?? '#b5b2ac', PW, PD, foot, E.slabs ?? true)), roughness: 0.95 }), { cast: false });
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.y = -0.02;
  scene.add(plaza);
  // Alrededores: Av. Juan B. Justo por el norte (con una arboleda entre la avenida y la Norte) y la
  // Autopista Perito Moreno (AU6), elevada, del lado de la Sur, como se ve en la foto aérea. En Villa Luro, las
  // cuatro calles de la manzana y las casas del barrio.
  const roadTex = keep(E.calle ? oldRoadTexture(E.calle) : roadTexture(E.avenida));
  roadTex.wrapS = THREE.RepeatWrapping;
  roadTex.repeat.set(villa ? 22 : 8, 1); // por cada 1000 m (las calles de tierra son angostas: el dibujo se repite más)
  const roadMat = mat(0xffffff, { map: roadTex, roughness: E.calle === 'tierra' ? 1 : 0.85 });
  const streets = []; // [texto, posición del cartel]
  const road = (w, x, z, rotY = 0, y = 0.03, material = roadMat, length = 1000) => {
    const geo = new THREE.PlaneGeometry(length, w);
    // Un tramo más corto usa la parte que le toca del dibujo (si no, se comprime).
    if (length !== 1000) for (let i = 0; i < geo.attributes.uv.count; i++) geo.attributes.uv.setX(i, (geo.attributes.uv.getX(i) * length) / 1000);
    const r = add(geo, material, { cast: false });
    r.rotation.set(-Math.PI / 2, 0, rotY);
    r.position.set(x, y, z);
    scene.add(r);
  };
  const houseMat = mat(0xffffff, { emissive: 0x000000 });
  const treeSpots = []; // [x, z, radio, color opcional]: árboles sueltos (barrio, alrededor del estadio)
  // Casas del barrio fuera de `skip` (siempre las mismas: pseudoaleatorio con semilla fija). Cada 6 casas, una calle.
  // `green` = parte de los lotes sin casa y `trees` = cuántos de esos tienen un árbol; `tall` = parte de edificios
  // altos (los tres, número o función de x, z). `step` = lado del lote, `size` y `low` = [base, variación] del
  // ancho y la altura de las casas. `hide(x, z)` = lotes que se sortean pero no se dibujan: sirve para despejar un
  // lugar sin correr la secuencia pseudoaleatoria (con `skip` cambian todas las casas que vienen después).
  const barrio = ({ rangeX, rangeZ, skip, sat, tall, green = 0.18, trees = 0.75, step = 13, size = [9, 2], low = [3, 5], streets: grid = rangeX > 300, hide }) => {
    const at = (v, x, z) => (typeof v === 'function' ? v(x, z) : v);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const max = 2600; // por tanda; hoy son unas 2300 casas entre las dos
    const box = keep(new THREE.BoxGeometry(1, 1, 1));
    // Dos tandas: las de cerca tiran sombra; las de lejos no (la sombra del sol no llega hasta ahí).
    const sets = [0, 1].map(() => ({ mesh: new THREE.InstancedMesh(box, houseMat, max), n: 0 }));
    const m4 = new THREE.Matrix4();
    const color = new THREE.Color();
    const far2 = Math.max(rangeX, rangeZ) ** 2;
    for (let i = 0, x = -rangeX; x <= rangeX; x += step, i++) {
      for (let j = 0, z = -rangeZ; z <= rangeZ; z += step, j++) {
        const street = grid && (i % 7 === 0 || j % 7 === 0);
        if (street || skip(x, z) || x * x + z * z > far2) continue;
        const hidden = hide?.(x, z) ?? false;
        // Uno de cada cinco o seis lotes queda sin casa; la mayoría, con un árbol (el barrio es muy arbolado).
        if (rnd() < at(green, x, z)) {
          if (rnd() < at(trees, x, z)) {
            const r = 3 + rnd() * 2;
            if (!hidden) treeSpots.push([x, z, r]);
          }
          continue;
        }
        const set = sets[Math.abs(x) < 230 && Math.abs(z) < 230 ? 0 : 1];
        if (set.n >= max) continue;
        const h = rnd() < at(tall, x, z) ? 14 + rnd() * 16 : low[0] + rnd() * low[1];
        m4.compose(new THREE.Vector3(x + rnd() * 2, h / 2, z + rnd() * 2), new THREE.Quaternion(), new THREE.Vector3(size[0] + rnd() * size[1], h, size[0] + rnd() * size[1]));
        // En sRGB (si no, three toma los valores como lineales y todo sale lavado). Una de cada cinco, techo de teja.
        const hr = rnd();
        const lr = rnd();
        if (hidden) continue;
        set.mesh.setMatrixAt(set.n, m4);
        set.mesh.setColorAt(set.n, lr < 0.2
          ? color.setHSL(0.045, 0.22, 0.55, THREE.SRGBColorSpace)
          : color.setHSL(0.07 + hr * 0.05, sat, 0.55 + lr * 0.2, THREE.SRGBColorSpace));
        set.n++;
      }
    }
    sets.forEach((set, i) => {
      set.mesh.count = set.n;
      set.mesh.castShadow = i === 0;
      set.mesh.receiveShadow = true;
      scene.add(set.mesh);
    });
  };
  // La autopista (foto aérea): no va pegada a la Sur (en el medio hay árboles y una cancha de tenis) ni es recta;
  // se abre hacia el oeste y después dobla hacia el norte. Traza aproximada, a ojo: [x, metros desde la espalda de la Sur].
  // El hueco entre la Sur y la autopista se agranda hacia el oeste (unos 37 m a la altura de la cancha de tenis).
  const liniers = style.streets === 'liniers';
  const zSur = FRONT.sur + depthOf('sur', layout);
  const zN = -(FRONT.norte + depthOf('norte', layout));
  // La espalda de lo que haya detrás de la Norte (hoy, el edificio): de ahí cuelgan los árboles del lado norte.
  const zNb = zN - (layout.norte.at(-1).back ?? 0);
  // La avenida no se mueve entre épocas (z ≈ -153, donde la ubica la foto aérea): lo que crece o se achica es el
  // terreno entre la tribuna y la avenida.
  const zJusto = Z_JUSTO;
  // La traza de la autopista se calcula siempre con la Sur de hoy: sirve también para dejarla libre antes de que exista.
  const zSurHoy = FRONT.sur + depthOf('sur', ERAS.hoy.layout);
  const AU6_STEPS = 120;
  const au6 = new THREE.CatmullRomCurve3([[620, 30], [300, 36], [90, 44], [0, 62], [-100, 80], [-240, 56], [-380, 6], [-560, -80]].map(([x, dz]) => new THREE.Vector3(x, 0, zSurHoy + dz)));
  const au6Pts = au6.getSpacedPoints(AU6_STEPS);
  const nearAu6 = (x, z, d) => au6Pts.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 < d * d);
  const inBox = (x, z, x0, x1, z0, z1) => x > x0 && x < x1 && z > z0 && z < z1;
  // Las pocas torres de verdad del barrio de hoy (bases a ±40 m): [x, z, lado, alto]. Las dos últimas, al sudoeste y
  // lejos, salen de la foto de feb-2026 (±60 m).
  const TORRES = liniers ? [[-435, -97, 16, 68], [-254, -101, 13, 36], [-391, -63, 24, 26], [-337, 60, 13, 30], [-125, 330, 16, 70], [-185, 350, 18, 62]] : [];
  if (villa) {
    // La manzana (Basualdo, Pizarro, Guardia Nacional y Schmidl) y, para que se lea la cuadrícula, dos calles más
    // por lado. Las cuatro de la manzana siguen hacia el campo; las de afuera terminan con el caserío. Los lotes
    // son de 12 m para que una fila caiga justo en cada calle: así ninguna casa queda parada sobre una.
    for (const [lado, name] of Object.entries(VILLA_LURO)) {
      const [ox, oz] = OUT[lado];
      streets.push([name, [ox * VL.x + (oz ? 60 : 0), 2, oz * VL.z + (ox ? 40 : 0)]]);
    }
    const OUTER = { x: 234, z: 180 };
    const R = 258; // el caserío es un círculo de este radio
    for (const s of [-1, 1]) {
      road(8, s * VL.x, 0, Math.PI / 2, 0.03, roadMat, 900);
      road(8, 0, s * VL.z, 0, 0.034, roadMat, 900);
      road(8, s * OUTER.x, 0, Math.PI / 2, 0.03, roadMat, 2 * Math.sqrt(R * R - OUTER.x ** 2));
      road(8, 0, s * OUTER.z, 0, 0.034, roadMat, 2 * Math.sqrt(R * R - OUTER.z ** 2));
    }
    const onRoad = (x, z) => [VL.x, OUTER.x].some((v) => Math.abs(Math.abs(x) - v) < 3) || [VL.z, OUTER.z].some((v) => Math.abs(Math.abs(z) - v) < 3);
    barrio({
      rangeX: R, rangeZ: 216, sat: 0.14, tall: 0, green: E.green, trees: E.trees, ...E.barrio,
      skip: (x, z) => (Math.abs(x) < VL.x + 9 && Math.abs(z) < VL.z + 9) || onRoad(x, z) || (E.libre?.(x, z, { nearAu6, inBox, zSurHoy }) ?? false),
    });
    // Más allá del caserío, campo: algún árbol suelto (quintas). Inferencia; cantidad moderada.
    let s = 19;
    const r1 = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < (E.campo ?? 0); i++) {
      const a = r1() * Math.PI * 2;
      const d = R + 25 + r1() * 260;
      const [x, z] = [Math.cos(a) * d, Math.sin(a) * d];
      const r = 3.5 + r1() * 3;
      if (!onRoad(x, z)) treeSpots.push([x, z, r]);
    }
  } else {
    road(28, 0, zJusto);
    streets.push(['Av. Juan B. Justo', [80, 2, zJusto]]);
    // El barrio de Liniers alrededor (genérico: no son los edificios reales) y los árboles de la avenida.
    const plazaX = PITCH.length / 2 + 100;
    const plazaZ = PITCH.width / 2 + 112;
    // Hoy, donde no hay casas: la autopista, la playa del Este, el parque y el galpón del otro lado de la avenida y
    // las instalaciones del club al oeste. Entre la Sur y la autopista, al oeste de las canchas, sí hay casas.
    const taken = (x, z) => nearAu6(x, z, 32)
      || inBox(x, z, 150, 262, -112, 66)
      || inBox(x, z, -36, 112, zJusto - 92, zJusto - 20)
      || inBox(x, z, -270, -36, zJusto - 122, zJusto - 20)
      || inBox(x, z, -230, -150, -15, 75);
    const surStrip = (x, z) => liniers && x > -150 && x < -20 && z > zSur + 26;
    // Y al noroeste, entre la Norte y la avenida, construcciones bajas (si no queda un rectángulo pelado).
    const nwStrip = (x, z) => liniers && x > -150 && x < -80 && z < zN - 12 && z > zJusto + 24;
    // Talleres ferroviarios al sudeste, cruzando la autopista: naves de techo en diente de sierra (ubicación a ojo, ±40 m).
    const naves = E.naves ? [100, 268, zSurHoy + 82, zSurHoy + 142] : null;
    barrio({
      rangeX: 520,
      rangeZ: 520,
      skip: (x, z) => (Math.abs(x) < plazaX && Math.abs(z) < plazaZ && !surStrip(x, z) && !nwStrip(x, z)) || Math.abs(z - zJusto) < 24 || (liniers && taken(x, z)) || (E.libre?.(x, z, { nearAu6, inBox, zSurHoy }) ?? false),
      // No se dibuja lo que quedaría atravesado por una torre o debajo de los galpones (sin correr la secuencia).
      hide: (x, z) => TORRES.some(([tx, tz, w]) => Math.abs(x - tx) < w / 2 + 8 && Math.abs(z - tz) < w / 2 + 8) || (naves != null && inBox(x, z, ...naves)),
      sat: 0.06,
      // Hoy: tejido bajo y muy arbolado, y lejos al sur una franja de edificios medianos (foto de feb-2026).
      tall: liniers ? (x, z) => (z > 330 ? 0.22 : 0.02) : 0,
      green: liniers ? 0.26 : E.green ?? 0.18,
      trees: liniers ? 0.9 : E.trees ?? 0.75,
      ...E.barrio,
    });
    if (naves) {
      const tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.22);
      const sheds = new THREE.InstancedMesh(keep(new THREE.BoxGeometry(20, 8, 44)), mat(0x8f5a48, { roughness: 0.9 }), 7);
      for (let i = 0; i < 7; i++) sheds.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(118 + i * 22, 3.2, zSurHoy + 112), tilt, new THREE.Vector3(1, 1, 1)));
      sheds.receiveShadow = true; // están a más de 190 m: la sombra del sol no llega
      scene.add(sheds);
    }
    // Los árboles de la avenida; `arbolAv` = tamaño según la época (0 = todavía no hay).
    const kAv = liniers ? 1 : E.arbolAv ?? 1;
    if (kAv > 0) {
      const crown = keep(new THREE.IcosahedronGeometry(1, 1));
      const trees = new THREE.InstancedMesh(crown, mat(0x4d7a3c, { flatShading: true }), 140);
      const m4 = new THREE.Matrix4();
      let n = 0;
      for (let x = -500; x <= 500; x += 15) {
        for (const dz of [-17.5, 17.5]) {
          const r = (2.6 + ((x * 7 + dz) % 5 + 5) % 5 * 0.3) * kAv;
          m4.compose(new THREE.Vector3(x, r + 1.5 * kAv, zJusto + dz), new THREE.Quaternion(), new THREE.Vector3(r, r * 1.15, r));
          trees.setMatrixAt(n++, m4);
        }
      }
      trees.count = n;
      trees.castShadow = true;
      scene.add(trees);
    }
    // Autos de época en la avenida: cajas genéricas (sin marca), pocos. Sin sombra: son chicos y la mayoría queda
    // fuera de lo que cubre el mapa de sombras.
    if (!liniers && E.autos) {
      let sc = 5;
      const rc = () => ((sc = (sc * 16807) % 2147483647) / 2147483647);
      instanced(keep(new THREE.BoxGeometry(4.4, 1.5, 1.8)), mat(0xffffff, { roughness: 0.4, metalness: 0.2 }),
        Array.from({ length: E.autos }, (_, i) => [-480 + (i + rc() * 0.6) * (960 / E.autos), 0.78, zJusto + [-9, -4.5, 4.5, 9][i % 4], 1, 1, 1, 0, E.pintura[Math.floor(rc() * E.pintura.length)]]),
        { cast: false });
    }
    if (liniers) {
      // Hoy (foto aérea): arboleda de copas grandes e irregulares entre la Norte y la avenida (al noreste queda
      // explanada sin árboles), un parque del otro lado de la avenida con algún lapacho rosado, una hilera entre la
      // Sur y la autopista al oeste de las canchas y tres árboles al este de la de tenis.
      let s = 11;
      const r2 = () => ((s = (s * 16807) % 2147483647) / 2147483647);
      // Entre la fachada del edificio y la hilera de la avenida (las copas llegan casi a tocar la fachada). Con el
      // edificio de 28 m de fondo entra una sola hilera; cada árbol sortea tres números, como antes.
      const room = zNb - 3 - (zJusto + 21);
      const rows = room > 30 ? 2 : 1;
      const rad = Math.max(3, Math.min(7, room / (2 * rows) - 0.5));
      for (let k = 0; k < rows; k++) for (let x = -70; x <= 50; x += 13) treeSpots.push([x + r2() * 6 - 3, zNb - 3 - rad * (2 * k + 1) - r2(), rad + r2() * 1.5]);
      // Con una sola hilera, se sortean igual los números de la segunda: así el parque de enfrente no cambia.
      for (let k = rows; k < 2; k++) for (let x = -70; x <= 50; x += 13) for (let i = 0; i < 3; i++) r2();
      for (let x = -25; x <= 105; x += 14) {
        for (let z = zJusto - 30; z >= zJusto - 82; z -= 14) {
          if (r2() < 0.8) treeSpots.push([x + r2() * 6, z + r2() * 6, 5 + r2() * 2.5, r2() < 0.12 ? 0xd58fb4 : null]);
        }
      }
      for (let x = -150; x <= -18; x += 11) treeSpots.push([x, zSur + 22, 3.6 + (((x % 3) + 3) % 3) * 0.5]);
      treeSpots.push([70, zSur + 8, 3.5], [80, zSur + 3, 4], [90, zSur + 12, 3.5]);
      // Borde oeste y norte de la playa del Este.
      treeSpots.push([112, 21, 4], [112, -9, 4], [106, -53, 4.5], [110, -82, 4]);
      for (let x = 118; x <= 250; x += 12) treeSpots.push([x, -102, 4.5]);
    }
  }
  if (liniers) {
    // Cinta a lo largo de la curva, entre dos bordes (distancia al eje y altura de cada uno).
    const step = au6.getLength() / AU6_STEPS;
    const tangents = au6Pts.map((_, i) => au6.getTangentAt(i / AU6_STEPS));
    const ribbon = (offA, yA, offB, yB, material, cast = false) => {
      const pos = [];
      const uv = [];
      const idx = [];
      au6Pts.forEach((p, i) => {
        const t = tangents[i];
        pos.push(p.x - t.z * offA, yA, p.z + t.x * offA, p.x - t.z * offB, yB, p.z + t.x * offB);
        uv.push((i * step) / 125, 0, (i * step) / 125, 1);
        if (i) idx.push(2 * i - 2, 2 * i - 1, 2 * i, 2 * i, 2 * i - 1, 2 * i + 1);
      });
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      scene.add(add(geo, material, { cast }));
    };
    const laneTex = keep(roadTex.clone());
    laneTex.needsUpdate = true;
    laneTex.repeat.set(1, 1);
    const concrete = mat(0x9aa1aa, { side: THREE.DoubleSide });
    // Dos calzadas de cuatro carriles con banquinas (unos 40 m de ancho) y un separador de hormigón en el medio.
    ribbon(-19, 9.02, 19, 9.02, mat(0xffffff, { map: laneTex, side: THREE.DoubleSide }));
    ribbon(-20, 7.4, 20, 7.4, concrete, true);
    for (const off of [-20, 20]) ribbon(off, 7.4, off, 9.9, concrete, true);
    ribbon(0, 9.02, 0, 9.95, concrete);
    const up = new THREE.Vector3(0, 1, 0);
    const one = new THREE.Vector3(1, 1, 1);
    const m4 = new THREE.Matrix4();
    const turn = new THREE.Quaternion();
    const piers = new THREE.InstancedMesh(keep(new THREE.BoxGeometry(2, 7.4, 14)), mat(0xa9b0b8), Math.floor(AU6_STEPS / 3) + 1);
    for (let i = 0, k = 0; i <= AU6_STEPS; i += 3) {
      turn.setFromAxisAngle(up, -Math.atan2(tangents[i].z, tangents[i].x));
      piers.setMatrixAt(k++, m4.compose(new THREE.Vector3(au6Pts[i].x, 3.7, au6Pts[i].z), turn, one));
    }
    piers.castShadow = true;
    piers.receiveShadow = true;
    scene.add(piers);
    const mid = au6Pts[Math.round(AU6_STEPS * 0.47)];
    streets.push(['Autopista Perito Moreno (AU6)', [mid.x, 12, mid.z]]);
    // Pisos (playas, canchas, pileta) y edificios sueltos: una malla instanciada de cada cosa, con el color por instancia.
    const flats = [];
    const blocks = [];
    const flat = (w, d, color, x, z, y = 0.01) => flats.push([x, y, z, w, 1, d, 0, color]);
    const block = (w, h, d, color, x, z, rotY = 0) => blocks.push([x, h / 2, z, w, h, d, rotY, color]);
    // Ubicaciones sacadas de la foto aérea (±10 m cerca del estadio, peor lejos). La playa del lado de la Popular
    // Este, casi vacía, con una isleta redonda de pasto; junto a la Sur, la cancha de tenis de polvo de ladrillo
    // (a la altura de la punta este) y otra cancha oscura (inferida); detrás de la Popular Oeste, una pileta, un
    // verde y dos edificios bajos del club.
    flat(138, 150, 0x84807a, 181, -15);
    // La parte sur de la playa hoy son canchas de piso azul (foto de feb-2026; los bordes, a ojo).
    flat(72, 44, 0x2f74c0, 161, 36, 0.012);
    const isla = add(new THREE.CircleGeometry(9, 24), mat(0x5c9a52), { cast: false });
    isla.rotation.x = -Math.PI / 2;
    // Lo reconocible es que el mástil de la torre sudeste nace en el borde de la isleta: va atada a la torre.
    isla.position.set(TOWERS[0][0] + 5.5, 0.015, TOWERS[0][1] + 6);
    scene.add(isla);
    flat(36, 18, 0xc9703f, 40, zSur + 18); // despegada de los cuerpos de rampas, que salen 7 m
    flat(30, 16, 0x2e6f73, 0, zSur + 28);
    const xO = -(FRONT.oeste + depthOf('oeste', layout));
    flat(28, 13, 0x4db3d9, xO - 50, 0);
    flat(40, 30, 0x4f9a55, xO - 60, 30);
    block(14, 6, 55, 0xeef0f2, xO - 111, 34, -0.73);
    block(95, 10, 14, 0xf2f3f4, xO - 71, 63); // tres pisos (foto de feb-2026)
    // Del otro lado de la avenida, al noroeste: un galpón comercial grande y bajo de techo claro (sin cartel ni
    // marca) con su playa. Y las pocas torres de verdad del barrio.
    block(140, 9, 94, 0xe6e3dc, -192, zJusto - 69);
    flat(75, 70, 0x767c84, -78, zJusto - 61);
    for (const [x, z, w, h] of TORRES) block(w, h, w, 0xdcd8d0, x, z);
    instanced(keep(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)), mat(0xffffff), flats, { cast: false });
    instanced(unitBox, mat(0xffffff), blocks);
    // Autos (genéricos) en las playas, la avenida y la autopista.
    let seed = 3;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const paint = [0xf2f2f2, 0xd9dcdf, 0x9ea4ab, 0x2b2f36, 0x1c1f24, 0xa32a2a, 0x25508f, 0xf2f2f2, 0x7c8590];
    const MAX_CARS = 480;
    const cars = new THREE.InstancedMesh(keep(new THREE.BoxGeometry(4.3, 1.4, 1.8)), mat(0xffffff, { roughness: 0.35, metalness: 0.3 }), MAX_CARS);
    const q = new THREE.Quaternion();
    const color = new THREE.Color();
    let n = 0;
    const car = (x, y, z, rot) => {
      if (n >= MAX_CARS) return;
      m4.compose(new THREE.Vector3(x, y, z), rot, one);
      cars.setMatrixAt(n, m4);
      cars.setColorAt(n++, color.set(paint[Math.floor(rnd() * paint.length)]));
    };
    for (const x of [124, 142, 160, 178, 196, 214, 232]) for (let z = -84; z <= 54; z += 2.7) {
      if (rnd() >= 0.18) continue;
      if (x < 200 && z > 12) rnd(); // sobre las canchas no se estaciona (el sorteo del color se hace igual)
      else car(x, 0.75, z, q);
    }
    for (const x of [-108, -90, -72, -54]) for (let z = zJusto - 92; z <= zJusto - 30; z += 2.7) if (rnd() < 0.3) car(x, 0.75, z, q);
    for (const lane of [-10.5, -6, 6, 10.5]) for (let x = -480 + rnd() * 30; x <= 480; x += 14 + rnd() * 40) car(x, 0.75, zJusto + lane, q);
    const length = au6.getLength();
    for (const lane of [-14.5, -8, 8, 14.5]) {
      for (let d = rnd() * 30; d < length; d += 14 + rnd() * 40) {
        const p = au6.getPointAt(d / length);
        const t = au6.getTangentAt(d / length);
        car(p.x - t.z * lane, 9.75, p.z + t.x * lane, turn.setFromAxisAngle(up, -Math.atan2(t.z, t.x)));
      }
    }
    cars.count = n;
    cars.castShadow = true;
    scene.add(cars);
  }

  if (treeSpots.length) {
    const grove = new THREE.InstancedMesh(keep(new THREE.IcosahedronGeometry(1, 1)), mat(0xffffff, { flatShading: true }), treeSpots.length);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const color = new THREE.Color();
    treeSpots.forEach(([x, z, r, c], i) => {
      m4.compose(new THREE.Vector3(x, r + 1.2, z), q, new THREE.Vector3(r, r * 1.1, r));
      grove.setMatrixAt(i, m4);
      // Oliva oscuro, en sRGB: el estadio tiene que ser lo más claro y saturado de la escena.
      grove.setColorAt(i, c != null ? color.set(c) : color.setHSL(0.24 + ((i * 37) % 10) * 0.006, 0.34, 0.27 + ((i * 53) % 10) * 0.012, THREE.SRGBColorSpace));
    });
    scene.add(grove);
  }

  // El césped de cada época sale de `style.pitch` (franjas, desgaste, medialunas, tono). La rugosidad cambia de una
  // franja de corte a la otra: con el mapa de entorno, cada franja refleja distinto.
  const pitchTex = keep(pitchTexture(style.pitch));
  const pitchRough = keep(pitchRoughTexture(style.pitch?.stripes ?? 1));
  const pitch = add(new THREE.PlaneGeometry(PITCH.length + 2 * GAP, PITCH.width + 2 * GAP), mat(0xffffff, { map: pitchTex, roughnessMap: pitchRough, roughness: 1 }), { cast: false });
  pitch.rotation.x = -Math.PI / 2;
  pitch.position.y = 0.02;
  scene.add(pitch);

  // Arcos (7,32 × 2,44 m) con la red.
  const white = mat(0xf4f4f4, { roughness: 0.5 });
  const netTex = keep(netTexture());
  netTex.wrapS = THREE.RepeatWrapping;
  netTex.wrapT = THREE.RepeatWrapping;
  const netMats = new Map(); // un material por tamaño de paño (costado, fondo y techo), color y malla
  // Paño de red o de reja: `cell` = lado de cada cuadro, en metros. Sirve para los arcos, la reja de las populares y
  // los alambrados de las épocas viejas.
  const net = (w, h, color = 0xffffff, cell = 0.35) => {
    const key = `${w}x${h}:${color}:${cell}`;
    if (!netMats.has(key)) {
      const t = keep(netTex.clone());
      t.needsUpdate = true;
      t.repeat.set(w / cell, h / cell);
      netMats.set(key, mat(color, { map: t, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    }
    return add(new THREE.PlaneGeometry(w, h), netMats.get(key), { cast: false, receive: false });
  };
  // Alambrado alrededor de la cancha (`style.fence`): cuatro paños de largo fijo, para que cierre el rectángulo
  // aunque las tribunas sean cortas. La altura (2,4 m) es estimada.
  if (style.fence) {
    for (const lado of Object.keys(OUT)) {
      const [ox, oz] = OUT[lado];
      const fence = net((ox ? PITCH.width : PITCH.length) + 2 * GAP, 2.4, 0x8d949c, 0.5);
      fence.position.set(ox * (FRONT[lado] - 0.6), 1.2, oz * (FRONT[lado] - 0.6));
      fence.rotation.y = ox ? Math.PI / 2 : 0;
      scene.add(fence);
    }
  }
  for (const s of [1, -1]) {
    const goal = new THREE.Group();
    goal.position.x = (s * PITCH.length) / 2;
    goal.scale.x = s;
    for (const z of [-3.66, 3.66]) {
      const post = add(new THREE.CylinderGeometry(0.1, 0.1, 2.44, 8), white);
      post.position.set(0, 1.22, z);
      goal.add(post);
      const side = net(2, 2.44);
      side.position.set(1, 1.22, z);
      goal.add(side);
    }
    const bar = add(new THREE.CylinderGeometry(0.1, 0.1, 7.52, 8), white);
    bar.rotation.x = Math.PI / 2;
    bar.position.y = 2.44;
    goal.add(bar);
    const back = net(7.32, 2.44);
    back.rotation.y = Math.PI / 2;
    back.position.set(2, 1.22, 0);
    goal.add(back);
    const top = net(2, 7.32);
    top.rotation.set(-Math.PI / 2, 0, 0);
    top.position.set(1, 2.44, 0);
    goal.add(top);
    scene.add(goal);
  }

  const cornerFlag = mat(0xd23b3b, { side: THREE.DoubleSide });
  for (const sx of [1, -1]) {
    for (const sz of [1, -1]) {
      const pole = add(new THREE.CylinderGeometry(0.04, 0.04, 1.5, 6), white, { cast: false });
      pole.position.set((sx * PITCH.length) / 2, 0.75, (sz * PITCH.width) / 2);
      const flag = add(new THREE.PlaneGeometry(0.5, 0.35), cornerFlag, { cast: false });
      flag.position.set((sx * PITCH.length) / 2 + 0.27, 1.3, (sz * PITCH.width) / 2);
      scene.add(pole, flag);
    }
  }

  // Hoy, según la transmisión de un partido (nov-2026): carteles LED en todo el lateral de enfrente de la cámara y
  // detrás de los arcos, carteles chicos apoyados en el piso al lado de cada arco, y los bancos del lado de la
  // cámara. La cámara está en la Norte (confirmado por el usuario): bancos en la Norte, LED en la Sur.
  let boardMat = null;
  if (today) {
    const zSide = PITCH.width / 2;
    const shell = mat(0xcfe8ff, { transparent: true, opacity: 0.4, roughness: 0.1, metalness: 0.2 });
    const dark = mat(0x1b2430);
    for (const x of [-14, 14]) {
      const seatRow = add(new THREE.BoxGeometry(9, 0.55, 1), dark);
      seatRow.position.set(x, 0.3, -(zSide + 1.9));
      const cover = add(new THREE.BoxGeometry(9.4, 1.9, 1.5), shell, { cast: false });
      cover.position.set(x, 0.95, -(zSide + 1.9));
      scene.add(seatRow, cover);
    }
    const boardTex = keep(boardsTexture());
    boardTex.wrapS = THREE.RepeatWrapping;
    boardMat = mat(0xffffff, { map: boardTex, emissive: 0xffffff, emissiveMap: boardTex, emissiveIntensity: 0.2 });
    const board = (len, x, z, rotY) => {
      const g = keep(new THREE.PlaneGeometry(len, 0.9));
      const uvs = g.attributes.uv;
      for (let i = 0; i < uvs.count; i++) uvs.setX(i, uvs.getX(i) * Math.round(len / 16));
      const front = add(g, boardMat, { cast: false });
      front.position.set(x, 0.5, z);
      front.rotation.y = rotY;
      const backing = add(new THREE.BoxGeometry(len, 0.95, 0.12), dark);
      backing.position.set(x, 0.48, z);
      backing.rotation.y = rotY;
      backing.translateZ(-0.08);
      scene.add(front, backing);
    };
    board(96, 0, zSide + 3.1, Math.PI);
    board(64, PITCH.length / 2 + 3.2, 0, -Math.PI / 2);
    board(64, -(PITCH.length / 2 + 3.2), 0, Math.PI / 2);
    const lowColors = [0xf2f2f2, 0xe0452f, 0xf2f2f2, 0x1d3f7a];
    const low = new THREE.InstancedMesh(keep(new THREE.BoxGeometry(0.5, 0.5, 3.2)), mat(0xffffff), 8);
    const m4 = new THREE.Matrix4();
    const tilt = new THREE.Quaternion();
    const color = new THREE.Color();
    let n = 0;
    for (const sx of [1, -1]) {
      [-16, -11, 11, 16].forEach((z, i) => {
        tilt.setFromAxisAngle(new THREE.Vector3(0, 0, 1), sx * 0.5);
        low.setMatrixAt(n, m4.compose(new THREE.Vector3(sx * (PITCH.length / 2 + 1.4), 0.2, z), tilt, new THREE.Vector3(1, 1, 1)));
        low.setColorAt(n++, color.set(lowColors[i]));
      });
    }
    low.receiveShadow = true;
    scene.add(low);
  }

  // Tribunas: cada pieza es un sólido escalonado (ExtrudeGeometry); las curvas de las populares, LatheGeometry.
  const pickable = [];
  const parts = []; // { sector, level, material } (el material de las filas: se ilumina al elegir la tribuna)
  const tiles = new Map();
  const tile = (kind, hex) => {
    const key = `${kind}:${hex}`;
    if (!tiles.has(key)) {
      // Tipos de grada: 'butacas', 'grada' (cemento pintado, las populares de hoy), 'cemento' (a la vista) y 'madera'.
      const t = keep(kind === 'butacas' ? seatTile(hex) : terraceTile(hex, kind === 'grada' ? 'pintado' : kind));
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = 8;
      if (kind === 'cemento' || kind === 'madera') t.repeat.set(1, 0.25); // cuatro filas distintas por textura
      tiles.set(key, t);
    }
    return tiles.get(key);
  };
  const glassMat = mat(0xcfe8ff, { transparent: true, opacity: 0.35, roughness: 0.1, metalness: 0.2 });
  // Pared de afuera: con pilastras, ventanas y portones si es alta; lisa en las tribunas bajas y las de madera.
  // Hoy el estadio es azul también por afuera: las plateas, con las losas y columnas de las rampas a la vista; las
  // populares, con pared cerrada.
  const blue = style.seats === 'azul';
  // Antes de la pintura azul, hormigón a la vista. En Villa Luro todo es de madera: no hace falta la textura.
  const facadeTex = style.seats === 'madera' ? null : keep(blue ? blueFrameTexture() : concreteWallTexture());
  const curveTex = blue ? keep(blueWallTexture()) : facadeTex;
  for (const t of [facadeTex, curveTex]) if (t) t.wrapS = THREE.RepeatWrapping;
  const frameMat = mat(COLOR.frame); // la estructura pintada de hoy: cuerpos de rampas, cabina y cuerpo alto de la Norte
  const glow = []; // [material, color, intensidad]: lo que se enciende de noche
  // Madera a la vista (espaldas de las tribunas de tablones, frontones y postes de los techos): un solo material.
  const woodMat = mat(new THREE.Color(tones('madera')[1]).multiplyScalar(0.72), { roughness: 0.9 });
  // Techos de chapa (1924 y la Norte de 1951): se crea recién si hay alguno.
  let chapaMat = null;
  // Parapetos pintados (`style.paint`): se juntan acá y van todos en una malla. [x, y, z, sx, sy, sz, giro, color]
  const painted = [];
  // `wood` = la tribuna es de madera (por la pieza, no solo por la época): espalda de tablas, sin ventanas ni portón.
  const wallMat = (len, top, curved = false, wood = false) => {
    if (wood) return woodMat;
    if (top < 6) return mat(blue ? COLOR.facade : 0xb5b0a4);
    const t = keep((curved ? curveTex : facadeTex).clone());
    t.needsUpdate = true;
    t.repeat.set(Math.max(1, Math.round(len / 16)), 1);
    return mat(blue ? 0xffffff : E.muro ?? 0xffffff, { map: t });
  };
  // Resplandores (solo de noche): el de cada torre y, más chicos y cálidos, los focos sueltos del borde de la visera.
  const haloMat = keep(new THREE.SpriteMaterial({ map: keep(haloTexture()), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
  haloMat.visible = false;
  const viseraHalo = keep(haloMat.clone());
  viseraHalo.color.set(0xffe9c4);
  // Hoy (fotos): cuerpos abiertos de rampas y escaleras que salen de la espalda de la Sur y de las populares, y
  // bocas de acceso repartidas sobre las gradas. Se juntan acá y se dibujan instanciados después de las tribunas.
  const bodies = []; // { lado, u, w, width, out, h }: u = la espalda de la tribuna, w = a lo largo
  const mouths = []; // { lado, u, y, w }
  const rails = []; // paravalanchas de las populares: [lado, u, y, w]
  // Por bandeja (lado:nivel): [parte de la pendiente desde el frente, posiciones a lo largo]. Cantidad y lugar
  // aproximados; en la Norte Alta van por debajo de las letras.
  const MOUTHS = {
    // Foto de feb-2026: en la Sur Alta, una sola fila cerca del borde de abajo (5 o 6: van 6, así ninguna queda
    // delante de la cámara de «Desde la tribuna», que está en el medio); en la baja, cuatro a media altura.
    'sur:1': [[0.3, [-50, -30, -10, 10, 30, 50]]],
    'sur:0': [[0.5, [-41, -19, 19, 41]]],
    'norte:2': [[0.22, [-36, -12, 12, 36]]],
    'este:0': [[0.6, [-27, -9, 9, 27]]],
    'oeste:0': [[0.6, [-27, -9, 9, 27]]],
  };
  const decals = [];
  // Butacas: el plástico es satinado y el piso, mate (una sola textura de rugosidad para todas las plateas).
  let seatRough = null;
  // Hoy: las puntas de las bandejas altas muestran las losas y columnas (un material para las dos plateas).
  let endsMat = null;
  for (const lado of Object.keys(layout)) {
    const id = today ? sectores.find((x) => x.lado === lado)?.id ?? null : null;
    const group = new THREE.Group();
    group.rotation.y = ANGLE[lado];
    const at = offsets(lado, layout);
    layout[lado].forEach((p, idx) => {
      const u0 = FRONT[lado] + at[idx];
      const solid = Boolean(p.kind);
      // El edificio de atrás de la Norte sigue `back` metros más hacia afuera.
      const dd = p.d + (p.kind === 'visera' ? p.back ?? 0 : 0);
      const pts = solid ? [[0, 0], [0, p.y1], [dd, p.y1], [dd, 0]] : stepProfile(p.d, p.y0, p.y1);
      // Bandeja en voladizo: el frente flota sobre la pieza de adelante (la panza, 80 cm bajo la primera fila).
      if (p.over && !solid) pts.splice(0, 1, [p.over, 0], [p.over, p.y0 - 0.8], [0, p.y0 - 0.8]);
      const shape = new THREE.Shape(pts.map(([u, v]) => new THREE.Vector2(u, v)));
      const base = p.tone ?? (p.kind === 'palcos' ? COLOR.palcos : p.kind === 'visera' ? COLOR.roof : p.material ? tones(p.material)[idx % 2]
        : p.curved ? popular : idx % 2 ? seatAlt : seat);
      // El cuerpo (frente, puntas y espalda) va liso; las filas se dibujan en una cara aparte apoyada encima.
      const material = solid ? mat(base, p.kind === 'palcos' ? { roughness: 0.2, metalness: 0.6 } : { roughness: 0.95 }) : mat(new THREE.Color(base).multiplyScalar(0.72));
      if (p.kind === 'palcos') glow.push([material, blue ? 0x2f6fd6 : 0xffd9a0, blue ? 0.6 : 0.35]); // antes, luz cálida
      const part = { sector: id, level: p.level ?? null, material: null, kind: null, base };
      const piece = (m, x, z = 0) => {
        m.position.set(x, 0, z);
        m.userData = part;
        group.add(m);
        if (id) pickable.push(m);
      };
      const geo = new THREE.ExtrudeGeometry(shape, { depth: p.len, bevelEnabled: false });
      geo.translate(0, 0, -p.len / 2);
      // ExtrudeGeometry separa las tapas (grupo 0: acá, las dos puntas) de los costados (grupo 1).
      let body = material;
      if (blue && p.kind === 'visera') body = [mat(COLOR.frameDark), material]; // puntas azules, azotea gris azulada
      else if (blue && !solid && !p.curved && p.y1 >= 20) {
        if (!endsMat) {
          const t = keep(facadeTex.clone());
          t.needsUpdate = true;
          t.wrapT = THREE.RepeatWrapping;
          t.repeat.set(1 / 16, 1 / 28); // las tapas llevan UV en metros (u, v del perfil)
          endsMat = mat(0xffffff, { map: t });
        }
        body = [endsMat, material];
      }
      piece(add(flared(geo, p), body), u0);
      for (const [f, ws] of (blue && MOUTHS[`${lado}:${p.level}`]) || []) {
        const open = 1 + ((2 * (p.flare ?? 0)) / p.len) * f; // sigue el trapecio
        for (const w of ws) mouths.push({ lado, u: u0 + f * p.d, y: p.y0 + f * (p.y1 - p.y0) + 0.8, w: w * open });
      }
      if (!solid) {
        const wood = (p.material ?? style.seats) === 'madera';
        const kind = wood ? 'madera' : style.seats === 'cemento' ? 'cemento' : p.curved || p.material ? 'grada' : 'butacas';
        part.kind = kind;
        if (kind === 'butacas' && !seatRough) {
          seatRough = keep(seatRoughTile());
          seatRough.wrapS = THREE.RepeatWrapping;
          seatRough.wrapT = THREE.RepeatWrapping;
        }
        // El resaltado de la tribuna elegida es su propia textura iluminada (emissiveMap), no un color plano encima.
        part.material = mat(0xffffff, {
          map: tile(kind, base), emissive: 0x000000, emissiveMap: tile(kind, base),
          ...(kind === 'butacas' ? { roughnessMap: seatRough, roughness: 1 } : kind === 'cemento' && T.rough ? { roughness: T.rough } : {}),
          polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
        });
        parts.push(part);
        piece(add(flared(stepsGeometry(p, kind === 'butacas' ? 10 : 8), p), part.material, { cast: false }), u0);
        if (p.curved) {
          // Las esquinas: el mismo perfil girado 90° alrededor de cada esquina de la primera fila. El perfil va al
          // revés: si no, las normales quedan para adentro y la curva se ve oscura.
          const prof = pts.map(([u, v]) => new THREE.Vector2(u, v)).reverse();
          const reps = Math.max(1, Math.round((Math.PI / 2) * p.d * 0.6 / 8));
          const seg = 24;
          const curveWall = wallMat((Math.PI / 2) * p.d, p.y1, true);
          const capMat = mat(new THREE.Color(base).multiplyScalar(0.72), { side: THREE.DoubleSide });
          for (const [sign, start] of [[1, 0], [-1, Math.PI / 2]]) {
            // La tapa de la punta libre de la curva (la que da contra la platea): sin ella se ve a través.
            const cap = add(new THREE.ShapeGeometry(shape), capMat);
            cap.rotation.y = (-sign * Math.PI) / 2;
            piece(cap, u0, (sign * p.len) / 2);
            piece(add(new THREE.LatheGeometry([prof[0], prof[1]], seg, start, Math.PI / 2), curveWall), u0, (sign * p.len) / 2);
            const steps = prof.slice(1, -1);
            const curve = new THREE.LatheGeometry(steps, seg, start, Math.PI / 2);
            // Mismo dibujo que en la parte recta: v = fila (abajo la contrahuella, arriba la huella); las escaleras
            // quedan radiales. `steps` = [fondo n-1, frente n-1, …, fondo 0, frente 0, pie].
            const nSteps = (steps.length - 1) / 2;
            const rowT = (j) => (j === 2 * nSteps ? 0 : nSteps - 1 - (j >> 1) + (j % 2 ? RISER : 1));
            for (let i = 0; i <= seg; i++) for (let j = 0; j < steps.length; j++) curve.attributes.uv.setXY(i * steps.length + j, (i / seg) * reps, rowT(j));
            piece(add(curve, part.material, { cast: false }), u0, (sign * p.len) / 2);
          }
        }
      }
      // Frentes de vidrio de las plateas (reemplazaron a los alambrados).
      if (style.glass && !solid && !p.curved) {
        const glass = add(new THREE.PlaneGeometry(p.len, 1.1), glassMat, { cast: false, receive: false });
        glass.position.set(u0 - 0.05, p.y0 + 0.55, 0);
        glass.rotation.y = Math.PI / 2;
        group.add(glass);
      }
      // Años 70 y 78: el parapeto del frente de cada bandeja (y la panza de las que vuelan), pintado de blanco con
      // una franja azul. Que estuvieran pintados lo dice la tabla de materiales del usuario; el dibujo es una inferencia.
      if (style.paint && !solid) {
        const yb = p.over ? p.y0 - 0.8 : 0;
        const h = p.y0 - yb;
        if (h >= 0.5 && (idx === 0 || p.over)) {
          const a = ANGLE[lado];
          const [x, z] = [(u0 - 0.09) * Math.cos(a), -(u0 - 0.09) * Math.sin(a)];
          const [x2, z2] = [(u0 - 0.16) * Math.cos(a), -(u0 - 0.16) * Math.sin(a)];
          painted.push([x, yb + h / 2, z, 0.12, h, p.len, a, 0xd9d6cc], [x2, yb + h * 0.5, z2, 0.06, h * 0.3, p.len, a, 0x1f55a3]);
        }
      }
      // Populares (foto desde la tribuna): una reja azul al frente, en la parte recta. La altura es estimada.
      if (blue && p.curved && !solid) {
        const rail = net(p.len, 2.2, 0x1e55a0, 0.5);
        rail.position.set(u0 - 0.05, 1.1, 0);
        rail.rotation.y = Math.PI / 2;
        group.add(rail);
      }
      // Paravalanchas en la parte recta de las populares, en filas alternadas. En las fotos no se distinguen: es
      // una inferencia razonable (cantidad moderada: 60 por popular).
      if (style.barriers && p.curved && !solid) {
        const n = Math.max(1, Math.round(p.d / 1.2));
        [3, 7, 11, 18, 22].filter((r) => r < n).forEach((r, k) => {
          for (let i = 0; i < 12; i++) rails.push([lado, u0 + ((r + 0.5) * p.d) / n, p.y0 + ((p.y1 - p.y0) * (r + 1)) / n, -p.len / 2 + (i + (k % 2 ? 0.75 : 0.25)) * (p.len / 12)]);
        });
      }
      // El nombre de la Platea Sur en el frente de la alta, a cada lado (sin el escudo del medio).
      if (style.decals && lado === 'sur' && p.over && !solid) {
        const band = keep(plateaTexture());
        const sign = new THREE.InstancedMesh(keep(new THREE.PlaneGeometry(22, 0.75)), mat(0xffffff, { map: band }), 2);
        const turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2);
        [-26, 26].forEach((w, i) => sign.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(u0 - 0.04, p.y0 - 0.4, w), turn, new THREE.Vector3(1, 1, 1))));
        sign.receiveShadow = true;
        group.add(sign);
      }
      // El edificio de atrás de la Norte (foto de feb-2026). Lo que antes se dibujaba como visera es una cercha blanca
      // con los reflectores, en dos tramos, sobre el borde de la azotea que da a la cancha; en el medio, una cabina
      // azul. La alta no tiene cubierta. En la punta oeste (w negativo), un cuerpo más alto con el cartel del estadio.
      if (p.kind === 'visera') {
        const top = p.y1;
        const blueBody = frameMat;
        const box = (du, h, dw, u, y, w, m = blueBody) => {
          const b = add(new THREE.BoxGeometry(du, h, dw), m);
          b.position.set(u, y, w);
          group.add(b);
          return b;
        };
        const wW = -p.len / 2 + 21.5; // cuerpo alto: 27 m de largo, a 8 m de la punta
        box(dd - 5, 7, 27, u0 + 2 + (dd - 5) / 2, top + 3.5, wW);
        const sign = add(new THREE.PlaneGeometry(23, 5.75), mat(0xffffff, { map: keep(nameTexture()) }), { cast: false });
        sign.position.set(u0 + dd - 2.9, top + 3.6, wW);
        sign.rotation.y = Math.PI / 2; // mira hacia afuera (la avenida)
        group.add(sign);
        box(8, 6, 11, u0 + 3, top + 3, 0); // la cabina, en el medio
        // La cercha: dos cordones y montantes (reticulado calado), sobre postes; todo en una malla y sin sombra
        // (son piezas de menos de 0,5 m).
        const L = p.len / 2 - 8.5; // cada tramo, de la cabina a la punta
        const truss = [];
        const lampBars = [];
        for (const sgn of [-1, 1]) {
          const cw = sgn * (6.5 + L / 2);
          for (const y of [1.9, 3]) truss.push([u0 + 0.6, top + y, cw, 0.3, 0.22, L]);
          for (let i = 0; i <= 16; i++) truss.push([u0 + 0.6, top + 2.45, sgn * (6.5 + (i * L) / 16), 0.16, 1.1, 0.16]);
          for (let i = 0; i < 6; i++) truss.push([u0 + 0.6, top + 0.95, sgn * (6.5 + (i * L) / 5), 0.3, 1.9, 0.3]);
          lampBars.push([u0 + 0.05, top + 2.45, cw, 0.5, 0.7, L - 1]); // los reflectores, del lado de la cancha
        }
        instanced(unitBox, mat(0xf4f6f8, { roughness: 0.6 }), truss, { cast: false, parent: group });
        const lampBar = mat(0xe9edf2);
        glow.push([lampBar, 0xffffff, 2.5]);
        instanced(unitBox, lampBar, lampBars, { cast: false, parent: group });
        // De noche lo que se reconoce es la fila de focos sueltos, cada uno con su resplandor.
        for (let i = 0; i < 18; i++) {
          const w = -p.len / 2 + 3 + (i * (p.len - 6)) / 17;
          if (Math.abs(w) < 7) continue; // delante de la cabina no hay focos
          const sp = new THREE.Sprite(viseraHalo);
          sp.scale.set(13, 13, 1); // manchas que casi se tocan (más de 14 se funden en una barra)
          sp.position.set(u0 - 0.5, top + 2.45, w);
          group.add(sp);
        }
      }
      // Tribuna techada: chapa acanalada sobre postes delgados de madera apoyados en la grada. A dos aguas en el
      // módulo central de la principal de Villa Luro (con frontones de tablas); a un agua, con caída hacia atrás, en
      // la Norte de madera de 1951 (esa forma es una inferencia). El techo es un solo sólido: las tapas (grupo 0)
      // son los frontones y el resto, la chapa.
      if (p.techo) {
        const two = p.techo.aguas === 2;
        const L = Math.min(p.techo.len ?? p.len, p.len);
        const o = 0.8; // alero
        const eave = p.y1 + 2.4; // el borde más bajo, sobre la última fila
        const top = eave + (two ? 1.9 : 1.5); // la cumbrera o, a un agua, el borde de adelante
        const t = 0.5; // con menos de 50 cm la sombra sale salpicada
        const outline = two
          ? [[-o, eave - t], [-o, eave], [p.d / 2, top], [p.d + o, eave], [p.d + o, eave - t]]
          : [[-o, top - t], [-o, top], [p.d + o, eave], [p.d + o, eave - t]];
        // La altura de la cara de abajo del techo y la de la grada, a `du` metros del frente.
        const under = (du) => (two ? eave - t : top - t + ((eave - top) * (du + o)) / (p.d + 2 * o));
        const floor = (du) => p.y0 + ((p.y1 - p.y0) * du) / p.d;
        if (!chapaMat) {
          const chapa = keep(chapaTexture());
          chapa.wrapS = THREE.RepeatWrapping;
          chapa.wrapT = THREE.RepeatWrapping;
          chapa.repeat.set(1 / 6, 1 / 4.8); // los costados de la extrusión llevan UV en metros: ondas a lo largo de la caída
          chapaMat = mat(0xffffff, { map: chapa, roughness: 0.55, metalness: 0.5 });
        }
        const roofGeo = new THREE.ExtrudeGeometry(new THREE.Shape(outline.map(([u, v]) => new THREE.Vector2(u, v))), { depth: L, bevelEnabled: false });
        roofGeo.translate(0, 0, -L / 2);
        const roof = add(roofGeo, [woodMat, chapaMat]);
        roof.position.x = u0;
        group.add(roof);
        // Postes: una fila adelante y otra atrás (y otra al medio si la tribuna es honda), cada 5 o 6 m. Cantidad
        // impar de tramos: así no queda un poste en el medio, delante de la cámara de «Desde la tribuna».
        let bays = Math.max(1, Math.round((L - 1) / (two ? 5 : 6)));
        if (bays % 2 === 0) bays++;
        const rows = p.d > 12 ? [0.5, p.d / 2, p.d - 0.4] : [0.5, p.d - 0.4];
        const posts = [];
        for (let i = 0; i <= bays; i++) {
          const w = -L / 2 + 0.5 + (i * (L - 1)) / bays;
          for (const du of rows) posts.push([u0 + du, (floor(du) + under(du)) / 2, w, 0.2, under(du) - floor(du), 0.2]);
        }
        instanced(unitBox, woodMat, posts, { cast: false, parent: group }); // 20 cm: sin sombra
      }
      // Paredes de afuera (fachada de hormigón) detrás de la última pieza.
      if (idx === layout[lado].length - 1) {
        const top = p.y1;
        const back = p.len + 2 * (p.flare ?? 0); // el largo de la espalda (más que el frente si es un trapecio)
        // Hoy la espalda del edificio de la Norte son parasoles blancos con una franja azul arriba; la punta oeste
        // (33 m) es azul con filas de ventanas.
        const fins = blue && p.kind === 'visera';
        let wall = null;
        if (fins) {
          const t = keep(parasolTexture());
          t.wrapS = THREE.RepeatWrapping;
          t.repeat.set(Math.round(back / 16), 1);
          wall = mat(0xffffff, { map: t });
        } else wall = wallMat(back, top, Boolean(p.curved), (p.material ?? style.seats) === 'madera');
        const facade = add(new THREE.BoxGeometry(0.6, top, back), wall);
        facade.position.set(u0 + dd + 0.3, top / 2, 0);
        group.add(facade);
        if (fins) {
          const winTex = keep(facadeTex.clone()); // azul con losas: se lee como filas de ventanas
          winTex.needsUpdate = true;
          winTex.repeat.set(2, 1);
          const west = add(new THREE.BoxGeometry(0.4, top, 33), mat(0xffffff, { map: winTex }), { cast: false });
          west.position.set(u0 + dd + 0.75, top / 2, -p.len / 2 + 16.5);
          group.add(west);
        }
        // Los cinco cuerpos de rampas de la espalda de la Sur (tan anchos como los huecos, hasta 3/4 de la altura)
        // y tres cuerpos de escalera, más bajos que el borde, en la pared de cada popular.
        if (blue && lado === 'sur') for (let k = -2; k <= 2; k++) bodies.push({ lado, u: u0 + p.d, w: (k * back) / 5, width: 10, out: 7, h: top * 0.75 });
        // En la Este el lugar del medio es de la estructura de la pantalla.
        if (blue && p.curved) for (const w of lado === 'este' && style.screen ? [-24, 24] : [-24, 0, 24]) bodies.push({ lado, u: u0 + p.d, w, width: 9, out: 6, h: top * 0.7 });
      }
    });
    scene.add(group);
  }

  // Parapetos pintados: una sola malla, pintura satinada. Sin sombra (son láminas pegadas al frente).
  if (painted.length) instanced(unitBox, mat(0xffffff, { roughness: 0.5 }), painted, { cast: false });

  if (bodies.length || mouths.length || rails.length) {
    // Del sistema de cada tribuna (u hacia afuera, w a lo largo) al mundo, para instanciar todo junto.
    const m4 = new THREE.Matrix4();
    const turn = new THREE.Matrix4();
    const still = new THREE.Quaternion();
    const place = (lado, u, y, w, sx = 1, sy = 1, sz = 1) => m4.compose(new THREE.Vector3(u, y, w), still, new THREE.Vector3(sx, sy, sz)).premultiply(turn.makeRotationY(ANGLE[lado]));
    const unit = unitBox;
    const SLABS = 6;
    // Losas y columnas a la vista, con un núcleo oscuro adentro.
    const frames = new THREE.InstancedMesh(unit, frameMat, bodies.length * (SLABS + 4));
    const cores = new THREE.InstancedMesh(unit, mat(0x0d2757), bodies.length);
    let n = 0;
    bodies.forEach(({ lado, u, w, width, out, h }, i) => {
      for (let k = 1; k <= SLABS; k++) frames.setMatrixAt(n++, place(lado, u + out / 2, (k * h) / SLABS - 0.25, w, out, 0.5, width));
      for (const du of [0.4, out - 0.4]) for (const dw of [-1, 1]) frames.setMatrixAt(n++, place(lado, u + du, h / 2, w + dw * (width / 2 - 0.4), 0.8, h, 0.8));
      cores.setMatrixAt(i, place(lado, u + out * 0.3, (h - 0.5) / 2, w, out * 0.6, h - 0.5, width * 0.6));
    });
    const boxes = new THREE.InstancedMesh(keep(new THREE.BoxGeometry(2.2, 1.6, 3.2)), mat(0x12336b), mouths.length);
    mouths.forEach(({ lado, u, y, w }, i) => boxes.setMatrixAt(i, place(lado, u, y, w)));
    for (const m of [frames, cores]) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
    boxes.receiveShadow = true;
    // La abertura de cada boca, del lado de la cancha: el túnel se ve negro.
    const tunnels = new THREE.InstancedMesh(unit, keep(new THREE.MeshBasicMaterial({ color: 0x04070c })), mouths.length);
    mouths.forEach(({ lado, u, y, w }, i) => tunnels.setMatrixAt(i, place(lado, u - 1.12, y - 0.12, w, 0.06, 1.2, 2.5)));
    // Paravalanchas: un caño y dos patas cada uno (cajas finas, sin sombra).
    const bars = new THREE.InstancedMesh(unit, mat(0xc9d3de, { roughness: 0.5, metalness: 0.4 }), rails.length * 3);
    rails.forEach(([lado, u, y, w], i) => {
      bars.setMatrixAt(3 * i, place(lado, u, y + 1.05, w, 0.09, 0.09, 2.6));
      for (const [k, dw] of [[1, -1.15], [2, 1.15]]) bars.setMatrixAt(3 * i + k, place(lado, u, y + 0.52, w + dw, 0.09, 1.05, 0.09));
    });
    scene.add(frames, cores, boxes, tunnels, bars);
  }

  // Plano apoyado sobre las puntas de los escalones de una o más piezas, con un dibujo hecho con butacas.
  // `width` = ancho del dibujo (si no, el largo de la tribuna menos 3 m por punta).
  const flags = [];
  const decal = (lado, idxFrom, idxTo, texture, { span = [0, 1], list = decals, width = null } = {}) => {
    const L = layout[lado];
    const at = offsets(lado, layout);
    const a = L[idxFrom];
    const b = L[idxTo];
    const u0 = FRONT[lado] + at[idxFrom] + a.d * span[0];
    const u1 = FRONT[lado] + at[idxTo] + b.d * span[1];
    // Sobre las puntas de los escalones: la recta que las une queda un escalón más arriba que la pendiente.
    const v0 = a.y0 + (a.y1 - a.y0) * span[0] + (a.y1 - a.y0) / Math.max(1, Math.round(a.d / 1.2)) + 0.12;
    const v1 = b.y0 + (b.y1 - b.y0) * span[1] + (b.y1 - b.y0) / Math.max(1, Math.round(b.d / 1.2)) + 0.12;
    const len = width ?? Math.min(a.len, b.len) - 6;
    const slope = Math.hypot(u1 - u0, v1 - v0);
    keep(texture);
    const plane = add(new THREE.PlaneGeometry(len, slope), mat(0xffffff, { map: texture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 }), { cast: false });
    const group = new THREE.Group();
    group.rotation.y = ANGLE[lado];
    // Orientación armada a mano: x a lo largo de la tribuna (así se lee de izquierda a derecha desde la cancha),
    // y subiendo por la pendiente y la normal mirando a la cancha y hacia arriba.
    const t = Math.atan2(v1 - v0, u1 - u0);
    const basis = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(Math.cos(t), Math.sin(t), 0), new THREE.Vector3(-Math.sin(t), Math.cos(t), 0));
    plane.quaternion.setFromRotationMatrix(basis);
    plane.position.set((u0 + u1) / 2, (v0 + v1) / 2, 0);
    group.add(plane);
    scene.add(group);
    list.push(plane);
    return plane;
  };
  // Dibujos hechos con butacas: «VELEZ» en la Norte Alta y la V blanca en la Sur Baja.
  if (style.decals) {
    // Los anchos son los de siempre (94 y 98 m) aunque las plateas ahora lleguen hasta las curvas: si no, las
    // letras y la V se estiran. La V termina antes de las filas que quedan bajo el voladizo de la alta.
    // «VELEZ» ocupa la mitad de arriba de la bandeja (foto desde el sudeste); las bocas quedan debajo.
    decal('norte', 3, 3, velezTexture(), { width: 94, span: [0.3, 1] });
    decal('sur', 0, 0, surTexture(), { width: 98, span: [0, 17 / 24] });
    // Los telones de las populares: solo se ven con público.
    const flagsTex = flagsTexture();
    for (const lado of ['este', 'oeste']) decal(lado, 0, 0, flagsTex, { span: [0.12, 0.3], list: flags }).visible = false;
  }

  // Pantalla detrás de la Popular Este: LED hoy, tablero viejo en el 78.
  if (style.screen) {
    const led = style.screen === 'led';
    const screenTex = keep(led ? screenTexture() : boardTexture());
    const screenBox = add(new THREE.BoxGeometry(1.4, 10, 24), mat(0x15191f));
    const xScreen = FRONT.este + depthOf('este', layout) + 1.5;
    screenBox.position.set(xScreen, 21, 0);
    scene.add(screenBox);
    const legMat = mat(0x4a525c);
    for (const z of [-9, 9]) {
      const leg = add(new THREE.BoxGeometry(1, 17, 1), legMat);
      leg.position.set(xScreen, 8.5, z);
      scene.add(leg);
    }
    const screenFace = add(new THREE.PlaneGeometry(23, 9.2), mat(0xffffff, led ? { map: screenTex, emissive: 0xffffff, emissiveMap: screenTex, emissiveIntensity: 0.6 } : { map: screenTex }), { cast: false });
    screenFace.position.set(xScreen - 0.75, 21, 0);
    screenFace.rotation.y = -Math.PI / 2;
    scene.add(screenFace);
  }

  // Torres de iluminación en las esquinas (desde 1968): mástil y panel inclinado hacia la cancha. Rayadas en rojo y
  // blanco en el 78, LED hoy.
  const ledTowers = style.towers === 'led';
  const OLD_MAST = 0x8e969c; // acero pintado gris plomo (el de antes, 0x5d6673, salía casi negro)
  const lampTex = keep(ledTowers ? lampsTexture(false, 5, 12) : lampsTexture(true));
  const lampMat = mat(0xffffff, { map: lampTex, emissive: 0xffffff, emissiveMap: lampTex, emissiveIntensity: 0.15 });
  const towerLights = [];
  let mastMat = null;
  if (style.towers) {
    if (style.towers === 'rayadas') {
      // Nueve franjas anchas de punta a punta (con 24 angostas parecía un bastón de caramelo). La cantidad es a ojo.
      mastMat = mat(0xffffff, { map: keep(stripesTexture()), roughness: 0.6 });
    } else mastMat = ledTowers ? mat(0xf1f3f5, { metalness: 0.3, roughness: 0.5 }) : mat(OLD_MAST, { metalness: 0.2, roughness: 0.45 });
    // Antes del LED la luz era cálida (cuarzo-yodo): el resplandor de cada torre, también.
    if (!ledTowers) haloMat.color.set(0xffe2b8);
  }
  // Hoy (fotos): mástiles blancos y parejos, más altos que las tribunas; el panel de reflectores es una parrilla
  // vertical (unas 2,5 veces más alta que ancha) que ocupa el tercio de arriba y termina en la punta, casi sin
  // inclinar; justo debajo, un cilindro rojo liso (sin marca), más alto que ancho. Antes: más bajas, con el mástil
  // afinado y el panel apaisado arriba.
  const H = ledTowers ? 54 : 46;
  const [pw, ph] = ledTowers ? [7.5, 19] : [12, 7];
  const yHead = ledTowers ? H - ph / 2 : H + ph / 2 - 2;
  const towerGeo = style.towers && {
    mast: keep(new THREE.CylinderGeometry(ledTowers ? 1.2 : 0.8, ledTowers ? 1.2 : 1.6, H, 14, 1)),
    deck: keep(new THREE.CylinderGeometry(2.4, 2.4, 0.4, 12)),
    ring: keep(new THREE.CylinderGeometry(2.6, 2.6, 8, 20)),
    cap: keep(new THREE.CylinderGeometry(2.7, 2.7, 0.4, 20)),
    panel: keep(new THREE.BoxGeometry(pw, ph, 0.8)),
    face: keep(new THREE.PlaneGeometry(pw - 0.6, ph - 0.6)),
  };
  const towerMats = style.towers && {
    deck: mat(ledTowers ? 0xdfe3e8 : OLD_MAST, { metalness: 0.5, roughness: 0.5 }),
    ring: mat(0xc5221f, { roughness: 0.5 }),
    cap: mat(0xd9dde2, { metalness: 0.5, roughness: 0.4 }),
    panel: mat(ledTowers ? 0xe6e9ed : 0x2b3037),
  };
  const beamLen = Math.hypot(TOWERS[0][0], yHead, TOWERS[0][1]) * 0.85;
  const beamMat = style.towers && keep(new THREE.MeshBasicMaterial({ map: keep(beamTexture()), transparent: true, opacity: 0.09, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  if (beamMat) {
    beamMat.visible = false;
    if (!ledTowers) beamMat.color.set(0xffe6c0);
  }
  const beamGeo = style.towers && keep(new THREE.ConeGeometry(beamLen * 0.4, beamLen, 20, 1, true).translate(0, -beamLen / 2, 0));
  for (const [x, z] of style.towers ? TOWERS : []) {
    const at = (m, y) => {
      m.position.set(x, y, z);
      scene.add(m);
    };
    at(add(towerGeo.mast, mastMat), H / 2);
    at(add(towerGeo.deck, towerMats.deck), ledTowers ? yHead - ph / 2 - 1 : H - 3);
    // El cilindro rojo va solo en las dos torres del sur (foto de feb-2026): las del norte son mástil blanco entero.
    if (ledTowers && z > 0) {
      at(add(towerGeo.ring, towerMats.ring), 28.5);
      for (const y of [24.3, 32.7]) at(add(towerGeo.cap, towerMats.cap), y);
    }
    const halo = new THREE.Sprite(haloMat);
    halo.scale.set(80, 80, 1);
    halo.position.set(x * 0.97, yHead, z * 0.97);
    scene.add(halo);
    const head = new THREE.Group();
    head.position.set(x, yHead, z);
    head.lookAt(0, ledTowers ? yHead - 20 : 0, 0);
    const panel = add(towerGeo.panel, towerMats.panel);
    const face = add(towerGeo.face, lampMat, { cast: false });
    // Hoy el panel va por delante del mástil (que llega hasta la punta); antes, encima.
    panel.position.z = ledTowers ? 1.4 : 0;
    face.position.z = panel.position.z + 0.42;
    head.add(panel, face);
    scene.add(head);
    const spot = new THREE.SpotLight(ledTowers ? 0xffffff : 0xffe6c0, 0, 340, 0.55, 0.6, 1.2);
    spot.position.set(x, yHead, z);
    spot.target.position.set(0, 0, 0);
    // Apagados de día: con intensidad 0 siguen contando como luces en cada material.
    spot.visible = false;
    scene.add(spot, spot.target);
    towerLights.push(spot);
    // El haz (solo de noche): un cono muy tenue, aditivo, de la parrilla hacia la cancha. Es falso: no ilumina.
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.set(x, yHead, z);
    beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(-x, -yHead, -z).normalize());
    beam.renderOrder = 2;
    scene.add(beam);
  }

  // Carteles con el nombre de cada tribuna (HTML encima del canvas, siguen a la cámara).
  const labelLayer = document.createElement('div');
  labelLayer.className = 'st3d-labels';
  labelLayer.setAttribute('aria-hidden', 'true');
  container.appendChild(labelLayer);
  const labels = (today ? sectores : []).map((s) => {
    const el = document.createElement('span');
    el.className = 'st3d-label';
    el.textContent = s.nombre.replace(/ «.*»/, '');
    labelLayer.appendChild(el);
    const [ox, oz] = OUT[s.lado];
    const r = FRONT[s.lado] + depthOf(s.lado, layout) * 0.55;
    const top = Math.max(...layout[s.lado].map((p) => p.y1)) + 8;
    return { el, id: s.id, pos: new THREE.Vector3(ox * r, top, oz * r) };
  });
  for (const [text, pos] of streets) {
    const el = document.createElement('span');
    el.className = 'st3d-label st3d-label-street';
    el.textContent = text;
    labelLayer.appendChild(el);
    labels.push({ el, id: null, pos: new THREE.Vector3(...pos) });
  }

  // Tamaño y colores según el tema.
  const applyTheme = () => {
    const dark = matchMedia('(prefers-color-scheme: dark)').matches;
    const key = night ? 'night' : dark ? 'dusk' : 'day';
    skies[key] ??= keep(skyTexture(...SKY[key]));
    scene.background = skies[key];
    scene.fog = new THREE.Fog(SKY[key][1], 550, 1500);
    groundMat.color.set(night ? 0x141a22 : dark ? 0x2a3038 : GROUND_DAY);
    // Con el tema oscuro de día la escena sigue iluminada como de día: usa el entorno de día.
    scene.environment = envOf(night ? 'night' : 'day');
    scene.environmentIntensity = night ? 0.6 : 0.35;
    invalidate();
  };
  // Mapa de entorno generado acá (sin archivo HDR): una cúpula con el mismo degradé del cielo y el piso, filtrada
  // con PMREM a 64 px. Les da a cemento, chapa, vidrio y butacas el rebote del cielo. Uno de día y otro de noche,
  // creados recién cuando hacen falta.
  const envs = {};
  let pmrem = null;
  const envOf = (key) => {
    if (!renderer.isWebGLRenderer) return null; // en los tests el renderer es falso
    if (!envs[key]) {
      pmrem ??= new THREE.PMREMGenerator(renderer);
      const [top, horizon] = SKY[key];
      const floor = key === 'night' ? '#0a0d12' : '#6f716b';
      const tex = canvasTexture(4, 64, (g, w, h) => {
        const gr = g.createLinearGradient(0, 0, 0, h);
        gr.addColorStop(0, top);
        gr.addColorStop(0.5, horizon);
        gr.addColorStop(0.56, floor);
        gr.addColorStop(1, floor);
        g.fillStyle = gr;
        g.fillRect(0, 0, w, h);
      });
      const dome = new THREE.Mesh(new THREE.SphereGeometry(10, 24, 12), new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide }));
      // Sin desenfoque previo (sigma 0): el degradé ya es suave, y ese sombreador deja un aviso en la consola en Windows.
      envs[key] = pmrem.fromScene(new THREE.Scene().add(dome), 0, 0.1, 100, { size: 64 });
      tex.dispose();
      dome.geometry.dispose();
      dome.material.dispose();
    }
    return envs[key].texture;
  };
  const dropEnvs = () => {
    for (const k of Object.keys(envs)) {
      envs[k].dispose();
      delete envs[k];
    }
    pmrem?.dispose();
    pmrem = null;
  };
  // Se dibuja solo cuando algo cambió (la cámara, las luces, una textura): en reposo no gasta nada.
  let dirty = true;
  const invalidate = () => {
    dirty = true;
  };
  const v = new THREE.Vector3();
  const draw = () => {
    dirty = false;
    renderer.render(scene, camera);
    const w = container.clientWidth;
    const h = container.clientHeight;
    for (const l of labels) {
      v.copy(l.pos).project(camera);
      const hidden = v.z > 1 || v.x < -1.1 || v.x > 1.1 || v.y < -1.1 || v.y > 1.1;
      l.el.style.display = hidden ? 'none' : '';
      if (!hidden) l.el.style.transform = `translate(-50%, -50%) translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px)`;
    }
  };
  const skies = {};
  let night = false;
  applyTheme();
  const mq = matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', applyTheme);
  let lastW = 0;
  let lastH = 0;
  const resize = (paint = true) => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (!w || !h || (w === lastW && h === lastH)) return;
    lastW = w;
    lastH = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (paint) draw(); // setSize borra el canvas: sin esto queda un cuadro en blanco
    else invalidate();
  };
  controls.update(); // apunta la cámara antes del primer dibujo
  // El primer dibujo va en el primer cuadro, con la noche y el público ya aplicados (si no, compila todo dos veces).
  resize(false);
  const ro = new ResizeObserver(() => resize());
  // Si el navegador pierde y devuelve el contexto WebGL (pasa en celulares), hay que rehacer las sombras y dibujar.
  const onRestore = () => {
    renderer.shadowMap.needsUpdate = true;
    // El mapa de entorno se pierde con el contexto: se hace de nuevo.
    dropEnvs();
    applyTheme();
  };
  renderer.domElement.addEventListener('webglcontextrestored', onRestore);
  ro.observe(container);

  // Tocar una tribuna (sin arrastrar).
  const ray = new THREE.Raycaster();
  let downAt = null;
  const onDown = (e) => {
    downAt = [e.clientX, e.clientY];
  };
  const onUp = (e) => {
    if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 6) return;
    const r = renderer.domElement.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    const hit = ray.intersectObjects(pickable, false)[0];
    if (hit) onPick(hit.object.userData.sector, hit.object.userData.level);
  };
  renderer.domElement.addEventListener('pointerdown', onDown);
  renderer.domElement.addEventListener('pointerup', onUp);

  // Animación de la cámara entre vistas.
  let tween = null;
  const goTo = ({ pos, target }) => {
    const to = { pos: new THREE.Vector3(...pos), target: new THREE.Vector3(...target) };
    invalidate();
    if (reducedMotion) {
      camera.position.copy(to.pos);
      controls.target.copy(to.target);
      return;
    }
    tween = { from: { pos: camera.position.clone(), target: controls.target.clone() }, to, t0: performance.now(), ms: 1100 };
  };
  // Si el usuario agarra el estadio en medio de una animación, manda el dedo.
  const onGrab = () => {
    tween = null;
  };
  controls.addEventListener('start', onGrab);
  // `change` y no lo que devuelve update(): con la ruedita los controles llaman a update() ellos mismos, fuera del
  // cuadro, y el del cuadro siguiente ya no ve ningún cambio.
  controls.addEventListener('change', invalidate);

  let raf = 0;
  let visible = true;
  const frame = (now) => {
    raf = requestAnimationFrame(frame);
    if (!visible) return;
    if (tween) {
      const k = Math.min(1, Math.max(0, (now - tween.t0) / tween.ms));
      const e = k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2;
      camera.position.lerpVectors(tween.from.pos, tween.to.pos, e);
      controls.target.lerpVectors(tween.from.target, tween.to.target, e);
      if (k === 1) tween = null;
      dirty = true;
    }
    // Mueve la cámara si hace falta (amortiguado, «Girar solo») y avisa con `change`, que marca el redibujo.
    controls.update();
    if (dirty) draw();
  };
  raf = requestAnimationFrame(frame);
  const io = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) invalidate();
  });
  io.observe(container);

  // La tribuna elegida: su textura se ilumina (más el nivel elegido). De noche, menos, para no tapar el dibujo; y
  // nada cuando la cámara está sentada en esa tribuna.
  const picked = { id: null, level: null, mode: 'general' };
  const paintSelection = () => {
    const k = picked.mode === 'tribuna' ? 0 : night ? 0.35 : 0.9;
    for (const p of parts) {
      const on = picked.id != null && p.sector === picked.id && p.level != null;
      const exact = on && picked.level != null && p.level === picked.level;
      p.material.emissive.set(on ? (exact ? 0xffffff : 0xbfdcff) : 0x000000);
      p.material.emissiveIntensity = on ? (exact ? k * 1.4 : k) : 0;
    }
  };

  const api = {
    /** Resalta un sector (y un nivel) y lleva la cámara a mirarlo. */
    select(id, level, mode = 'general') {
      Object.assign(picked, { id, level, mode });
      paintSelection();
      for (const l of labels) l.el.classList.toggle('is-on', l.id === id);
      const s = sectores.find((x) => x.id === id);
      if (s) goTo(cameraFor(s.lado, mode, layout));
      invalidate();
    },
    /** `mode` = 'general' | 'tribuna' | 'arriba'; sin `lado`, la vista general es la inicial (desde el sudeste). */
    view(mode, lado) {
      controls.autoRotate = false;
      picked.mode = mode;
      paintSelection();
      goTo(mode === 'general' && !lado ? DEFAULT_VIEW : cameraFor(lado ?? 'sur', mode, layout));
    },
    reset() {
      goTo(DEFAULT_VIEW);
    },
    /** Dónde está la cámara y, si está en viaje, a dónde iba (para no saltar ni quedar a mitad de camino al cambiar de época). */
    getCamera() {
      return { pos: camera.position.toArray(), target: controls.target.toArray(), to: tween ? { pos: tween.to.pos.toArray(), target: tween.to.target.toArray() } : null };
    },
    setAutoRotate(on) {
      controls.autoRotate = on;
      invalidate();
    },
    /** Con público: las filas se llenan de gente (y los dibujos de butacas quedan tapados a medias). */
    setCrowd(on) {
      for (const p of parts) {
        if (!on) p.material.map = tile(p.kind, p.base);
        else {
          // Una textura de público por tipo de grada (2,7 MB cada una): el color de base solo se ve en las butacas
          // vacías y las escaleras, y entre bandejas del mismo tipo casi no cambia.
          const standing = p.kind !== 'butacas';
          const key = `gente:${p.kind}`;
          if (!tiles.has(key)) {
            const t = keep(crowdTile(p.base, standing, era));
            t.wrapS = THREE.RepeatWrapping;
            t.wrapT = THREE.RepeatWrapping;
            t.anisotropy = 8;
            t.repeat.set(0.5, 0.125);
            tiles.set(key, t);
          }
          p.material.map = tiles.get(key);
        }
        p.material.emissiveMap = p.material.map;
        // Con gente la tribuna es mate (el shader recorta la rugosidad en 1: con 3, el plástico de la textura no brilla).
        if (p.kind === 'butacas') p.material.roughness = on ? 3 : 1;
      }
      for (const d of decals) d.material.opacity = on ? 0.3 : 1;
      for (const fl of flags) fl.visible = on;
      invalidate();
    },
    /** De noche: cielo oscuro y las torres LED encendidas. */
    setNight(on) {
      night = on;
      // Sin torres (antes de 1969) la noche es de luna: azulada, con sombras suaves del mismo mapa.
      const moonlit = !towerLights.length;
      hemi.color.set(on && moonlit ? 0x8ea6d8 : 0xbcd6f5);
      hemi.intensity = on ? (moonlit ? 0.5 : 0.25) : DAY.hemi;
      sun.color.set(on && moonlit ? 0xc4d4ff : 0xfff8ee);
      sun.intensity = on ? (moonlit ? 0.4 : 0.05) : DAY.sun;
      if (beamMat) beamMat.visible = on;
      paintSelection();
      lampMat.emissiveIntensity = on ? 2.2 : 0.15;
      if (boardMat) boardMat.emissiveIntensity = on ? 1.1 : 0.2;
      // 800 por torre: el césped queda como lo más brillante sin quemarse (con 1300 recortaba). Las torres viejas
      // alumbraban menos.
      for (const s of towerLights) {
        s.visible = on;
        s.intensity = on ? (ledTowers ? 800 : 600) : 0;
      }
      haloMat.visible = on;
      viseraHalo.visible = on;
      for (const [m, c, k] of glow) {
        m.emissive.set(on ? c : 0x000000);
        m.emissiveIntensity = on ? k : 1;
      }
      houseMat.emissive.set(on ? 0x14110a : 0x000000);
      applyTheme();
    },
    dispose() {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      mq.removeEventListener('change', applyTheme);
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointerup', onUp);
      renderer.domElement.removeEventListener('webglcontextrestored', onRestore);
      controls.removeEventListener('start', onGrab);
      controls.removeEventListener('change', invalidate);
      controls.dispose();
      for (const d of disposables) d.dispose?.();
      dropEnvs();
      // Lo que `keep` no junta: los buffers de las mallas instanciadas y el mapa de sombras del sol. Y el contexto
      // WebGL: renderer.dispose() no lo suelta, y cada cambio de época crea un renderer nuevo.
      scene.traverse((o) => {
        if (o.isInstancedMesh) o.dispose();
      });
      sun.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
      labelLayer.remove();
    },
  };
  if (startNight) api.setNight(true);
  if (startCrowd) api.setCrowd(true);
  // Si la época anterior estaba en medio de un viaje de cámara, esta lo termina.
  if (start?.to) goTo(start.to);
  return api;
}

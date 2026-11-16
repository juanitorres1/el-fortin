import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFAULT_VIEW, ERAS, ERA_ORDER, FRONT, GAP, LAYOUT, ORBIT, OUT, PITCH, cameraFor, depthOf, offsets, sectorCapacity, sideNearest, stepProfile, totalCapacity } from '../src/lib/stadium.js';

test('stepProfile: arranca en el pie del frente, sube en escalones y cierra contra el piso', () => {
  const p = stepProfile(6, 1, 4, 2);
  assert.deepEqual(p[0], [0, 0]);
  assert.deepEqual(p[1], [0, 1]);
  assert.deepEqual(p.at(-1), [6, 0]);
  assert.deepEqual(p.at(-2), [6, 4]);
  const heights = p.slice(1, -1).map(([, v]) => v);
  assert.ok(heights.every((v, i) => i === 0 || v >= heights[i - 1]), 'la altura nunca baja');
  assert.equal(p.length, 2 + 3 * 2 + 1); // 3 escalones de 2 m
});

test('LAYOUT: cada nivel de club.json tiene su bandeja en el 3D', () => {
  const club = JSON.parse(readFileSync(new URL('../public/data/club.json', import.meta.url), 'utf8'));
  for (const s of club.estadio.tribunas.sectores) {
    const levels = LAYOUT[s.lado].filter((p) => p.level != null).map((p) => p.level);
    assert.deepEqual(levels, s.niveles.map((_, i) => i), s.id);
  }
});

test('offsets y depthOf: una bandeja en voladizo arranca antes y no suma lo que vuela', () => {
  const layout = { sur: [{ d: 24, y0: 1, y1: 9, len: 100 }, { d: 2, y0: 9, y1: 11, len: 100 }, { d: 30, y0: 12, y1: 28, len: 100, over: 6 }] };
  assert.deepEqual(offsets('sur', layout), [0, 24, 20]);
  assert.equal(depthOf('sur', layout), 50);
  // Sin `over` (las épocas viejas), una pieza detrás de la otra
  assert.deepEqual(offsets('oeste', ERAS[1951].layout), [0, 10]);
  assert.equal(depthOf('oeste', ERAS[1951].layout), 15);
});

test('LAYOUT: las plateas llegan hasta las curvas y las altas vuelan sin tapar la V ni pasarse de la pieza de adelante', () => {
  const side = PITCH.length + 2 * GAP;
  for (const lado of ['norte', 'sur']) {
    assert.equal(LAYOUT[lado][0].len, side, `${lado} baja: de esquina a esquina`);
    const at = offsets(lado);
    LAYOUT[lado].forEach((p, i) => {
      if (!p.over) return;
      assert.ok(at[i] > 0 && p.over < p.d, `${lado} ${i}: vuela sobre la pieza de adelante, no sobre la cancha`);
      // La panza del voladizo (80 cm bajo la primera fila) pasa por encima de todo lo que tiene debajo
      const under = LAYOUT[lado].slice(0, i).filter((q, j) => at[j] + q.d > at[i]);
      for (const q of under) assert.ok(q.y1 <= p.y0 - 0.8, `${lado} ${i}: no choca con la pieza de abajo`);
    });
  }
  // Las dos plateas quedan parejas de fondo, como en la foto aérea
  assert.ok(Math.abs(depthOf('norte') - depthOf('sur')) < 3);
  // De la Sur Baja quedan a la vista por lo menos 17 m (hasta ahí llega la V)
  assert.ok(offsets('sur').at(-1) >= 17);
});

test('cameraFor: la cámara general y la de tribuna quedan del lado elegido; desde arriba, encima del centro', () => {
  for (const lado of Object.keys(OUT)) {
    const g = cameraFor(lado);
    const t = cameraFor(lado, 'tribuna');
    assert.equal(sideNearest(g.pos), lado, `general ${lado}`);
    assert.equal(sideNearest(t.pos), lado, `tribuna ${lado}`);
    const dist = Math.hypot(t.pos[0], t.pos[2]);
    assert.ok(dist > 34 && dist < 40 + depthOf(lado) + 60, `la de tribuna está en la tribuna (${dist})`);
  }
  assert.deepEqual(cameraFor('norte', 'arriba').target, [0, 0, 0]);
  assert.ok(cameraFor('norte', 'arriba').pos[1] > 200);
});

test('club.json: los sectores del estadio suman la capacidad publicada', () => {
  const club = JSON.parse(readFileSync(new URL('../public/data/club.json', import.meta.url), 'utf8'));
  const t = club.estadio.tribunas;
  assert.deepEqual(t.sectores.map((s) => s.lado).sort(), ['este', 'norte', 'oeste', 'sur']);
  assert.equal(sectorCapacity(t.sectores[0]), 8751);
  const declared = Number(club.estadio.datos.find((d) => /Capacidad/.test(d.etiqueta)).valor.replace('.', ''));
  assert.equal(totalCapacity(t.sectores), declared);
});

test('ERAS: cada época tiene las cuatro tribunas, su texto en club.json y cámaras de su lado', () => {
  const club = JSON.parse(readFileSync(new URL('../public/data/club.json', import.meta.url), 'utf8'));
  assert.deepEqual(club.estadio.epocas.map((e) => e.id), ERA_ORDER);
  assert.equal(ERAS.hoy.layout, LAYOUT);
  for (const id of ERA_ORDER) {
    const { layout, style } = ERAS[id];
    assert.deepEqual(Object.keys(layout).sort(), ['este', 'norte', 'oeste', 'sur'], id);
    assert.ok(style.seats && style.streets, id);
    for (const lado of Object.keys(OUT)) {
      assert.equal(sideNearest(cameraFor(lado, 'tribuna', layout).pos), lado, `${id} ${lado}`);
      assert.ok(layout[lado].some((p) => p.level != null), `${id} ${lado}: tiene gradas`);
    }
  }
  // Villa Luro: tribunas bajas (de madera), mucho más chicas que las de hoy
  assert.ok(depthOf('norte', ERAS[1924].layout) < depthOf('norte') / 5);
  // Las torres llegaron en 1968
  assert.equal(ERAS[1951].style.towers, null);
  assert.ok(ERAS[1970].style.towers);
});

// ---------- Ronda 3: lo que protege a las épocas viejas ----------

const eachPiece = (fn) => {
  for (const id of ERA_ORDER) {
    for (const lado of Object.keys(OUT)) {
      const at = offsets(lado, ERAS[id].layout);
      ERAS[id].layout[lado].forEach((p, i) => fn(p, { id, lado, i, at, pieces: ERAS[id].layout[lado], where: `${id} ${lado} ${i}` }));
    }
  }
};

test('ERAS: ninguna pieza tiene medidas negativas, nulas o al revés', () => {
  eachPiece((p, { where }) => {
    for (const k of ['d', 'y0', 'y1', 'len']) assert.ok(Number.isFinite(p[k]), `${where}: ${k} es un número`);
    assert.ok(p.d > 0 && p.len > 0, `${where}: fondo y largo positivos`);
    assert.ok(p.y0 >= 0 && p.y1 > p.y0, `${where}: sube de adelante hacia atrás`);
    assert.ok((p.over ?? 0) >= 0 && (p.over ?? 0) < p.d, `${where}: el voladizo es menor que el fondo`);
    assert.ok((p.flare ?? 0) >= 0, `${where}: el trapecio abre hacia atrás`);
    // Las curvas giran el perfil alrededor de la esquina: con voladizo o trapecio no hay cómo dibujarlas
    if (p.curved) assert.ok(!p.over && !p.flare, `${where}: una curva no lleva over ni flare`);
  });
});

test('ERAS: estilos y materiales que la escena sabe dibujar', () => {
  // Los mismos nombres que usa estadio-scene.js (SEATS, torres, pantalla, calles): un nombre mal escrito ahí
  // tira un error al armar y la caja queda con el aviso de «no se puede mostrar».
  const SEATS = ['azul', 'cemento', 'madera'];
  for (const id of ERA_ORDER) {
    const { style } = ERAS[id];
    assert.ok(SEATS.includes(style.seats), `${id}: seats`);
    assert.ok([null, 'clasicas', 'rayadas', 'led'].includes(style.towers), `${id}: towers`);
    assert.ok([null, 'tablero', 'led'].includes(style.screen), `${id}: screen`);
    assert.ok(['villa-luro', 'liniers-viejo', 'liniers'].includes(style.streets), `${id}: streets`);
  }
  eachPiece((p, { where }) => {
    if (p.material != null) assert.ok(SEATS.includes(p.material), `${where}: material`);
    if (p.kind != null) assert.ok(['palcos', 'visera'].includes(p.kind), `${where}: kind`);
    if (p.tone != null) assert.ok(Number.isInteger(p.tone) && p.tone >= 0 && p.tone <= 0xffffff, `${where}: tone es un color`);
    if (p.techo != null) {
      // Un techo: a una o dos aguas y, si cubre solo un tramo, no más largo que la tribuna
      assert.ok([1, 2].includes(p.techo.aguas), `${where}: techo.aguas`);
      if (p.techo.len != null) assert.ok(p.techo.len > 0 && p.techo.len <= p.len, `${where}: techo.len`);
      assert.ok(!p.kind && !p.curved && !p.over, `${where}: el techo va sobre una grada recta y apoyada en el piso`);
    }
  });
});

test('ERAS: lo que confirmó el usuario de cada época vieja', () => {
  const tiers = (id, lado) => ERAS[id].layout[lado].filter((p) => !p.kind);
  // 1924: la principal sobre Basualdo (sur), con el módulo central techado a dos aguas y los extremos descubiertos; sin luz
  const main = ERAS[1924].layout.sur[0];
  assert.equal(main.techo.aguas, 2);
  assert.ok(main.techo.len < main.len / 2, 'el techo cubre solo el tramo central');
  for (const lado of ['norte', 'este', 'oeste']) assert.ok(ERAS[1924].layout[lado].every((p) => !p.techo && p.y1 < main.y1), `1924 ${lado}: más baja y sin techo`);
  assert.equal(ERAS[1924].style.towers, null);
  assert.ok(!ERAS[1924].style.lights && !ERAS[1924].style.fence);
  // 1951: asimétrico y sin segundas bandejas; Este alta y completa, Oeste más baja con tablones, Norte techada de madera
  const l51 = ERAS[1951].layout;
  for (const lado of Object.keys(OUT)) assert.ok(l51[lado].every((p) => !p.over), `1951 ${lado}: sin bandejas en voladizo`);
  assert.ok(l51.este[0].curved && !l51.oeste[0].curved);
  assert.ok(Math.max(...l51.oeste.map((p) => p.y1)) < l51.este[0].y1, 'la Oeste es más baja que la Este');
  assert.equal(l51.oeste.at(-1).material, 'madera');
  assert.equal(l51.norte[0].material, 'madera');
  assert.ok(l51.norte[0].techo);
  // Años 70: Norte en dos bandejas de curva a curva; Sur de una sola, baja; las cuatro torres
  const side = PITCH.length + 2 * GAP;
  assert.equal(tiers(1970, 'norte').length, 2);
  assert.ok(ERAS[1970].layout.norte.every((p) => p.len === side), 'la Norte va de curva a curva');
  assert.ok(ERAS[1970].layout.norte[1].over > 0);
  assert.equal(ERAS[1970].layout.sur.length, 1);
  assert.equal(ERAS[1970].layout.sur[0].len, side);
  assert.ok(ERAS[1970].layout.este[0].curved && ERAS[1970].layout.oeste[0].curved);
  assert.equal(ERAS[1970].style.towers, 'clasicas');
  // 1978: la Sur suma la alta (sin techo en ninguna época) y no hay rampas ni edificio detrás de la Norte
  assert.equal(tiers(1978, 'sur').length, 2);
  assert.ok(!ERAS[1978].style.ramps);
  for (const id of ERA_ORDER) assert.ok(ERAS[id].layout.sur.every((p) => p.kind !== 'visera' && (id === '1924' || !p.techo)), `${id}: la Sur de Liniers no se techa`);
  assert.ok(ERAS[1978].layout.norte.every((p) => p.kind !== 'visera'));
  // Alambrado en las tres de Liniers
  for (const id of ['1951', '1970', '1978']) assert.equal(ERAS[id].style.fence, true, `${id}: alambrado`);
  // «Hoy» no se toca desde las épocas viejas
  assert.ok(LAYOUT.sur.every((p) => p.tone == null));
});

test('offsets y depthOf: coinciden entre sí en todas las épocas, con y sin voladizo', () => {
  eachPiece((p, { id, lado, i, at, pieces, where }) => {
    assert.ok(at[i] >= 0, `${where}: no arranca delante de la primera fila`);
    if (i === 0) assert.equal(at[i], 0, `${where}: la primera pieza arranca en el frente`);
    else assert.equal(at[i], at[i - 1] + pieces[i - 1].d - (p.over ?? 0), `${where}: arranca donde termina la anterior, menos lo que vuela`);
    if (i === pieces.length - 1) assert.equal(at[i] + p.d, depthOf(lado, ERAS[id].layout), `${where}: la espalda de la última es el fondo del lado`);
  });
  // Los números de hoy, a mano: Norte 13 + 1,5 + 9 + (28 − 4) + 6 y Sur 24 + 1,5 + (34 − 7)
  assert.deepEqual(offsets('norte'), [0, 13, 14.5, 19.5, 47.5]);
  assert.equal(depthOf('norte'), 53.5);
  assert.deepEqual(offsets('sur'), [0, 24, 18.5]);
  assert.equal(depthOf('sur'), 52.5);
});

test('ERAS: una bandeja en voladizo pasa por encima de lo que tiene debajo (todas las épocas)', () => {
  eachPiece((p, { i, at, pieces, where }) => {
    if (!p.over) return;
    assert.ok(at[i] > 0, `${where}: vuela sobre otra pieza, no sobre la cancha`);
    pieces.slice(0, i).forEach((q, j) => {
      if (at[j] + q.d > at[i]) assert.ok(q.y1 <= p.y0 - 0.8, `${where}: la panza no choca con la pieza ${j}`);
    });
  });
});

test('cameraFor: en todas las épocas las cámaras son válidas y entran en los límites de los controles', () => {
  const check = ({ pos, target }, where) => {
    for (const n of [...pos, ...target]) assert.ok(Number.isFinite(n), `${where}: números`);
    const d = Math.hypot(pos[0] - target[0], pos[1] - target[1], pos[2] - target[2]);
    // Fuera de estos límites OrbitControls corrige la cámara al terminar la animación y se ve un salto.
    assert.ok(d >= ORBIT.minDistance && d <= ORBIT.maxDistance, `${where}: distancia ${d.toFixed(1)}`);
    assert.ok(Math.acos((pos[1] - target[1]) / d) <= ORBIT.maxPolarAngle, `${where}: no queda más baja de lo que dejan los controles`);
  };
  check(DEFAULT_VIEW, 'vista inicial');
  for (const id of ERA_ORDER) {
    const { layout } = ERAS[id];
    for (const lado of Object.keys(OUT)) {
      // En las épocas viejas «Desde la tribuna» siempre va a la Sur (Estadio3D.jsx): las otras no se usan
      const modes = id === 'hoy' || lado === 'sur' ? ['general', 'tribuna', 'arriba'] : ['general', 'arriba'];
      for (const mode of modes) check(cameraFor(lado, mode, layout), `${id} ${lado} ${mode}`);
      // «Desde la tribuna»: sentado sobre las gradas (ni enterrado ni flotando) y sin nada más alto adelante
      const at = offsets(lado, layout);
      const cam = cameraFor(lado, 'tribuna', layout).pos;
      const u = Math.hypot(cam[0], cam[2]) - FRONT[lado];
      const i = layout[lado].findLastIndex((p) => p.level != null);
      const p = layout[lado][i];
      assert.ok(u > at[i] && u < at[i] + p.d, `${id} ${lado}: la cámara está en su bandeja`);
      const floor = p.y0 + ((p.y1 - p.y0) * (u - at[i])) / p.d;
      assert.ok(cam[1] - floor > 1.5 && cam[1] - floor < 4, `${id} ${lado}: a la altura de los ojos (${(cam[1] - floor).toFixed(1)} m)`);
      layout[lado].slice(0, i).forEach((q, j) => assert.ok(q.y1 < cam[1], `${id} ${lado}: la pieza ${j} no tapa la cancha`));
      // El general mira desde afuera del estadio
      const g = cameraFor(lado, 'general', layout).pos;
      assert.ok(Math.hypot(g[0], g[2]) > FRONT[lado] + depthOf(lado, layout), `${id} ${lado}: la general queda afuera`);
    }
  }
});

// ---------- La escena, armada en Node con un renderer y un DOM falsos ----------
// No dibuja nada: comprueba que las cinco épocas arman sin errores, que no se pasan del presupuesto de «hoy», que
// solo se dibuja cuando algo cambia y que dispose() no deja nada colgado.

function fakeDom() {
  const noop = () => {};
  const ctx = () => new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : /Gradient$/.test(String(k)) ? () => ({ addColorStop: noop }) : noop),
    set: (t, k, v) => ((t[k] = v), true),
  });
  const doc = { addEventListener: noop, removeEventListener: noop };
  const el = () => {
    const listeners = new Map();
    const e = {
      style: {}, children: [], className: '', textContent: '', clientWidth: 343, clientHeight: 288, listeners, ownerDocument: doc,
      classList: { toggle: noop },
      setAttribute: noop,
      appendChild(c) { this.children.push(c); c.parentNode = this; return c; },
      remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((x) => x !== this); },
      querySelector: () => null,
      addEventListener: (t, f) => listeners.set(t, [...(listeners.get(t) ?? []), f]),
      removeEventListener: (t, f) => listeners.set(t, (listeners.get(t) ?? []).filter((x) => x !== f)),
      getRootNode: () => doc,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 343, height: 288 }),
      getContext: ctx,
    };
    return e;
  };
  doc.createElement = el;
  let queue = [];
  let now = 0;
  Object.assign(globalThis, {
    document: doc,
    devicePixelRatio: 2,
    matchMedia: () => ({ matches: false, addEventListener: noop, removeEventListener: noop }),
    ResizeObserver: class { constructor(f) { this.f = f; } observe() { this.f(); } disconnect() {} },
    IntersectionObserver: class { constructor(f) { this.f = f; } observe() { this.f([{ isIntersecting: true }]); } disconnect() {} },
    requestAnimationFrame: (f) => queue.push(f),
    cancelAnimationFrame: () => { queue = []; },
  });
  /** Corre `n` cuadros. */
  const frames = (n = 1) => {
    for (let i = 0; i < n; i++) {
      now += 1000; // un segundo por cuadro: cada animación de cámara termina en dos cuadros
      const q = queue;
      queue = [];
      for (const f of q) f(performance.now() + now);
    }
  };
  const renderer = () => {
    const r = { domElement: el(), shadowMap: {}, draws: 0, scene: null, lost: 0 };
    return Object.assign(r, { setPixelRatio: noop, setSize: noop, dispose: noop, forceContextLoss: () => { r.lost++; }, render: (scene) => { r.draws++; r.scene = scene; } });
  };
  return { el, frames, renderer };
}

/** Lo que cuesta dibujar una escena: mallas, materiales, triángulos, sombras y texturas (una por imagen). */
function sceneCost(scene) {
  const c = { meshes: 0, tris: 0, casters: 0, casterTris: 0, overflow: [] };
  const mats = new Set();
  const images = new Map();
  scene.traverse((o) => {
    if (!o.isMesh) return;
    c.meshes++;
    for (const m of [o.material].flat()) {
      mats.add(m);
      for (const t of [m.map, m.emissiveMap, m.roughnessMap]) if (t) images.set(t.source, t.image.width * t.image.height);
    }
    let tris = (o.geometry.index ?? o.geometry.attributes.position).count / 3;
    if (o.isInstancedMesh) {
      if (o.count > o.instanceMatrix.count) c.overflow.push(o.count);
      tris *= o.count;
    }
    c.tris += tris;
    if (o.castShadow) {
      c.casters++;
      c.casterTris += tris;
    }
  });
  c.materials = mats.size;
  c.textures = images.size;
  c.textureMB = ([...images.values()].reduce((a, b) => a + b, 0) * 4 * (4 / 3)) / 2 ** 20; // RGBA con mipmaps
  return c;
}

// Presupuesto por época: lo que cuesta «hoy», con un poco de aire. Medido en nov-2026, de noche y con público:
// 138 mallas, 77 materiales, 112.450 triángulos, 66 mallas con sombra y 21.800 triángulos de sombra, 20 texturas
// (contando las de rugosidad) y 23,1 MB. Para ver los números de cada época: STADIUM_COST=1 node --test tests/stadium.test.js
// Con el barrio real (nov-2026, data/entorno.json de OpenStreetMap): ~3.500 casas y ~4.000 árboles sobre 900 m de
// radio llevan «hoy» a 159.000 triángulos con 136 mallas (las mallas no subieron: todo va instanciado o unido). El
// tope de triángulos subió de 115.000 a 165.000; los árboles de lejos van con 20 triángulos y más ralos para eso.
const BUDGET = { meshes: 150, materials: 80, tris: 165000, casters: 85, casterTris: 24000, textures: 20, textureMB: 24 };

test('escena 3D: las cinco épocas arman, entran en el presupuesto, dibujan a demanda y se liberan', async () => {
  const { el, frames, renderer } = fakeDom();
  const { buildStadium } = await import('../src/sections/estadio-scene.js');
  const club = JSON.parse(readFileSync(new URL('../public/data/club.json', import.meta.url), 'utf8'));
  const { sectores } = club.estadio.tribunas;
  // Hoy con el barrio real (data/entorno.json) y, aparte, sin él (si no baja, queda el entorno aproximado).
  const entorno = JSON.parse(readFileSync(new URL('../public/data/entorno.json', import.meta.url), 'utf8'));
  for (const era of [...ERA_ORDER, 'hoy sin entorno']) {
    const box = el();
    const r = renderer();
    const picks = [];
    const api = buildStadium(box, r, { sectores, era: era.split(' ')[0], entorno: era === 'hoy sin entorno' ? null : entorno, night: true, crowd: true, onPick: (...a) => picks.push(a) });
    assert.equal(r.draws, 0, `${era}: el primer dibujo espera al primer cuadro (con la noche y el público ya puestos)`);
    assert.equal(r.shadowMap.autoUpdate, false, `${era}: sombras estáticas`);
    assert.equal(r.shadowMap.needsUpdate, true, `${era}: las sombras se dibujan en el primer cuadro`);
    frames(1);
    assert.equal(r.draws, 1, `${era}: un solo dibujo al empezar`);

    // Presupuesto, en el peor caso (de noche y con público)
    const cost = sceneCost(r.scene);
    if (process.env.STADIUM_COST) console.log(era, JSON.stringify(cost, (k, v) => (typeof v === 'number' ? Math.round(v * 10) / 10 : v)));
    assert.deepEqual(cost.overflow, [], `${era}: ninguna malla instanciada pasa su tope`);
    for (const [k, max] of Object.entries(BUDGET)) assert.ok(cost[k] <= max, `${era}: ${k} = ${Math.round(cost[k])}, el tope es ${max}`);

    // En reposo no dibuja; cada acción dibuja
    frames(30);
    assert.equal(r.draws, 1, `${era}: en reposo no dibuja`);
    const actions = {
      setNight: () => api.setNight(false),
      setCrowd: () => api.setCrowd(false),
      select: () => api.select(sectores[0].id, 0),
      view: () => api.view('tribuna', 'sur'),
      reset: () => api.reset(),
      setAutoRotate: () => api.setAutoRotate(true),
    };
    for (const [name, run] of Object.entries(actions)) {
      api.setAutoRotate(false);
      frames(40); // que terminen la animación y el amortiguado
      const before = r.draws;
      frames(5);
      assert.equal(r.draws, before, `${era}: quieto antes de ${name}`);
      run();
      frames(1);
      assert.ok(r.draws > before, `${era}: ${name} redibuja`);
    }
    api.setAutoRotate(false);
    frames(40);

    // Contexto WebGL restaurado: rehace las sombras y dibuja
    r.shadowMap.needsUpdate = false;
    const before = r.draws;
    for (const f of r.domElement.listeners.get('webglcontextrestored') ?? []) f();
    frames(1);
    assert.equal(r.shadowMap.needsUpdate, true, `${era}: rehace las sombras al volver el contexto`);
    assert.equal(r.draws, before + 1, `${era}: dibuja al volver el contexto`);

    // La cámara que se pasa a la época siguiente: quieta, sin destino; en viaje, con el destino
    const cam = api.getCamera();
    assert.ok([...cam.pos, ...cam.target].every(Number.isFinite), `${era}: getCamera`);
    assert.equal(cam.to, null, `${era}: quieta, no va a ningún lado`);
    api.view('arriba');
    assert.deepEqual(api.getCamera().to, cameraFor('sur', 'arriba', ERAS[era.split(' ')[0]].layout), `${era}: en viaje, dice a dónde va`);

    api.dispose();
    assert.equal(r.lost, 1, `${era}: suelta el contexto WebGL`);
    assert.deepEqual(box.children, [], `${era}: no deja el canvas ni los carteles`);
    assert.deepEqual([...r.domElement.listeners].filter(([, fs]) => fs.length).map(([t]) => t), [], `${era}: no deja listeners en el canvas`);
    const after = r.draws;
    frames(3);
    assert.equal(r.draws, after, `${era}: después de dispose no dibuja más`);
  }
});

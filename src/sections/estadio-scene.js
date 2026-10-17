// La escena 3D del Amalfitani con Three.js. Solo corre en el navegador y se carga aparte (import dinámico desde
// Estadio3D.jsx), así el resto del sitio no baja Three.js. Las medidas y las cuentas están en lib/stadium.js.
//
// Lo que se ve, según la foto aérea actual: todo azul; populares curvas detrás de los arcos; Platea Norte con tres
// bandejas, palcos, «VELEZ» escrito con butacas blancas en la alta y la estructura de la visera atrás; Platea Sur
// con la V blanca en la baja, palcos y la alta descubierta; frentes de vidrio en las plateas, cuatro torres LED y la
// pantalla detrás de la Popular Este. Alrededor: Av. Juan B. Justo por el norte y la Autopista Perito Moreno
// (elevada) pegada a la Sur.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { DEFAULT_VIEW, FRONT, GAP, LAYOUT, OUT, PITCH, cameraFor, depthOf, offsets, stepProfile } from '../lib/stadium.js';

// Todo azul, como en la foto aérea de hoy: plateas y populares.
const COLOR = {
  seat: 0x1f4c94, seatAlt: 0x2456a3, concrete: 0xb8bec7, popular: 0x2352a0, facade: 0xe8ebef, roof: 0x9ba4ae,
  palcos: 0x1b2430, on: 0x7cc3ff, onLevel: 0xdff1ff, mast: 0x5d6673, grass: 0x2f8a4f, grass2: 0x2a7f48,
};
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

/** Césped con franjas y las líneas de la cancha (105 × 68 m, con 4 m de margen). */
function pitchTexture() {
  const s = 8; // px por metro
  const W = (PITCH.length + 2 * GAP) * s;
  const H = (PITCH.width + 2 * GAP) * s;
  return canvasTexture(W, H, (g) => {
    for (let i = 0; i * 9 * s < W; i++) {
      g.fillStyle = i % 2 ? '#2a7f48' : '#2f8a4f';
      g.fillRect(i * 9 * s, 0, 9 * s, H);
    }
    g.strokeStyle = 'rgba(255,255,255,0.92)';
    g.lineWidth = 0.14 * s;
    const x0 = GAP * s;
    const y0 = GAP * s;
    const L = PITCH.length * s;
    const A = PITCH.width * s;
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
      g.beginPath();
      g.arc(x + dir * 11 * s, y0 + A / 2, 9.15 * s, side ? Math.PI - 0.93 : -0.93, side ? Math.PI + 0.93 : 0.93);
      g.stroke();
    }
  });
}

/** Norte Alta: «VELEZ» escrito con butacas blancas (se lee desde la cancha). */
function velezTexture() {
  return canvasTexture(1600, 440, (g, w, h) => {
    g.fillStyle = '#ffffff';
    g.font = '900 300px Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('VELEZ', w / 2, h / 2 + 8);
  });
}

/** Sur Baja: la V blanca sobre las butacas azules (el vértice hacia la cancha, como la de la camiseta). */
function surTexture() {
  return canvasTexture(1600, 480, (g, w, h) => {
    g.strokeStyle = '#ffffff';
    g.lineWidth = 54;
    g.lineJoin = 'miter';
    g.beginPath();
    g.moveTo(w * 0.33, 0);
    g.lineTo(w * 0.5, h - 30);
    g.lineTo(w * 0.67, 0);
    g.stroke();
  });
}

/** Calzada con carriles (para Juan B. Justo y la autopista). */
function roadTexture() {
  return canvasTexture(1024, 160, (g, w, h) => {
    g.fillStyle = '#4b5059';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#d9b43a';
    g.fillRect(0, h / 2 - 2, w, 4);
    g.fillStyle = 'rgba(255,255,255,0.7)';
    for (let x = 0; x < w; x += 48) for (const y of [h / 6, h / 3, (2 * h) / 3, (5 * h) / 6]) g.fillRect(x, y, 24, 3);
  });
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
 * al tocar una tribuna. Devuelve { select, view, setNight, setAutoRotate, dispose }.
 */
export function createStadium(container, { sectores, onPick, reducedMotion = false }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);
  renderer.domElement.className = 'st3d-canvas';

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 1, 2000);
  camera.position.set(...DEFAULT_VIEW.pos);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 40;
  controls.maxDistance = 460;
  controls.maxPolarAngle = Math.PI * 0.47;
  controls.autoRotateSpeed = 0.6;
  controls.target.set(...DEFAULT_VIEW.target);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x6f7d70, 1.25);
  const sun = new THREE.DirectionalLight(0xffffff, 1.9);
  sun.position.set(140, 220, 110);
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

  // Piso y explanada alrededor del estadio.
  const groundMat = mat(0xcfd5cf);
  const ground = add(new THREE.PlaneGeometry(1400, 1400), groundMat, { cast: false });
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.05;
  scene.add(ground);
  const plaza = add(new THREE.PlaneGeometry(PITCH.length + 2 * 92, PITCH.width + 2 * 104), mat(0xd9dcdf), { cast: false });
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.y = -0.02;
  scene.add(plaza);
  // Alrededores: Av. Juan B. Justo por el norte (con el estacionamiento entre la avenida y la Norte) y la
  // Autopista Perito Moreno (AU6), elevada, pegada a la Sur, como se ve en la foto aérea.
  const roadTex = keep(roadTexture());
  roadTex.wrapS = THREE.RepeatWrapping;
  roadTex.repeat.set(8, 1);
  const roadMat = mat(0xffffff, { map: roadTex });
  const zJusto = -(FRONT.norte + depthOf('norte') + 48);
  const justo = add(new THREE.PlaneGeometry(1000, 28), roadMat, { cast: false });
  justo.rotation.x = -Math.PI / 2;
  justo.position.set(0, 0.03, zJusto);
  scene.add(justo);
  const zAu6 = FRONT.sur + depthOf('sur') + 24;
  const deck = add(new THREE.BoxGeometry(1000, 1.6, 30), mat(0x9aa1aa));
  deck.position.set(0, 8.2, zAu6);
  scene.add(deck);
  const deckTop = add(new THREE.PlaneGeometry(1000, 28), roadMat, { cast: false });
  deckTop.rotation.x = -Math.PI / 2;
  deckTop.position.set(0, 9.02, zAu6);
  scene.add(deckTop);
  for (let x = -480; x <= 480; x += 30) {
    const pier = add(new THREE.BoxGeometry(2, 8, 10), mat(0xa9b0b8));
    pier.position.set(x, 4, zAu6);
    scene.add(pier);
  }

  const pitchTex = keep(pitchTexture());
  const pitch = add(new THREE.PlaneGeometry(PITCH.length + 2 * GAP, PITCH.width + 2 * GAP), mat(0xffffff, { map: pitchTex }), { cast: false });
  pitch.rotation.x = -Math.PI / 2;
  pitch.position.y = 0.02;
  scene.add(pitch);

  // Tribunas: cada pieza es un sólido escalonado (ExtrudeGeometry); las curvas de las populares, LatheGeometry.
  const pickable = [];
  const parts = []; // { mesh, sector, level, base }
  const glassMat = mat(0xcfe8ff, { transparent: true, opacity: 0.35, roughness: 0.1, metalness: 0.2 });
  for (const s of sectores) {
    const group = new THREE.Group();
    group.rotation.y = ANGLE[s.lado];
    const at = offsets(s.lado);
    LAYOUT[s.lado].forEach((p, idx) => {
      const u0 = FRONT[s.lado] + at[idx];
      const solid = Boolean(p.kind);
      const pts = solid ? [[0, 0], [0, p.y1], [p.d, p.y1], [p.d, 0]] : stepProfile(p.d, p.y0, p.y1);
      const shape = new THREE.Shape(pts.map(([u, v]) => new THREE.Vector2(u, v)));
      const base = p.kind === 'palcos' ? COLOR.palcos : p.kind === 'visera' ? COLOR.roof : p.curved ? COLOR.popular : idx % 2 ? COLOR.seatAlt : COLOR.seat;
      const material = mat(base, p.kind === 'palcos' ? { roughness: 0.2, metalness: 0.6 } : {});
      const geo = new THREE.ExtrudeGeometry(shape, { depth: p.len, bevelEnabled: false });
      geo.translate(0, 0, -p.len / 2);
      const mesh = add(geo, material);
      mesh.position.x = u0;
      group.add(mesh);
      const part = { mesh, sector: s.id, level: p.level ?? null, base };
      parts.push(part);
      mesh.userData = part;
      pickable.push(mesh);
      if (p.curved) {
        // Las esquinas: el mismo perfil girado 90° alrededor de cada esquina de la primera fila.
        for (const [sign, start] of [[1, 0], [-1, Math.PI / 2]]) {
          // El perfil al revés: si no, las normales quedan para adentro y la curva se ve oscura.
          const lathe = add(new THREE.LatheGeometry(pts.map(([u, v]) => new THREE.Vector2(u, v)).reverse(), 20, start, Math.PI / 2), material);
          lathe.position.set(u0, 0, (sign * p.len) / 2);
          group.add(lathe);
          const lp = { mesh: lathe, sector: s.id, level: p.level ?? null, base };
          parts.push(lp);
          lathe.userData = lp;
          pickable.push(lathe);
        }
      }
      // Frentes de vidrio de las plateas (reemplazaron a los alambrados).
      if (!solid && !p.curved) {
        const glass = add(new THREE.PlaneGeometry(p.len, 1.1), glassMat, { cast: false, receive: false });
        glass.position.set(u0 - 0.05, p.y0 + 0.55, 0);
        glass.rotation.y = Math.PI / 2;
        group.add(glass);
      }
      // Visera de la Norte: losa metálica que sale de la estructura de atrás y cubre las últimas filas de la alta.
      if (p.kind === 'visera') {
        const roof = add(new THREE.BoxGeometry(p.d + 4, 0.8, p.len), mat(0xd7dbe0, { metalness: 0.4, roughness: 0.4 }));
        roof.position.set(u0 + p.d / 2 - 2, p.y1 + 0.4, 0);
        group.add(roof);
      }
      // Paredes de afuera (fachada de hormigón) detrás de la última pieza.
      if (idx === LAYOUT[s.lado].length - 1) {
        const top = p.y1;
        const facade = add(new THREE.BoxGeometry(0.6, top, p.len), mat(COLOR.facade));
        facade.position.set(u0 + p.d + 0.3, top / 2, 0);
        group.add(facade);
      }
    });
    scene.add(group);
  }

  // Plano apoyado sobre las puntas de los escalones de una o más piezas, con un dibujo hecho con butacas.
  const decal = (lado, idxFrom, idxTo, texture) => {
    const L = LAYOUT[lado];
    const at = offsets(lado);
    const a = L[idxFrom];
    const b = L[idxTo];
    const u0 = FRONT[lado] + at[idxFrom];
    const u1 = FRONT[lado] + at[idxTo] + b.d;
    // Sobre las puntas de los escalones: la recta que las une queda un escalón más arriba que la pendiente.
    const v0 = a.y0 + (a.y1 - a.y0) / Math.max(1, Math.round(a.d / 1.2)) + 0.12;
    const v1 = b.y1 + (b.y1 - b.y0) / Math.max(1, Math.round(b.d / 1.2)) + 0.12;
    const len = Math.min(a.len, b.len) - 6;
    const slope = Math.hypot(u1 - u0, v1 - v0);
    keep(texture);
    const plane = add(new THREE.PlaneGeometry(len, slope), mat(0xffffff, { map: texture, transparent: true, depthWrite: false }), { cast: false });
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
    return plane;
  };
  // Dibujos hechos con butacas: «VELEZ» en la Norte Alta y la V blanca en la Sur Baja.
  decal('norte', 3, 3, velezTexture());
  decal('sur', 0, 0, surTexture());

  // Pantalla LED detrás de la Popular Este.
  const screenTex = keep(screenTexture());
  const screenBox = add(new THREE.BoxGeometry(1.4, 10, 24), mat(0x15191f));
  const xScreen = FRONT.este + depthOf('este') + 1.5;
  screenBox.position.set(xScreen, 21, 0);
  scene.add(screenBox);
  const screenFace = add(new THREE.PlaneGeometry(23, 9.2), mat(0xffffff, { map: screenTex, emissive: 0xffffff, emissiveMap: screenTex, emissiveIntensity: 0.6 }), { cast: false });
  screenFace.position.set(xScreen - 0.75, 21, 0);
  screenFace.rotation.y = -Math.PI / 2;
  scene.add(screenFace);

  // Torres de iluminación LED en las esquinas: mástil reticulado (aproximado) y panel inclinado hacia la cancha.
  const lampMat = mat(0xf4f7ff, { emissive: 0xffffff, emissiveIntensity: 0.15 });
  const towerLights = [];
  for (const [x, z] of TOWERS) {
    const mast = add(new THREE.CylinderGeometry(0.7, 1.6, 46, 4, 1), mat(COLOR.mast, { metalness: 0.5, roughness: 0.5 }));
    mast.position.set(x, 23, z);
    mast.rotation.y = Math.PI / 4;
    scene.add(mast);
    const head = new THREE.Group();
    head.position.set(x, 47, z);
    head.lookAt(0, 0, 0);
    const panel = add(new THREE.BoxGeometry(12, 7, 0.8), mat(0x2b3037));
    head.add(panel);
    const face = add(new THREE.PlaneGeometry(11.4, 6.4), lampMat, { cast: false });
    face.position.z = 0.42;
    head.add(face);
    scene.add(head);
    const spot = new THREE.SpotLight(0xffffff, 0, 320, 0.55, 0.6, 1.2);
    spot.position.set(x, 47, z);
    spot.target.position.set(0, 0, 0);
    scene.add(spot, spot.target);
    towerLights.push(spot);
  }

  // Carteles con el nombre de cada tribuna (HTML encima del canvas, siguen a la cámara).
  const labelLayer = document.createElement('div');
  labelLayer.className = 'st3d-labels';
  labelLayer.setAttribute('aria-hidden', 'true');
  container.appendChild(labelLayer);
  const labels = sectores.map((s) => {
    const el = document.createElement('span');
    el.className = 'st3d-label';
    el.textContent = s.nombre.replace(/ «.*»/, '');
    labelLayer.appendChild(el);
    const [ox, oz] = OUT[s.lado];
    const r = FRONT[s.lado] + depthOf(s.lado) * 0.55;
    const top = Math.max(...LAYOUT[s.lado].map((p) => p.y1)) + 8;
    return { el, id: s.id, pos: new THREE.Vector3(ox * r, top, oz * r) };
  });
  for (const [text, pos] of [['Av. Juan B. Justo', [80, 2, zJusto]], ['Autopista Perito Moreno (AU6)', [40, 12, zAu6]]]) {
    const el = document.createElement('span');
    el.className = 'st3d-label st3d-label-street';
    el.textContent = text;
    labelLayer.appendChild(el);
    labels.push({ el, id: null, pos: new THREE.Vector3(...pos) });
  }

  // Tamaño y colores según el tema.
  const applyTheme = () => {
    const dark = matchMedia('(prefers-color-scheme: dark)').matches;
    scene.background = new THREE.Color(night ? 0x060b16 : dark ? 0x1a2028 : 0xdfe9f3);
    groundMat.color.set(night ? 0x141a22 : dark ? 0x2a3038 : 0xcfd5cf);
  };
  let night = false;
  applyTheme();
  const mq = matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener('change', applyTheme);
  const resize = () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();
  const ro = new ResizeObserver(resize);
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
    if (reducedMotion) {
      camera.position.copy(to.pos);
      controls.target.copy(to.target);
      return;
    }
    tween = { from: { pos: camera.position.clone(), target: controls.target.clone() }, to, t0: performance.now(), ms: 1100 };
  };

  let raf = 0;
  let visible = true;
  const v = new THREE.Vector3();
  const frame = (now) => {
    raf = requestAnimationFrame(frame);
    if (!visible) return;
    if (tween) {
      const k = Math.min(1, (now - tween.t0) / tween.ms);
      const e = k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2;
      camera.position.lerpVectors(tween.from.pos, tween.to.pos, e);
      controls.target.lerpVectors(tween.from.target, tween.to.target, e);
      if (k === 1) tween = null;
    }
    controls.update();
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
  raf = requestAnimationFrame(frame);
  const io = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
  });
  io.observe(container);

  return {
    /** Resalta un sector (y un nivel) y lleva la cámara a mirarlo. */
    select(id, level, mode = 'general') {
      for (const p of parts) {
        const on = p.sector === id;
        p.mesh.material.color.set(on && level != null && p.level === level ? COLOR.onLevel : on && p.level != null ? COLOR.on : p.base);
      }
      for (const l of labels) l.el.classList.toggle('is-on', l.id === id);
      const s = sectores.find((x) => x.id === id);
      if (s) goTo(cameraFor(s.lado, mode));
    },
    /** `mode` = 'general' | 'tribuna' | 'arriba'; sin `lado`, la vista general es la inicial (desde el sudeste). */
    view(mode, lado) {
      controls.autoRotate = false;
      goTo(mode === 'general' && !lado ? DEFAULT_VIEW : cameraFor(lado ?? 'sur', mode));
    },
    reset() {
      goTo(DEFAULT_VIEW);
    },
    setAutoRotate(on) {
      controls.autoRotate = on;
    },
    /** De noche: cielo oscuro y las torres LED encendidas. */
    setNight(on) {
      night = on;
      hemi.intensity = on ? 0.25 : 1.25;
      sun.intensity = on ? 0.05 : 1.9;
      lampMat.emissiveIntensity = on ? 2.2 : 0.15;
      for (const s of towerLights) s.intensity = on ? 2600 : 0;
      applyTheme();
    },
    dispose() {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      mq.removeEventListener('change', applyTheme);
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointerup', onUp);
      controls.dispose();
      for (const d of disposables) d.dispose?.();
      renderer.dispose();
      renderer.domElement.remove();
      labelLayer.remove();
    },
  };
}

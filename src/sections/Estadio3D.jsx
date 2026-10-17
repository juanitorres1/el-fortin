// El Amalfitani en 3D (Club › Estadio): se gira arrastrando (o con los botones) y se puede ver la cancha desde cada
// tribuna. Es un esquema, no un plano a escala, hecho con transformaciones 3D de CSS: sin librerías ni imágenes.
// Los sectores salen de data/club.json (estadio.tribunas); la cuenta de los ángulos, de lib/stadium.js.
import { useEffect, useRef, useState } from 'react';
import { SIDE_ANGLE, nearestAngle, sectorCapacity, sideInFront, viewFrom } from '../lib/stadium.js';

// Medidas del esquema (px a escala 1). La cancha va en el centro con el lado largo de este a oeste: las plateas
// (norte y sur) sobre los laterales y las populares (este y oeste) detrás de los arcos. Como el Amalfitani: sin
// techo, gradas inclinadas, plateas con bandejas una arriba de la otra y cuatro torres de luz detrás de las esquinas.
const WORLD = { w: 640, h: 500 };
const PITCH = { w: 300, h: 196 };
const GAP = 12; // de la línea de cal a la primera fila
const HALF = { norte: [PITCH.w / 2, PITCH.h / 2], sur: [PITCH.w / 2, PITCH.h / 2], este: [PITCH.h / 2, PITCH.w / 2], oeste: [PITCH.h / 2, PITCH.w / 2] };
const DIR = { norte: [0, -1], sur: [0, 1], este: [1, 0], oeste: [-1, 0] };
const COMPASS = [['N', 'norte'], ['E', 'este'], ['S', 'sur'], ['O', 'oeste']];
const TILT = { normal: 58, tribuna: 70, arriba: 0 };
const LADO = { norte: 'Norte', sur: 'Sur', este: 'Este', oeste: 'Oeste' };
const fmtN = (n) => n.toLocaleString('es-AR');

// Perfil de cada bandeja según cuántas tiene la tribuna: profundidad en planta, altura de la primera y de la última
// fila. Cada bandeja empieza donde termina la anterior y más arriba (el frente que queda es el de los palcos).
const PROFILE = {
  1: [{ d: 92, z0: 3, z1: 52 }],
  2: [{ d: 46, z0: 3, z1: 27 }, { d: 46, z0: 36, z1: 76 }],
  3: [{ d: 30, z0: 3, z1: 19 }, { d: 24, z0: 25, z1: 39 }, { d: 40, z0: 46, z1: 80 }],
};
const DEPTH = (n) => PROFILE[n].reduce((t, l) => t + l.d, 0);
const TOWER = { h: 140, dx: PITCH.w / 2 + GAP + 74, dy: PITCH.h / 2 + GAP + 72 };

/**
 * Una bandeja: la grada inclinada, el frente (de la cancha o de los palcos), la espalda si es la última y los
 * costados con la forma de la pendiente. Se dibuja para el lado norte; la tribuna entera se gira a su lado.
 */
function Tier({ s, i, n, selected, level, onPick }) {
  const [along, dist] = HALF[s.lado];
  const p = PROFILE[n][i];
  const y0 = -(dist + GAP + PROFILE[n].slice(0, i).reduce((t, l) => t + l.d, 0)); // borde de adelante
  const rise = p.z1 - p.z0;
  const slope = Math.hypot(p.d, rise);
  const spread = along + 4 + (y0 * -1 - dist) * 0.35; // un poco más ancha hacia atrás, como las tribunas reales
  const cls = `st3d-tier${selected ? ' is-on' : ''}${selected && level === i ? ' is-level' : ''}${n === 1 ? ' is-popular' : ''}`;
  const side = { top: y0 - p.d, height: p.d, width: p.z1, '--cut': `${rise}px` };
  return (
    <div className={cls} onClick={() => onPick(s.id, i)}>
      <div className="st3d-slope" style={{ left: -spread, width: spread * 2, top: y0 - slope, height: slope, transform: `translateZ(${p.z0}px) rotateX(${-(Math.atan2(rise, p.d) * 180) / Math.PI}deg)` }} />
      <i className="st3d-face st3d-front" style={{ left: -spread, width: spread * 2, top: y0, height: p.z0, transform: `translateZ(${p.z0}px) rotateX(-90deg)` }} />
      {i === n - 1 && <i className="st3d-face st3d-back" style={{ left: -spread, width: spread * 2, top: y0 - p.d, height: p.z1, transform: `translateZ(${p.z1}px) rotateX(-90deg)` }} />}
      <i className="st3d-face st3d-left" style={{ ...side, left: -spread, transform: `translateZ(${p.z1}px) rotateY(90deg)` }} />
      <i className="st3d-face st3d-right" style={{ ...side, left: spread - p.z1, transform: `translateZ(${p.z1}px) rotateY(-90deg)` }} />
    </div>
  );
}

/** Torre de iluminación detrás de una esquina, con los reflectores mirando a la cancha. */
function Tower({ x, y }) {
  const face = (Math.atan2(-y, -x) * 180) / Math.PI + 90; // el frente del panel apunta al centro
  return (
    <div className="st3d-tower" style={{ transform: `translate(${x}px, ${y}px) rotateZ(${face}deg)` }}>
      <div className="st3d-mast" style={{ height: TOWER.h, top: -TOWER.h }}><i className="st3d-lamps" /></div>
      <div className="st3d-mast st3d-mast-b" style={{ height: TOWER.h, top: -TOWER.h }} />
    </div>
  );
}

/** Cartel que siempre mira a quien mira la pantalla (se compensa el giro de la escena). */
function Label({ x, y, z = 60, rot, tilt, children, className = '' }) {
  return (
    <div className={`st3d-label ${className}`} style={{ transform: `translate3d(${x}px, ${y}px, ${z}px) rotateZ(${-rot}deg) rotateX(${-tilt}deg)` }}>
      {children}
    </div>
  );
}

function Info({ s, level, general }) {
  if (!s) return <p className="muted">Tocá una tribuna para ver quién entra y por qué puerta.</p>;
  return (
    <>
      <p className="kicker">{s.tipo} · lado {LADO[s.lado].toLowerCase()}</p>
      <h3 className="h3 st3d-name">{s.nombre}</h3>
      <p>{s.texto}</p>
      <dl className="st3d-levels">
        {s.niveles.map((l, i) => (
          <div key={l.nombre} className={i === level ? 'is-level' : undefined}>
            <dt>{s.niveles.length > 1 ? `Platea ${l.nombre.toLowerCase()}` : l.nombre}</dt>
            <dd><b className="num">{fmtN(l.capacidad)}</b> lugares{l.puertas && <> · {/[ ,y]/.test(l.puertas) ? 'puertas' : 'puerta'} {l.puertas}</>}{l.nota && <small> · {l.nota}</small>}</dd>
          </div>
        ))}
      </dl>
      {s.niveles.length > 1 && <p className="muted small">En total, {fmtN(sectorCapacity(s))} lugares.</p>}
      {s.acceso && <p className="st3d-access"><b>Cómo se entra:</b> {s.acceso}</p>}
      {s.aConfirmar?.length > 0 && (
        <div className="st3d-pending">
          <p><b>Falta confirmar</b></p>
          <ul>{s.aConfirmar.map((t) => <li key={t}>{t}</li>)}</ul>
        </div>
      )}
      {general?.length > 0 && <ul className="st3d-general">{general.map((t) => <li key={t}>{t}</li>)}</ul>}
    </>
  );
}

/** `tribunas` = club.json › estadio.tribunas. */
export function Estadio3D({ tribunas }) {
  const sectores = tribunas?.sectores ?? [];
  const [rot, setRot] = useState(0);
  const [mode, setMode] = useState('normal');
  const [pick, setPick] = useState({ id: null, level: null });
  const [scale, setScale] = useState(1);
  const [dragging, setDragging] = useState(false);
  const wrap = useRef(null);
  const drag = useRef(null);

  // Se achica para que entre en el ancho disponible (en celular, ~0,55).
  useEffect(() => {
    const el = wrap.current;
    if (!el) return undefined;
    const fit = () => setScale(Math.min(1, el.clientWidth / WORLD.w));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (!sectores.length) return null;
  const tilt = TILT[mode];
  const selected = sectores.find((s) => s.id === pick.id);

  const select = (id, level = null) => {
    const s = sectores.find((x) => x.id === id);
    setPick({ id, level });
    setRot((r) => nearestAngle(r, viewFrom(s.lado)));
  };
  const onPick = (id, level) => {
    if (drag.current?.moved) return; // fue un arrastre, no un toque
    select(id, level);
  };
  const down = (e) => {
    drag.current = { x: e.clientX, rot, moved: false };
  };
  const move = (e) => {
    const d = drag.current;
    if (!d || !e.buttons) return;
    const dx = e.clientX - d.x;
    if (!d.moved && Math.abs(dx) > 4) {
      d.moved = true;
      setDragging(true);
    }
    if (d.moved) setRot(d.rot - dx * 0.5);
  };
  const up = () => {
    setDragging(false);
    // El click llega después del pointerup: se limpia en el próximo cuadro.
    requestAnimationFrame(() => {
      drag.current = null;
    });
  };
  const front = sideInFront(rot);

  return (
    <div className="st3d">
      <div className="st3d-main">
        <div
          className={`st3d-view${dragging ? ' is-dragging' : ''}`} ref={wrap} style={{ height: (WORLD.h - 10) * scale }}
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
          role="img" aria-label={`Esquema en 3D del estadio José Amalfitani, visto desde la ${front ? `tribuna ${LADO[front].toLowerCase()}` : 'esquina'}.`}
        >
          <div className="st3d-stage" style={{ transform: `scale(${scale})`, width: WORLD.w, height: WORLD.h - 10, '--inv': Math.min(1.6, 1 / scale) }}>
            <div className="st3d-camera">
              <div className="st3d-scene" style={{ width: WORLD.w, height: WORLD.h, transform: `rotateX(${tilt}deg) rotateZ(${rot}deg)` }}>
                <div className="st3d-ground" />
                <div className="st3d-pitch" style={{ width: PITCH.w, height: PITCH.h, left: (WORLD.w - PITCH.w) / 2, top: (WORLD.h - PITCH.h) / 2 }}>
                  <i className="st3d-line st3d-half" /><i className="st3d-line st3d-circle" />
                  <i className="st3d-line st3d-area st3d-area-w" /><i className="st3d-line st3d-area st3d-area-e" />
                </div>
                <div className="st3d-center">
                  {sectores.map((s) => (
                    <div key={s.id} className="st3d-stand" style={{ transform: `rotateZ(${SIDE_ANGLE[s.lado]}deg)` }}>
                      {s.niveles.slice(0, 3).map((l, i) => <Tier key={l.nombre} s={s} i={i} n={Math.min(3, s.niveles.length)} selected={s.id === pick.id} level={pick.level} onPick={onPick} />)}
                    </div>
                  ))}
                  {[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => <Tower key={`${sx}${sy}`} x={sx * TOWER.dx} y={sy * TOWER.dy} />)}
                  {COMPASS.map(([c, lado]) => (
                    <span key={c} className="st3d-compass" style={{ transform: `translate(${DIR[lado][0] * 236}px, ${DIR[lado][1] * 226}px)` }}>{c}</span>
                  ))}
                  {sectores.map((s) => {
                    const [dx, dy] = DIR[s.lado];
                    // Sobre el medio de la tribuna: afuera, en el celular, quedaba cortado por los bordes.
                    const r = HALF[s.lado][1] + GAP + DEPTH(s.niveles.length) / 2;
                    return (
                      <Label key={s.id} x={dx * r} y={dy * r} z={104} rot={rot} tilt={tilt} className={s.id === pick.id ? 'is-on' : ''}>
                        {s.nombre.replace(/ «.*»/, '')}
                      </Label>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="st3d-controls">
          <button type="button" className="btn btn-outline" onClick={() => setRot((r) => r - 90)} aria-label="Girar el estadio a la izquierda">⟲ Girar</button>
          <button type="button" className="btn btn-outline" onClick={() => setRot((r) => r + 90)} aria-label="Girar el estadio a la derecha">Girar ⟳</button>
          <button type="button" className="btn btn-outline" aria-pressed={mode === 'tribuna'} onClick={() => setMode((m) => (m === 'tribuna' ? 'normal' : 'tribuna'))}>Vista desde la tribuna</button>
          <button type="button" className="btn btn-outline" aria-pressed={mode === 'arriba'} onClick={() => setMode((m) => (m === 'arriba' ? 'normal' : 'arriba'))}>Desde arriba</button>
        </div>
        <p className="muted small">Arrastrá para girarlo. Al elegir una tribuna, el estadio gira para mostrar la cancha desde ahí. Es un esquema: las proporciones son aproximadas.</p>
      </div>
      <div className="st3d-side">
        <div className="segmented" role="group" aria-label="Elegir tribuna">
          {sectores.map((s) => (
            <button key={s.id} type="button" className="seg" aria-pressed={s.id === pick.id} onClick={() => select(s.id)}>{s.nombre.replace(/ «.*»/, '')}</button>
          ))}
        </div>
        <div className="card st3d-info" aria-live="polite">
          <Info s={selected} level={pick.level} general={selected ? null : tribunas.general} />
        </div>
        {tribunas.borrador && <p className="st3d-draft"><b>Borrador.</b> Datos sacados de búsquedas, todavía sin confirmar en la cancha. Las puertas cambian según el partido: confirmalas en las redes del club.</p>}
        <p className="muted small">{tribunas.fuente}</p>
      </div>
    </div>
  );
}

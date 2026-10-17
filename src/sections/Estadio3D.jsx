// El Amalfitani en 3D (Club › Estadio): se gira y se acerca con el dedo o el mouse, se puede ver desde cada tribuna,
// desde arriba y de noche con las torres LED encendidas, y con la línea de tiempo se ve cómo era en cada época
// (Villa Luro, 1951, los 70, el Mundial 78 y hoy). La escena (Three.js) está en estadio-scene.js y se baja
// recién cuando la sección está por aparecer: el resto del sitio no la carga. Los sectores salen de
// data/club.json (estadio.tribunas); las medidas, de lib/stadium.js.
import { useEffect, useRef, useState } from 'react';
import { sectorCapacity } from '../lib/stadium.js';

const fmtN = (n) => n.toLocaleString('es-AR');
const shortName = (s) => s.nombre.replace(/ «.*»/, '');

function Info({ s, level, general }) {
  if (!s) {
    return (
      <>
        <p className="muted">Tocá una tribuna (en el estadio o en los botones) para ver quién entra, por qué puerta y cómo se ve la cancha desde ahí.</p>
        {general?.length > 0 && <ul className="st3d-general">{general.map((t) => <li key={t}>{t}</li>)}</ul>}
      </>
    );
  }
  return (
    <>
      <p className="kicker">{s.tipo} · lado {s.lado}</p>
      <h3 className="h3 st3d-name">{s.nombre}</h3>
      <p>{s.texto}</p>
      <dl className="st3d-levels">
        {s.niveles.map((l, i) => (
          <div key={l.nombre} className={i === level ? 'is-level' : undefined}>
            <dt>{s.niveles.length > 1 ? `Platea ${l.nombre.toLowerCase()}` : l.nombre}</dt>
            <dd>
              <b className="num">{fmtN(l.capacidad)}</b> lugares
              {l.puertas && <> · {/[ ,y]/.test(l.puertas) ? 'puertas' : 'puerta'} {l.puertas}</>}
              {l.nota && <small> · {l.nota}</small>}
            </dd>
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
    </>
  );
}

/** `tribunas` = club.json › estadio.tribunas; `epocas` = club.json › estadio.epocas (línea de tiempo). */
export function Estadio3D({ tribunas, epocas = [] }) {
  const sectores = tribunas?.sectores ?? [];
  const box = useRef(null);
  const api = useRef(null);
  const [status, setStatus] = useState('idle'); // idle | loading | ready | error
  const [pick, setPick] = useState({ id: null, level: null });
  const [mode, setMode] = useState('general');
  const [night, setNight] = useState(false);
  const [spin, setSpin] = useState(false);
  const [era, setEra] = useState('hoy');
  const scene = useRef(null); // el módulo de la escena, una vez cargado
  const nightRef = useRef(false);
  nightRef.current = night;

  /** Arma la escena de una época, desde donde está mirando la cámara. */
  function build(eraId, start) {
    api.current?.dispose();
    api.current = scene.current.createStadium(box.current, {
      sectores,
      era: eraId,
      start,
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      onPick: (id, level) => select(id, level),
    });
    if (nightRef.current) api.current.setNight(true);
  }

  function select(id, level = null, view = 'general') {
    setPick({ id, level });
    setSpin(false);
    setMode(view);
    api.current?.setAutoRotate(false);
    api.current?.select(id, level, view);
  }

  // Se carga cuando la sección está cerca de la pantalla (Three.js pesa ~150 KB comprimido).
  useEffect(() => {
    const el = box.current;
    if (!el || !sectores.length) return undefined;
    let alive = true;
    const io = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      io.disconnect();
      setStatus('loading');
      import('./estadio-scene.js')
        .then((mod) => {
          if (!alive) return;
          const probe = document.createElement('canvas');
          if (!(probe.getContext('webgl2') || probe.getContext('webgl'))) throw new Error('Sin WebGL');
          scene.current = mod;
          build('hoy');
          setStatus('ready');
        })
        .catch((err) => {
          console.warn('No se pudo mostrar el estadio en 3D:', err);
          if (alive) setStatus('error');
        });
    }, { rootMargin: '300px' });
    io.observe(el);
    return () => {
      alive = false;
      io.disconnect();
      api.current?.dispose();
      api.current = null;
    };
    // Los sectores vienen de club.json y no cambian mientras la página está abierta.
  }, []);

  if (!sectores.length) return null;
  const selected = era === 'hoy' ? sectores.find((s) => s.id === pick.id) : null;
  const epoca = epocas.find((x) => x.id === era);
  const changeEra = (id) => {
    if (id === era) return;
    setEra(id);
    setSpin(false);
    setPick({ id: null, level: null });
    if (scene.current) build(id, api.current?.getCamera());
  };
  const setView = (m) => {
    setMode(m);
    setSpin(false);
    if (m === 'tribuna' && !selected) {
      select(sectores.find((s) => s.lado === 'sur')?.id ?? sectores[0].id, null, 'tribuna');
      return;
    }
    api.current?.view(m, selected?.lado);
  };

  return (
    <div className="st3d">
      <div className="st3d-main">
        <div className="st3d-view" ref={box} role="img" aria-label="El estadio José Amalfitani en 3D. Se puede girar y acercar; las tribunas se eligen con los botones de al lado.">
          {status !== 'ready' && (
            <p className="st3d-status">
              {status === 'error' ? 'Tu navegador no puede mostrar el estadio en 3D. La información de cada tribuna está acá al lado.' : 'Cargando el estadio…'}
            </p>
          )}
        </div>
        {epocas.length > 1 && (
          <div className="st3d-eras">
            <p className="kicker">Línea de tiempo</p>
            <div className="segmented" role="group" aria-label="Época del estadio">
              {epocas.map((x) => <button key={x.id} type="button" className="seg" aria-pressed={x.id === era} onClick={() => changeEra(x.id)}>{x.etiqueta}</button>)}
            </div>
          </div>
        )}
        <div className="st3d-controls" role="group" aria-label="Vista del estadio">
          <button type="button" className="btn btn-outline" aria-pressed={mode === 'general'} onClick={() => setView('general')}>Vista general</button>
          <button type="button" className="btn btn-outline" aria-pressed={mode === 'tribuna'} onClick={() => setView('tribuna')}>Desde la tribuna</button>
          <button type="button" className="btn btn-outline" aria-pressed={mode === 'arriba'} onClick={() => setView('arriba')}>Desde arriba</button>
          <button type="button" className="btn btn-outline" aria-pressed={spin} onClick={() => { setSpin(!spin); api.current?.setAutoRotate(!spin); }}>Girar solo</button>
          <button type="button" className="btn btn-outline" aria-pressed={night} onClick={() => { setNight(!night); api.current?.setNight(!night); }}>De noche</button>
        </div>
        <p className="muted small">Arrastrá para girarlo y usá la ruedita o dos dedos para acercarte. Modelo aproximado hecho a partir de una foto aérea: las alturas son estimadas.</p>
      </div>
      <div className="st3d-side">
        {epoca && era !== 'hoy' && (
          <div className="card st3d-era" aria-live="polite">
            <p className="kicker">{epoca.etiqueta} · {epoca.lugar}</p>
            <h3 className="h3 st3d-name">{epoca.titulo}</h3>
            <p>{epoca.texto}</p>
            <p className="muted small">Forma aproximada, según fotos aéreas de la época. Las tribunas y puertas de abajo son las de hoy.</p>
            <button type="button" className="btn btn-outline" onClick={() => changeEra('hoy')}>Volver al estadio de hoy</button>
          </div>
        )}
        <div className="segmented" role="group" aria-label="Elegir tribuna">
          {sectores.map((s) => (
            <button key={s.id} type="button" className="seg" aria-pressed={s.id === pick.id} onClick={() => { if (era !== 'hoy') changeEra('hoy'); select(s.id, null, mode === 'tribuna' ? 'tribuna' : 'general'); }}>{shortName(s)}</button>
          ))}
        </div>
        <div className="card st3d-info" aria-live="polite">
          <Info s={selected} level={pick.level} general={tribunas.general} />
        </div>
        {tribunas.borrador && <p className="st3d-draft"><b>Borrador.</b> Datos todavía sin confirmar en la cancha. Las puertas cambian según el partido: confirmalas en las redes del club.</p>}
        <p className="muted small">{tribunas.fuente}</p>
      </div>
    </div>
  );
}

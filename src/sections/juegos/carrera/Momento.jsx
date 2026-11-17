// Una jugada del partido: elegir qué hacer (adónde patear, tocando el arco, o qué pase dar) y frenar la barra en la
// zona verde. La barra se mueve con CSS; la posición al tocar sale del tiempo de la animación (no de lo dibujado),
// así un cuadro perdido no cambia el resultado. Al frenar, la raya queda quieta y aparece el veredicto un instante.
// Con «reducir movimiento» no hay barra: la ejecución sale del azar.
import { useEffect, useRef, useState } from 'react';
import { DRIBBLES, PASSES, TACKLES, isPenalty, kindText, markerAt, quality, tellText } from '../../../lib/carrera/match.js';
import { buzz } from '../shared.jsx';
import { Arco, Cancha, Duelo, Quite } from './Escena.jsx';

const calm = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const AIM_LABEL = { izq: 'al palo izquierdo', medio: 'al medio', der: 'al palo derecho' };
const FREE_LABEL = { izq: 'por encima de la barrera', medio: 'al medio', der: 'al palo del arquero' };
const DIVE_LABEL = { izq: 'a la izquierda', medio: 'te quedás en el medio', der: 'a la derecha' };

/** Estrellas de la ejecución (0 a 3), como en los juegos de jugadas: se ven al frenar la barra y en el resultado. */
export const starsOf = (q) => (q >= 0.9 ? 3 : q >= 0.5 ? 2 : q >= 0.25 ? 1 : 0);

export function Stars({ q }) {
  const n = starsOf(q);
  return (
    <span className={`cr-stars is-${n}`} aria-label={`${n} de 3 estrellas`}>
      {[0, 1, 2].map((i) => <i key={i} className={i < n ? 'is-on' : undefined} style={{ '--i': i }} aria-hidden="true">★</i>)}
    </span>
  );
}

/** Veredicto de la ejecución (lo que se ve al frenar la barra). */
export function verdict(q) {
  if (q >= 0.9) return ['¡Perfecto!', 'is-perfect'];
  if (q >= 0.7) return ['Muy bien', 'is-good'];
  if (q >= 0.5) return ['Bien', 'is-good'];
  if (q >= 0.25) return ['Justo', 'is-meh'];
  return ['Mal', 'is-bad'];
}

function Bar({ moment, onStop }) {
  const marker = useRef(null);
  const start = useRef(0);
  const button = useRef(null);
  const timer = useRef(null);
  const [stopped, setStopped] = useState(null); // { x, q }
  useEffect(() => {
    start.current = performance.now();
    button.current?.focus();
    return () => clearTimeout(timer.current);
  }, []);
  const stop = () => {
    if (stopped) return;
    const anim = marker.current?.getAnimations?.()[0];
    const ms = anim?.currentTime != null ? Number(anim.currentTime) : performance.now() - start.current;
    const x = markerAt(ms, moment.sweep);
    const q = quality(x, moment.center, moment.width);
    setStopped({ x, q });
    buzz(q >= 0.5);
    timer.current = setTimeout(() => onStop(x), 700);
  };
  const left = Math.max(0, moment.center - moment.width);
  const right = Math.min(1, moment.center + moment.width);
  const [word, cls] = stopped ? verdict(stopped.q) : [];
  return (
    <div className="cr-timing">
      <div className={`cr-bar${stopped ? ` is-stopped ${cls}` : ''}`} aria-hidden="true">
        <span className="cr-ticks" />
        <span className="cr-zone" style={{ left: `${left * 100}%`, width: `${(right - left) * 100}%` }} />
        <span className="cr-sweet" style={{ left: `${moment.center * 100}%` }} />
        <i ref={marker} className="cr-marker" style={stopped ? { left: `${stopped.x * 100}%`, animation: 'none' } : { animationDuration: `${moment.sweep}ms` }} />
      </div>
      {stopped
        ? <p className={`cr-verdict ${cls}`} role="status">{word} <Stars q={stopped.q} /></p>
        : <button ref={button} type="button" className="btn btn-solid cr-now" onClick={stop}>¡Ahora!</button>}
      {!stopped && <p className="muted small">Tocá (o apretá Enter) cuando la raya pase por la zona verde: cuanto más al centro, mejor.</p>}
    </div>
  );
}

// Lo que se elige en cada tipo de jugada con botones (remates y atajadas se eligen tocando el arco).
const OPTIONS = { pase: PASSES, gambeta: DRIBBLES, quite: TACKLES };
const ASK = { pase: '¿Qué pase das?', gambeta: '¿Cómo lo encarás?', quite: '¿Cómo lo marcás?' };
const DOING = { pase: 'Pase', gambeta: 'Gambeta', quite: 'Marca', atajada: 'Te tirás', remate: 'Remate', penal: 'Remate' };

export function Momento({ moment, onAnswer, tip = null }) {
  const [choice, setChoice] = useState(null);
  const [preview, setPreview] = useState(null);
  const options = OPTIONS[moment.type] ?? null;
  const save = moment.type === 'atajada';
  const tell = tellText(moment);
  const pick = (key) => {
    if (calm()) onAnswer({ choice: key, x: null });
    else setChoice(key);
  };
  const scene = moment.type === 'pase' ? <Cancha choice={choice} preview={preview} />
    : moment.type === 'gambeta' ? <Duelo choice={choice} preview={preview} />
      : moment.type === 'quite' ? <Quite choice={choice} preview={preview} />
        : <Arco onAim={choice ? null : pick} choice={choice} mine={save} free={moment.kind === 'libre'} />;
  return (
    <div className={`card cr-moment${isPenalty(moment) ? ' is-penal' : ''}${moment.from ? ' is-chain' : ''}${save || moment.type === 'quite' ? ' is-defense' : ''}`}>
      <p className="kicker">{isPenalty(moment) ? 'Definición por penales' : `Minuto ${moment.min}'`}{save || moment.type === 'quite' ? ' · Te atacan' : ''}</p>
      <h3 className="cr-moment-text">{kindText(moment)}</h3>
      {tip && <p className="cr-coach"><span aria-hidden="true">🧑‍🏫</span> <b>El DT te dice:</b> {tip}</p>}
      {tell && <p className="cr-tell"><span aria-hidden="true">👀</span> {tell}</p>}
      {scene}
      {!choice && options && <p className="muted small">{ASK[moment.type]}</p>}
      {!choice && (options ? (
        <div className="cr-options is-pass">
          {options.map((o) => (
            <button
              key={o.key} type="button" className="cr-opt" onClick={() => pick(o.key)}
              onMouseEnter={() => setPreview(o.key)} onFocus={() => setPreview(o.key)} onMouseLeave={() => setPreview(null)} onBlur={() => setPreview(null)}
            >
              <b>{o.label}</b>
              <small>{o.hint}</small>
            </button>
          ))}
        </div>
      ) : <p className="muted small">{save ? 'Tocá el arco: elegí adónde te tirás.' : 'Tocá el arco: elegí adónde le pegás.'}</p>)}
      {choice && (
        <>
          <p className="small"><b>{DOING[moment.type]}:</b> {options ? options.find((o) => o.key === choice)?.label : save ? DIVE_LABEL[choice] : moment.kind === 'libre' ? FREE_LABEL[choice] : AIM_LABEL[choice]}</p>
          <Bar moment={moment} onStop={(x) => onAnswer({ choice, x })} />
        </>
      )}
    </div>
  );
}

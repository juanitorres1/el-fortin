// Las escenas de las jugadas, dibujadas en SVG: el arco visto desde el punto del penal (remates y penales) y la
// cancha vista de arriba (pases). Antes de jugar sirven para elegir; después muestran qué pasó: la pelota viaja con
// CSS, con su sombra en el pasto, y el arquero se tira. Con «reducir movimiento» todo aparece directo donde terminó
// (styles.css). Colores y formas genéricos: ni el arquero ni los rivales copian una camiseta real.
import { useId } from 'react';
import { AIMS, PASSES } from '../../../lib/carrera/match.js';

const cleanId = (id) => `cr${id.replace(/[^a-zA-Z0-9]/g, '')}`;

/** Franjas de pasto: más angostas al fondo para que el arco tenga profundidad. */
const BANDS = [42, 50, 59, 70, 83, 98, 116, 137, 161, 180];

// ---------- Arco ----------

const BALL0 = [160, 166]; // punto del penal
const AIM_SHORT = { izq: 'Izquierda', medio: 'Al medio', der: 'Derecha' };
const AIM_FREE = { izq: 'Por arriba', medio: 'Al medio', der: 'Al palo' };
const AIM_FREE_LONG = { izq: 'Por encima de la barrera', medio: 'Al medio', der: 'Al palo del arquero' };
const WALL = [86, 106, 126, 146]; // la barrera tapa el palo izquierdo
export const AIM_SPOTS = { izq: [92, 84], medio: [160, 78], der: [228, 84] };

/** Dónde termina la pelota según qué pasó (coordenadas del SVG). `kind` sale de lib/carrera/match.js › outcomeKind. */
export function shotTarget({ aim, kind }) {
  const side = aim === 'izq' ? -1 : aim === 'der' ? 1 : 0;
  if (kind === 'gol') return side ? [160 + side * 96, 68] : [160, 66];
  if (kind === 'mal') return [160 + side * 100, 16]; // a la tribuna
  if (kind === 'atajada') return side ? [160 + side * 70, 92] : [160, 70]; // en las manos del arquero
  if (kind === 'barrera') return [118, 112]; // pega en la barrera
  if (kind === 'pie') return [160 + side * 34, 126]; // la saca con el pie, tirado para el otro lado
  if (kind === 'palo') return side ? [160 + side * 106, 96] : [160, 58]; // palo o travesaño
  return side ? [160 + side * 128, 72] : [160, 44]; // apenas afuera
}

const CROWD = [7, 14, 21].flatMap((y, row) => Array.from({ length: 33 }, (_, i) => ({
  x: 4 + i * 9.75 + (row % 2) * 4.5, y, k: `${row}-${i}`, b: (i + row) % 3 !== 0, d: ((i * 7 + row * 3) % 10) * 0.04,
})));

/** El arquero, parado sobre (0, 0) = sus pies. Genérico: buzo amarillo, guantes verdes. */
function Keeper({ dive, mine }) {
  return (
    <g className={`cr-keeper${dive ? ` dive-${dive}` : ''}${mine ? ' is-you' : ''}`}>
      <rect className="cr-k-sock" x="-10" y="-17" width="6" height="15" rx="2" />
      <rect className="cr-k-sock" x="4" y="-17" width="6" height="15" rx="2" />
      <rect className="cr-k-boot" x="-12" y="-3.5" width="9" height="4" rx="2" />
      <rect className="cr-k-boot" x="3" y="-3.5" width="9" height="4" rx="2" />
      <path className="cr-k-shorts" d="M-12 -28H12L11 -16H2L0 -20L-2 -16H-11Z" />
      <path className="cr-k-arm" d="M-11 -45L-25 -59M11 -45L25 -59" />
      <path className="cr-k-shirt" d="M-13 -48Q0 -52 13 -48L12 -26H-12Z" />
      <rect className="cr-k-stripe" x="-12.6" y="-41" width="25.2" height="3" />
      <circle className="cr-k-glove" cx="-27" cy="-61" r="5" />
      <circle className="cr-k-glove" cx="27" cy="-61" r="5" />
      <circle className="cr-k-skin" cx="0" cy="-56" r="7.5" />
      <path className="cr-k-hair" d="M-7.6 -56.5A7.6 7.6 0 0 1 7.6 -56.5Q0 -60 -7.6 -56.5Z" />
    </g>
  );
}

/**
 * El que patea, de espaldas y cerca de la cámara (cuando el arquero es el jugador). Genérico: camiseta oscura sin
 * escudo ni número. (0, 0) = debajo del borde de la escena; se ve de la cintura para arriba.
 */
function Shooter({ kicked }) {
  return (
    <g className={`cr-shooter${kicked ? ' is-kicked' : ''}`}>
      <path className="cr-sh-arm" d="M-17 -44L-30 -22M17 -44L28 -24" />
      <path className="cr-sh-shirt" d="M-19 -48Q0 -55 19 -48L17 -8H-17Z" />
      <path className="cr-sh-shorts" d="M-17 -10H17L18 4H-18Z" />
      <circle className="cr-sh-skin" cx="0" cy="-60" r="10" />
      <path className="cr-sh-hair" d="M-10 -60A10 10 0 0 1 10 -60Q10 -51 0 -52Q-10 -51 -10 -60Z" />
    </g>
  );
}

/** La pelota (con gajos) centrada en (0, 0). */
const Ball = ({ r = 7 }) => (
  <>
    <circle r={r} className="cr-ball-skin" />
    <path className="cr-ball-patch" d={`M0 ${-r * 0.42}L${r * 0.4} ${-r * 0.13}L${r * 0.25} ${r * 0.34}H${-r * 0.25}L${-r * 0.4} ${-r * 0.13}Z`} />
    <path className="cr-ball-seam" d={`M0 ${-r * 0.42}V${-r}M${r * 0.4} ${-r * 0.13}L${r * 0.93} ${-r * 0.32}M${r * 0.25} ${r * 0.34}L${r * 0.58} ${r * 0.8}M${-r * 0.25} ${r * 0.34}L${-r * 0.58} ${r * 0.8}M${-r * 0.4} ${-r * 0.13}L${-r * 0.93} ${-r * 0.32}`} />
  </>
);

/**
 * `onAim(key)` mientras se elige (las tres partes del arco son botones); `choice` = lo elegido; `result` = cómo salió
 * ({ aim, keeper, kind }). Con `mine` el arquero es el jugador: le patean y elige adónde tirarse.
 */
export function Arco({ onAim, choice, result, mine = false, free = false }) {
  const id = cleanId(useId());
  const target = result ? shotTarget(result) : null;
  const ballStyle = target ? { '--bx': target[0] - BALL0[0], '--by': target[1] - BALL0[1] } : undefined;
  const shadowStyle = target ? { '--sx': target[0] - BALL0[0], '--sy': Math.min(target[1] + 40, 137) - (BALL0[1] + 6) } : undefined;
  const state = result ? ` is-${result.kind}${result.kind === 'gol' ? ' is-goal' : ' is-miss'}` : '';
  return (
    <div className={`cr-pitch cr-arco${state}${mine ? ' is-mine' : ''}`}>
      <svg viewBox="0 0 320 180" aria-hidden="true" focusable="false">
        <defs>
          <pattern id={`${id}n`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <path d="M0 0H6M0 0V6" className="cr-mesh" />
          </pattern>
          <linearGradient id={`${id}p`} x1="0" x2="1">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="1" stopColor="#cfd6df" />
          </linearGradient>
          <radialGradient id={`${id}v`} cx="0.5" cy="0.6" r="0.8">
            <stop offset="0.55" stopColor="#000" stopOpacity="0" />
            <stop offset="1" stopColor="#000" stopOpacity="0.35" />
          </radialGradient>
        </defs>
        {/* Tribuna, hinchada y cartel */}
        <rect className="cr-stand" x="0" y="0" width="320" height="44" />
        <g className="cr-crowd">
          {CROWD.map((c) => <circle key={c.k} cx={c.x} cy={c.y} r="3.2" className={c.b ? 'is-b' : 'is-w'} style={{ '--d': `${c.d}s` }} />)}
        </g>
        <rect className="cr-board" x="0" y="27" width="320" height="16" />
        <text className="cr-board-text" x="160" y="39" textAnchor="middle">VÉLEZ SARSFIELD</text>
        {/* Pasto en perspectiva y líneas */}
        {BANDS.slice(0, -1).map((y, i) => <rect key={y} className={i % 2 ? 'cr-g2' : 'cr-g1'} x="0" y={y} width="320" height={BANDS[i + 1] - y} />)}
        <path className="cr-chalk" d="M0 136.5H320M38 136.5L22 156H298L282 136.5" />
        <circle className="cr-chalk-dot" cx="160" cy="171" r="1.8" />
        {/* Arco: sombra, red (fondo, costados y techo) y palos */}
        <path className="cr-goal-shadow" d="M50 137H270L284 141H64Z" />
        <g className="cr-net">
          <rect x="74" y="66" width="172" height="62" fill={`url(#${id}n)`} className="cr-net-back" />
          <path d="M52 56L74 66V128L52 137Z" fill={`url(#${id}n)`} className="cr-net-side" />
          <path d="M268 56L246 66V128L268 137Z" fill={`url(#${id}n)`} className="cr-net-side" />
          <path d="M52 56H268L246 66H74Z" fill={`url(#${id}n)`} className="cr-net-top" />
          <path className="cr-net-frame" d="M74 66H246V128H74ZM52 56L74 66M268 56L246 66M52 137L74 128M268 137L246 128" />
        </g>
        {!result && Object.entries(AIM_SPOTS).map(([key, [x, y]]) => (
          <g key={key} className={`cr-target${choice === key ? ' is-on' : choice ? ' is-off' : ''}`} transform={`translate(${x} ${y})`}>
            <circle r="15" /><circle r="9" /><circle r="3" className="cr-target-dot" />
          </g>
        ))}
        <ellipse className="cr-k-shadow" cx="160" cy="137" rx="19" ry="3.5" />
        <g transform="translate(160 136.5)" className={mine && choice && !result ? `cr-lean is-${choice}` : undefined}><Keeper dive={result?.keeper} mine={mine} /></g>
        {free && (
          <g className={`cr-wall${result ? ' is-jump' : ''}`}>
            {WALL.map((x) => (
              <g key={x} transform={`translate(${x} 158) scale(1.35)`}>
                <ellipse className="cr-k-shadow" cx="0" cy="0" rx="9" ry="2.4" />
                <path className="cr-wall-body" d="M-7.5 0V-20H7.5V0ZM-8.5 -20Q0 -46 8.5 -20Z" />
                <circle className="cr-wall-head" cx="0" cy="-41" r="5.5" />
              </g>
            ))}
          </g>
        )}
        <g className="cr-goal-posts">
          <rect x="47" y="52" width="9" height="86" rx="2" fill={`url(#${id}p)`} />
          <rect x="264" y="52" width="9" height="86" rx="2" fill={`url(#${id}p)`} />
          <rect x="47" y="51" width="226" height="8" rx="2" fill={`url(#${id}p)`} />
        </g>
        <rect width="320" height="180" fill={`url(#${id}v)`} pointerEvents="none" />
        {mine && !result && <Tag at={[160, 64]} text="Vos" on />}
        {/* Pelota, su sombra y la estela */}
        <g transform={`translate(${BALL0[0]} ${BALL0[1] + 6})`}>
          <ellipse className={`cr-ball-shadow${result ? ' is-shot' : ''}`} rx="7.5" ry="2.2" style={shadowStyle} />
        </g>
        {target && <line className="cr-trail" x1={BALL0[0]} y1={BALL0[1]} x2={target[0]} y2={target[1]} pathLength="1" />}
        <g transform={`translate(${BALL0[0]} ${BALL0[1]})`}>
          <g className={`cr-ball${result ? ' is-shot' : ''}`} style={ballStyle}><Ball r={7.5} /></g>
        </g>
        {mine && <g transform="translate(128 192)"><Shooter kicked={!!result} /></g>}
      </svg>
      {onAim && (
        <div className="cr-aims">
          {AIMS.map((a) => (
            <button key={a.key} type="button" className="cr-aim" aria-label={mine ? `Tirarte ${a.short}` : free ? AIM_FREE_LONG[a.key] : a.label} onClick={() => onAim(a.key)}>
              <span aria-hidden="true">{(free ? AIM_FREE : AIM_SHORT)[a.key]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- Cancha (pases) ----------

const YOU = [62, 96];
const BALL_P = [72, 101]; // la pelota, al pie del jugador
const GOAL = [316, 90];
const PASS_SPOTS = {
  corto: { mate: [140, 142], cut: [106, 121], tag: [140, 162], label: 'Corto' },
  centro: { mate: [284, 70], cut: [208, 83], tag: [284, 50], label: 'Centro' },
  filtrado: { mate: [262, 114], cut: [224, 109], tag: [262, 134], label: 'Filtrado' },
};
const RIVALS = [[106, 129], [208, 74], [224, 118], [176, 46], [248, 154], [292, 98], [150, 92]];

/** Un punto de `a` a `b`, `d` unidades antes de llegar (para que la flecha no tape al compañero). */
function short(a, b, d) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  return [b[0] - ((b[0] - a[0]) / len) * d, b[1] - ((b[1] - a[1]) / len) * d];
}

/** Un jugador visto de arriba: los de Vélez, blancos con la V azul; los rivales, oscuros. */
function Token({ at, kind, cls = '' }) {
  return (
    <g transform={`translate(${at[0]} ${at[1]})`} className={`cr-token is-${kind}${cls}`}>
      <ellipse className="cr-token-shadow" cx="1.5" cy="2.5" rx="8.5" ry="6" />
      {kind === 'you' && <circle r="12.5" className="cr-token-ring" />}
      <circle r="8.5" className="cr-token-body" />
      {kind !== 'rival' && <path className="cr-token-v" d="M-4.6 -3.4L0 3.6L4.6 -3.4" />}
    </g>
  );
}

/** Etiqueta en una píldora (11,5 de alto: con la escena a 340 px de ancho queda en 12 px). */
const Tag = ({ at, text, on }) => (
  <g transform={`translate(${at[0]} ${at[1]})`} className={`cr-tag-svg${on ? ' is-on' : ''}`}>
    <rect x={-text.length * 3.6 - 6} y="-9.5" width={text.length * 7.2 + 12} height="17" rx="8.5" />
    <text y="3.6" textAnchor="middle">{text}</text>
  </g>
);

/** `choice` = pase elegido; `preview` = el que se está mirando antes de elegir; `result` = { ok, assist }. */
export function Cancha({ choice, preview, result }) {
  const id = cleanId(useId());
  const shown = choice ?? preview;
  const spot = choice ? PASS_SPOTS[choice] : null;
  const end = result && spot ? (result.ok ? spot.mate : spot.cut) : null;
  let style;
  if (end) {
    const fin = result.assist ? GOAL : end;
    style = { '--x1': end[0] - BALL_P[0], '--y1': end[1] - BALL_P[1], '--x2': fin[0] - BALL_P[0], '--y2': fin[1] - BALL_P[1] };
  }
  const state = result ? (result.assist ? ' is-goal' : result.ok ? ' is-ok' : ' is-miss') : '';
  const moving = `${result ? ' is-pass' : ''}${result?.assist ? ' is-two' : ''}`;
  return (
    <div className={`cr-pitch cr-cancha${state}`}>
      <svg viewBox="0 0 320 180" aria-hidden="true" focusable="false">
        <defs>
          <pattern id={`${id}n`} width="3" height="3" patternUnits="userSpaceOnUse"><path d="M0 0H3M0 0V3" className="cr-mesh" /></pattern>
          <marker id={`${id}a`} viewBox="0 0 8 8" refX="6" refY="4" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M0 0L8 4L0 8Z" className="cr-arrow-head" />
          </marker>
          <radialGradient id={`${id}v`} cx="0.5" cy="0.5" r="0.75">
            <stop offset="0.6" stopColor="#000" stopOpacity="0" />
            <stop offset="1" stopColor="#000" stopOpacity="0.3" />
          </radialGradient>
        </defs>
        {Array.from({ length: 10 }, (_, i) => <rect key={i} className={i % 2 ? 'cr-g2' : 'cr-g1'} x={i * 32} y="0" width="32" height="180" />)}
        <g className="cr-chalk">
          <rect x="4" y="6" width="312" height="168" />
          <path d="M4 60A30 30 0 0 1 4 120" />
          <rect x="246" y="38" width="70" height="104" />
          <rect x="292" y="66" width="24" height="48" />
          <path d="M246 72A22 22 0 0 0 246 108" />
        </g>
        <circle className="cr-chalk-dot" cx="272" cy="90" r="1.8" />
        <rect className="cr-goalmouth" x="316" y="76" width="4" height="28" fill={`url(#${id}n)`} />
        {Object.entries(PASS_SPOTS).map(([key, s]) => {
          const [x2, y2] = short(BALL_P, s.mate, 11);
          return (
            <line
              key={key} x1={BALL_P[0]} y1={BALL_P[1]} x2={x2} y2={y2} markerEnd={`url(#${id}a)`}
              className={`cr-path${shown === key ? ' is-on' : ''}${choice && choice !== key ? ' is-off' : ''}`}
            />
          );
        })}
        {RIVALS.map((r) => <Token key={`${r[0]}-${r[1]}`} at={r} kind="rival" />)}
        {Object.entries(PASS_SPOTS).map(([key, s]) => (
          <Token key={key} at={s.mate} kind="mate" cls={`${shown === key ? ' is-on' : ''}${result?.ok && choice === key ? ' is-got' : ''}`} />
        ))}
        <Token at={YOU} kind="you" />
        {!result && Object.entries(PASS_SPOTS).map(([key, s]) => <Tag key={key} at={s.tag} text={s.label} on={shown === key} />)}
        <Tag at={[YOU[0], YOU[1] - 23]} text="Vos" on />
        {result && !result.ok && spot && <g transform={`translate(${spot.cut[0]} ${spot.cut[1]})`}><path className="cr-cut" d="M-6 -6L6 6M6 -6L-6 6" /></g>}
        <rect width="320" height="180" fill={`url(#${id}v)`} pointerEvents="none" />
        <g transform={`translate(${BALL_P[0] + 1.5} ${BALL_P[1] + 3})`}>
          <ellipse className={`cr-ball-shadow${moving}`} rx="5" ry="2.5" style={style} />
        </g>
        {end && <line className="cr-trail" x1={BALL_P[0]} y1={BALL_P[1]} x2={end[0]} y2={end[1]} pathLength="1" />}
        <g transform={`translate(${BALL_P[0]} ${BALL_P[1]})`}>
          <g className={`cr-ball${moving}`} style={style}><Ball r={5} /></g>
        </g>
      </svg>
    </div>
  );
}

// ---------- Duelo (gambeta) ----------

const RUNNER = [70, 98];
const DEFENDER = [172, 98];
const DUEL = {
  afuera: { via: [170, 46], end: [252, 72], block: [170, 60], tag: [170, 28], label: 'Por afuera' },
  enganche: { via: [160, 148], end: [252, 124], block: [160, 134], tag: [160, 166], label: 'Enganche' },
  cano: { via: [172, 98], end: [254, 98], block: [150, 98], tag: [214, 82], label: 'Caño' },
};

/** Mano a mano con un defensor, visto de arriba. `result` = { ok }: si sale, pasás; si no, te la sacan. */
export function Duelo({ choice, preview, result }) {
  const id = cleanId(useId());
  const shown = choice ?? preview;
  const d = choice ? DUEL[choice] : null;
  const rel = (p, from) => ({ x: p[0] - from[0], y: p[1] - from[1] });
  let run;
  let ball;
  let def;
  if (result && d) {
    if (result.ok) {
      const a = rel(d.via, RUNNER);
      const b = rel(d.end, RUNNER);
      run = { '--x1': a.x, '--y1': a.y, '--x2': b.x, '--y2': b.y };
    } else {
      const c = rel(d.block, [RUNNER[0] + 10, RUNNER[1] + 4]);
      ball = { '--x1': c.x, '--y1': c.y };
      const k = rel(d.block, DEFENDER);
      def = { '--x1': k.x, '--y1': k.y };
    }
  }
  return (
    <div className={`cr-pitch cr-cancha cr-duelo${result ? (result.ok ? ' is-ok' : ' is-miss') : ''}`}>
      <svg viewBox="0 0 320 180" aria-hidden="true" focusable="false">
        <defs>
          <marker id={`${id}a`} viewBox="0 0 8 8" refX="6" refY="4" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M0 0L8 4L0 8Z" className="cr-arrow-head" />
          </marker>
          <radialGradient id={`${id}v`} cx="0.5" cy="0.5" r="0.75">
            <stop offset="0.6" stopColor="#000" stopOpacity="0" />
            <stop offset="1" stopColor="#000" stopOpacity="0.3" />
          </radialGradient>
        </defs>
        {Array.from({ length: 10 }, (_, i) => <rect key={i} className={i % 2 ? 'cr-g2' : 'cr-g1'} x={i * 32} y="0" width="32" height="180" />)}
        <g className="cr-chalk">
          <rect x="4" y="6" width="312" height="168" />
          <rect x="262" y="30" width="54" height="120" />
          <path d="M262 70A22 22 0 0 0 262 110" />
        </g>
        {Object.entries(DUEL).map(([key, s]) => (
          <polyline
            key={key} points={`${RUNNER[0]},${RUNNER[1]} ${s.via[0]},${s.via[1]} ${short(s.via, s.end, 10).join(',')}`} markerEnd={`url(#${id}a)`}
            className={`cr-path${shown === key ? ' is-on' : ''}${choice && choice !== key ? ' is-off' : ''}`}
          />
        ))}
        <g transform={`translate(${DEFENDER[0]} ${DEFENDER[1]})`}>
          <g className={`cr-runner${def ? ' is-run' : ''}`} style={def}><Token at={[0, 0]} kind="rival" /></g>
        </g>
        <g transform={`translate(${RUNNER[0]} ${RUNNER[1]})`}>
          <g className={`cr-runner${run ? ' is-run is-two' : ''}`} style={run}>
            <Token at={[0, 0]} kind="you" />
            {!ball && <g transform="translate(10 4)"><Ball r={5} /></g>}
          </g>
        </g>
        {ball && (
          <g transform={`translate(${RUNNER[0] + 10} ${RUNNER[1] + 4})`}>
            <g className="cr-ball is-pass" style={ball}><Ball r={5} /></g>
          </g>
        )}
        {result && !result.ok && d && <g transform={`translate(${d.block[0]} ${d.block[1] - 14})`}><path className="cr-cut" d="M-6 -6L6 6M6 -6L-6 6" /></g>}
        {!result && Object.entries(DUEL).map(([key, s]) => <Tag key={key} at={s.tag} text={s.label} on={shown === key} />)}
        <rect width="320" height="180" fill={`url(#${id}v)`} pointerEvents="none" />
      </svg>
    </div>
  );
}

// ---------- Quite (defensores) ----------

const ATTACKER = [258, 96]; // el rival que viene con la pelota, hacia el arco de Vélez (a la izquierda)
const MARKER = [146, 96]; // vos
const OWN_GOAL = [8, 90];
const TACKLE = {
  aguantar: { meet: [94, 96], tag: [84, 120], label: 'Acompañar', via: [120, 146], wide: [10, 150] },
  barrida: { meet: [200, 136], tag: [214, 160], label: 'Barrida', via: [196, 50], wide: [10, 40] },
  anticipo: { meet: [222, 70], tag: [222, 48], label: 'Anticipo', via: [214, 140], wide: [10, 140] },
};

/**
 * Un rival te encara hacia el arco de Vélez (visto de arriba). `result` = { ok, kind }: si sale, te quedás con la
 * pelota (y con la contra, sale disparada para el otro lado); si no, te pasa y patea: gol o afuera.
 */
export function Quite({ choice, preview, result }) {
  const id = cleanId(useId());
  const shown = choice ?? preview;
  const d = choice ? TACKLE[choice] : null;
  const rel = (p, from) => ({ x: p[0] - from[0], y: p[1] - from[1] });
  const ballAt = [ATTACKER[0] - 10, ATTACKER[1] + 4];
  let me;
  let ball;
  let rival;
  let ballCls = '';
  if (result && d) {
    const m = rel(d.meet, MARKER);
    me = { '--x1': m.x, '--y1': m.y };
    if (result.ok) {
      const b1 = rel(d.meet, ballAt);
      const b2 = rel([312, 70], ballAt);
      ball = { '--x1': b1.x, '--y1': b1.y, '--x2': b2.x, '--y2': b2.y };
      ballCls = result.kind === 'contra' ? ' is-two' : '';
    } else {
      const v = rel(d.via, ATTACKER);
      const e = rel([70, (d.via[1] + OWN_GOAL[1]) / 2], ATTACKER);
      rival = { '--x1': v.x, '--y1': v.y, '--x2': e.x, '--y2': e.y };
      const b1 = rel(d.via, ballAt);
      const b2 = rel(result.kind === 'golrival' ? OWN_GOAL : d.wide, ballAt);
      ball = { '--x1': b1.x, '--y1': b1.y, '--x2': b2.x, '--y2': b2.y };
      ballCls = ' is-two';
    }
  }
  return (
    <div className={`cr-pitch cr-cancha cr-quite${result ? (result.ok ? ' is-ok' : ' is-miss') : ''}`}>
      <svg viewBox="0 0 320 180" aria-hidden="true" focusable="false">
        <defs>
          <pattern id={`${id}n`} width="3" height="3" patternUnits="userSpaceOnUse"><path d="M0 0H3M0 0V3" className="cr-mesh" /></pattern>
          <marker id={`${id}a`} viewBox="0 0 8 8" refX="6" refY="4" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M0 0L8 4L0 8Z" className="cr-arrow-head" />
          </marker>
          <radialGradient id={`${id}v`} cx="0.5" cy="0.5" r="0.75">
            <stop offset="0.6" stopColor="#000" stopOpacity="0" />
            <stop offset="1" stopColor="#000" stopOpacity="0.3" />
          </radialGradient>
        </defs>
        {Array.from({ length: 10 }, (_, i) => <rect key={i} className={i % 2 ? 'cr-g2' : 'cr-g1'} x={i * 32} y="0" width="32" height="180" />)}
        <g className="cr-chalk">
          <rect x="4" y="6" width="312" height="168" />
          <rect x="4" y="38" width="70" height="104" />
          <rect x="4" y="66" width="24" height="48" />
          <path d="M74 72A22 22 0 0 1 74 108" />
          <path d="M316 60A30 30 0 0 0 316 120" />
        </g>
        <circle className="cr-chalk-dot" cx="48" cy="90" r="1.8" />
        <rect className="cr-goalmouth" x="0" y="76" width="4" height="28" fill={`url(#${id}n)`} />
        <Tag at={[66, 22]} text="Arco de Vélez" />
        {Object.entries(TACKLE).map(([key, s]) => {
          const [x2, y2] = short(MARKER, s.meet, 4);
          return (
            <line
              key={key} x1={MARKER[0]} y1={MARKER[1]} x2={x2} y2={y2} markerEnd={`url(#${id}a)`}
              className={`cr-path${shown === key ? ' is-on' : ''}${choice && choice !== key ? ' is-off' : ''}`}
            />
          );
        })}
        <g transform={`translate(${ATTACKER[0]} ${ATTACKER[1]})`}>
          <g className={`cr-runner${rival ? ' is-run is-two' : ''}`} style={rival}><Token at={[0, 0]} kind="rival" /></g>
        </g>
        <g transform={`translate(${MARKER[0]} ${MARKER[1]})`}>
          <g className={`cr-runner${me ? ' is-run' : ''}`} style={me}><Token at={[0, 0]} kind="you" /></g>
        </g>
        <g transform={`translate(${ballAt[0]} ${ballAt[1]})`}>
          <g className={`cr-ball${ball ? ` is-pass${ballCls}` : ''}`} style={ball}><Ball r={5} /></g>
        </g>
        {result && !result.ok && d && <g transform={`translate(${d.meet[0]} ${d.meet[1] - 14})`}><path className="cr-cut" d="M-6 -6L6 6M6 -6L-6 6" /></g>}
        {!result && Object.entries(TACKLE).map(([key, s]) => <Tag key={key} at={s.tag} text={s.label} on={shown === key} />)}
        {!result && <Tag at={[MARKER[0], MARKER[1] - 24]} text="Vos" on />}
        {!result && <Tag at={[ATTACKER[0], ATTACKER[1] + 24]} text="Rival" />}
        <rect width="320" height="180" fill={`url(#${id}v)`} pointerEvents="none" />
      </svg>
    </div>
  );
}

export const passLabel =(key) => PASSES.find((p) => p.key === key)?.label ?? '';

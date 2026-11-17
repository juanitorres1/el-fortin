// Modo Carrera (Juegos › Carrera): un pibe de las inferiores que sube a la Primera de Vélez. Se carga aparte
// (import dinámico desde pages/juegos.jsx) para no sumar peso a los otros juegos. La lógica está en lib/carrera/
// y la partida se guarda en el navegador (fortin:carrera); se puede llevar a otro dispositivo con un código.
import { useEffect, useMemo, useRef, useState } from 'react';
import { load, save } from '../../../lib/storage.js';
import { VELEZ_ID } from '../../../lib/espn.js';
import { ATTRS, MAX_EXTRA, NAME_MAX, POSITIONS, ROLE_LABEL, SPOTS, START_AGE, START_POINTS, TRAINING, attrLabel, cleanName, objective, overall, roleOf, spotOf, trainLabel, trainOdds } from '../../../lib/carrera/player.js';
import { PLAYOFF_SPOTS, roundName } from '../../../lib/carrera/season.js';
import { isPenalty, outcomeKind } from '../../../lib/carrera/match.js';
import {
  answerMoment, answerPress, buyPerk, chooseEvent, currentGame, retire, retireState, dismissLast, eventsAt, finishMatch, matchDone, newCareer, nextTorneo, skipWeek, startMatch, torneoLabel, trainWeek,
  velezCalendar, weekEvent, weekTitle, zoneTables,
} from '../../../lib/carrera/career.js';
import { GOAL_REWARD, fxText, goalProgress } from '../../../lib/carrera/extras.js';
import { LOGROS, isBigMatch, logroOf } from '../../../lib/carrera/logros.js';
import { PRESS, careerTotals, historicRank } from '../../../lib/carrera/historia.js';
import { GOAL_PRIZE, PERKS, WIN_PRIZE, hasPerk, money, salaryOf } from '../../../lib/carrera/economia.js';
import { useJson } from '../../../hooks/data.js';
import { SAVE_KEY, exportCode, importCode, migrate } from '../../../lib/carrera/save.js';
import { Crest, Empty, Segmented, Skeletons } from '../../../components/ui.jsx';
import { Confetti, ShareResult, useCountUp } from '../shared.jsx';
import { Momento, Stars, verdict } from './Momento.jsx';
import { Arco, Cancha, Duelo, Quite } from './Escena.jsx';

// Las estadísticas que importan según el puesto: [clave, nombre, abreviatura].
const STAT_COLS = {
  arq: [['at', 'Atajadas', 'At'], ['vi', 'Vallas invictas', 'VI']],
  def: [['qt', 'Quites', 'Qt'], ['vi', 'Vallas invictas', 'VI'], ['g', 'Goles', 'G']],
  vol: [['g', 'Goles', 'G'], ['a', 'Asistencias', 'A']],
  del: [['g', 'Goles', 'G'], ['a', 'Asistencias', 'A']],
};
const statCols = (pos) => STAT_COLS[pos] ?? STAT_COLS.del;
/** Lo principal para compartir según el puesto: [valor, unidad]. */
const headline = (pos, x) => (pos === 'arq' ? [x.at ?? 0, 'atajadas'] : pos === 'def' ? [x.qt ?? 0, 'quites'] : [x.g, 'goles']);
const statsText = (pos, x) => statCols(pos).map(([k, label]) => `${x[k] ?? 0} ${label.toLowerCase()}`).join(', ');
const ZONE = ['Zona A', 'Zona B'];
const fmtAge = (age) => `${Math.floor(age)} años`;
const ratingClass = (r) => (r >= 7.5 ? 'is-good' : r < 5.5 ? 'is-bad' : '');

// ---------- Crear ----------

const HOW = [
  ['💪', 'Entrená', 'Cada semana subís un atributo o descansás.'],
  ['🎯', 'Jugá las jugadas', 'Elegís qué hacer y frenás la barra en la zona verde.'],
  ['📈', 'Ganate el puesto', 'Con buenos puntajes pasás de la Reserva a titular.'],
];

/** La carta del jugador que se va armando mientras se elige (como en los juegos de carrera). */
function PlayerCard({ name, spot, attrs }) {
  const ov = overall({ pos: spot.pos, attrs });
  return (
    <div className="cr-card" aria-hidden="true">
      <span className="cr-ov" style={{ '--p': ov }}><b className="num">{ov}</b><small>media</small></span>
      <div className="cr-card-main">
        <strong className="cr-name">{name || 'Tu nombre'}</strong>
        <span className="cr-card-pos">{spot.label} · {START_AGE} años · Inferiores</span>
        <ul className="cr-card-attrs">
          {ATTRS.map(({ key }) => <li key={key}><b className="num">{attrs[key]}</b><small>{attrLabel(key, spot.pos).slice(0, 3)}</small></li>)}
        </ul>
      </div>
    </div>
  );
}

const MIX_LABEL = { remate: 'Remates', gambeta: 'Gambetas', quite: 'Quites', atajada: 'Atajadas', pase: 'Pases' };

/** Qué jugadas le tocan a cada lugar (en %), en el orden del más frecuente. */
function mixOf(spot) {
  const rest = 1 - Object.entries(spot.mix).filter(([k]) => k !== 'pase').reduce((a, [, v]) => a + v, 0);
  const all = { ...spot.mix, ...(rest > 0.001 ? { pase: rest } : {}) };
  return Object.entries(all).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
}

/**
 * La formación (4-2-3-1, Vélez ataca hacia arriba): se toca el lugar donde se quiere jugar. Cada lugar es un botón
 * de 44 px; abajo, el detalle del elegido y qué jugadas le van a tocar.
 */
function Formacion({ value, onChange }) {
  const spot = SPOTS.find((s) => s.key === value);
  return (
    <>
      <div className="cr-pitch cr-formation" role="group" aria-labelledby="cr-pos-l">
        <svg viewBox="0 0 100 120" aria-hidden="true" focusable="false">
          {Array.from({ length: 8 }, (_, i) => <rect key={i} className={i % 2 ? 'cr-g2' : 'cr-g1'} x="0" y={i * 15} width="100" height="15" />)}
          <g className="cr-chalk">
            <rect x="3" y="3" width="94" height="114" />
            <path d="M3 60H97" />
            <circle cx="50" cy="60" r="11" />
            <rect x="24" y="3" width="52" height="18" />
            <rect x="38" y="3" width="24" height="7" />
            <path d="M41 21A10 10 0 0 0 59 21" />
            <rect x="24" y="99" width="52" height="18" />
            <rect x="38" y="110" width="24" height="7" />
            <path d="M41 99A10 10 0 0 1 59 99" />
          </g>
          <circle className="cr-chalk-dot" cx="50" cy="60" r="0.9" />
        </svg>
        <span className="cr-formation-tag" aria-hidden="true">Vélez ataca ↑</span>
        {SPOTS.map((s) => (
          <button
            key={s.key} type="button" className={`cr-spot is-${s.pos}`} aria-pressed={value === s.key} aria-label={`${s.label} (${POSITIONS[s.pos].label})`}
            style={{ left: `${s.x}%`, top: `${s.y}%` }} onClick={() => onChange(s.key)}
          >
            <span className="cr-spot-dot" aria-hidden="true">{s.short}</span>
          </button>
        ))}
      </div>
      <div className="cr-spot-info" aria-live="polite">
        <p><b>{spot.label}</b> {spot.label !== POSITIONS[spot.pos].label && <span className={`cr-tag is-${spot.pos}`}>{POSITIONS[spot.pos].label}</span>}</p>
        <p className="small">{spot.hint}</p>
        <ul className="cr-mix" aria-label="Tus jugadas en cada partido">
          {mixOf(spot).map(([k, v]) => (
            <li key={k} style={{ '--w': `${Math.round(v * 100)}%` }}>
              <span>{MIX_LABEL[k]}</span>
              <span className="cr-meter-bar" aria-hidden="true"><i /></span>
              <b className="num">{Math.round(v * 100)} %</b>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

function Crear({ standings, roster, onCreate, onImport }) {
  const [name, setName] = useState('');
  const [spotKey, setSpot] = useState('9');
  const [extra, setExtra] = useState({});
  const spot = SPOTS.find((s) => s.key === spotKey);
  const used = Object.values(extra).reduce((a, b) => a + b, 0);
  const left = START_POINTS - used;
  const base = POSITIONS[spot.pos].base;
  const attrs = Object.fromEntries(ATTRS.map(({ key }) => [key, base[key] + (extra[key] ?? 0)]));
  const clean = cleanName(name);
  const bump = (key, d) => setExtra((e) => ({ ...e, [key]: Math.max(0, Math.min(MAX_EXTRA, (e[key] ?? 0) + d)) }));
  const submit = (e) => {
    e.preventDefault();
    if (!clean) return;
    const seed = Math.floor(Math.random() * 2 ** 32);
    onCreate(newCareer({ name: clean, spot: spotKey, extra, standings, roster, velezId: VELEZ_ID, seed }));
  };
  if (standings === undefined) return <Skeletons className="sk-card" />;
  if (!standings?.groups?.some((g) => g.rows?.some((r) => String(r.id) === String(VELEZ_ID)))) {
    return <Empty>La carrera necesita la tabla del torneo y ahora no cargó. Probá de nuevo en un rato.</Empty>;
  }
  return (
    <>
      <ol className="cr-how">
        {HOW.map(([icon, title, text], i) => (
          <li key={title}><span className="cr-how-n" aria-hidden="true">{icon}</span><b>{i + 1}. {title}</b><small>{text}</small></li>
        ))}
      </ol>
      <form className="card cr-create" onSubmit={submit}>
        <p className="kicker">Inferiores de Vélez</p>
        <h3 className="cr-title">Armá a tu jugador</h3>
        <PlayerCard name={clean} spot={spot} attrs={attrs} />
        <label className="psearch-label" htmlFor="cr-name">Nombre</label>
        <input id="cr-name" className="psearch-input" type="text" value={name} maxLength={NAME_MAX} placeholder="Nombre y apellido" autoComplete="off" onChange={(e) => setName(e.target.value)} />
        <p className="psearch-label" id="cr-pos-l">Tocá tu lugar en la cancha</p>
        <Formacion value={spotKey} onChange={setSpot} />
        <div className="cr-points">
          <p className="psearch-label">Repartí tus puntos</p>
          <p className="cr-pips" aria-label={`Te quedan ${left} de ${START_POINTS}`}>
            {Array.from({ length: START_POINTS }, (_, i) => <i key={i} className={i < left ? 'is-left' : undefined} />)}
          </p>
        </div>
        <ul className="cr-attrs">
          {ATTRS.map(({ key }) => {
            const label = attrLabel(key, spot.pos);
            return (
              <li key={key}>
                <span>{label}{extra[key] ? <small className="cr-plus"> +{extra[key]}</small> : null}</span>
                <button type="button" className="cr-step" aria-label={`Sacar un punto de ${label}`} disabled={!extra[key]} onClick={() => bump(key, -1)}>−</button>
                <b className="num">{attrs[key]}</b>
                <button type="button" className="cr-step" aria-label={`Sumar un punto a ${label}`} disabled={!left || (extra[key] ?? 0) >= MAX_EXTRA} onClick={() => bump(key, 1)}>+</button>
              </li>
            );
          })}
        </ul>
        <p className="muted small">Hasta {MAX_EXTRA} puntos en un mismo atributo.</p>
        <button type="submit" className="btn btn-solid cr-cta" disabled={!clean}>{clean ? 'Firmar el primer contrato' : 'Escribí tu nombre para firmar'}</button>
      </form>
      <Importar onImport={onImport} />
    </>
  );
}

function Importar({ onImport }) {
  const [text, setText] = useState('');
  const [error, setError] = useState(false);
  const go = () => {
    const s = importCode(text);
    if (!s) return setError(true);
    onImport(s);
  };
  return (
    <details className="cr-more">
      <summary>¿Tenés un código de otra carrera?</summary>
      <label className="psearch-label" htmlFor="cr-import">Pegá el código</label>
      <textarea id="cr-import" className="psearch-input cr-code" rows={3} value={text} onChange={(e) => { setText(e.target.value); setError(false); }} />
      {error && <p className="small cr-bad" role="alert">Ese código no es válido o es de otra versión del juego.</p>}
      <button type="button" className="btn btn-outline" disabled={!text.trim()} onClick={go}>Cargar la carrera</button>
    </details>
  );
}

// ---------- Ficha ----------

function Meter({ label, value, warn, marks = [] }) {
  return (
    <div className={`cr-meter${warn ? ' is-warn' : ''}`}>
      <span className="cr-meter-top"><span>{label}</span><b className="num">{Math.round(value)}</b></span>
      <span className="cr-meter-bar" aria-hidden="true">
        <i style={{ width: `${value}%` }} />
        {marks.map((m) => <span key={m} className="cr-mark" style={{ left: `${m}%` }} />)}
      </span>
    </div>
  );
}

/** Últimos 5 puntajes (como la «forma» de los juegos de fútbol): verde bueno, gris normal, rojo malo. */
function Form({ form }) {
  if (!form?.length) return null;
  return (
    <span className="cr-form" aria-label={`Últimos puntajes: ${form.map((f) => f.r.toFixed(1)).join(', ')}`}>
      {form.map((f, i) => <b key={i} className={`num ${ratingClass(f.r)}${f.side === 'reserva' ? ' is-res' : ''}`} aria-hidden="true">{f.r.toFixed(1)}</b>)}
    </span>
  );
}

function Header({ state }) {
  const p = state.player;
  const role = roleOf(p);
  const goal = objective(p);
  const pct = Math.min(100, Math.round((goal.value / goal.to) * 100));
  return (
    <div className="card cr-head">
      <div className="cr-id">
        <span className="cr-ov" style={{ '--p': overall(p) }} aria-label={`Media ${overall(p)}`}><b className="num">{overall(p)}</b><small>media</small></span>
        <div>
          <strong className="cr-name">{p.name}</strong>
          <span className="muted small">{spotOf(p).label} · {fmtAge(p.age)} · <span className={`cr-role is-${role}`}>{ROLE_LABEL[role]}</span></span>
          <span className="cr-money"><span aria-hidden="true">💰</span> <b className="num">{money(p.money)}</b> <small>(cobrás {money(salaryOf(p))} por semana)</small></span>
          <Form form={p.form} />
        </div>
      </div>
      <div className="cr-goal">
        <p className="cr-goal-title"><span aria-hidden="true">🎯</span><b>{goal.text}</b><span className="num cr-goal-num">{Math.round(goal.value)}/{goal.to}</span></p>
        <span className="cr-goal-bar" aria-hidden="true"><i style={{ width: `${pct}%` }} /></span>
        <p className="muted small">{goal.hint}</p>
      </div>
      <div className="cr-minis">
        <Meter label="⚡ Energía" value={p.energy} warn={p.energy < 40} />
        <Meter label="📣 Hinchas" value={p.fans} />
      </div>
    </div>
  );
}

/** Insignias de logros (las nuevas entran con un salto). `ids` = los logros a mostrar. */
function Badges({ ids, fresh }) {
  if (!ids?.length) return null;
  return (
    <ul className={`cr-badges${fresh ? ' is-fresh' : ''}`} aria-label="Logros nuevos">
      {ids.map((id, k) => {
        const l = logroOf(id);
        return l && <li key={id} style={{ '--i': k }}><span aria-hidden="true">{l.icon}</span> <b>Logro: {l.title}</b></li>;
      })}
    </ul>
  );
}

/** La vitrina: los logros ganados (con el torneo en que salieron) y los que faltan, más los títulos. */
function Vitrina({ state }) {
  const have = state.logros ?? {};
  const got = LOGROS.filter((l) => have[l.id]).length;
  const titles = state.history.filter((h) => h.result === 'Campeón').length + (state.torneo.summary?.result === 'Campeón' ? 1 : 0);
  return (
    <div className="card cr-vitrina">
      <p className="kicker"><span aria-hidden="true">🏅</span> Vitrina · {got}/{LOGROS.length} logros{titles ? ` · ${titles} ${titles === 1 ? 'título' : 'títulos'}` : ''}</p>
      <ul className="cr-logros">
        {LOGROS.map((l) => {
          const n = have[l.id];
          return (
            <li key={l.id} className={n ? 'is-got' : undefined}>
              <span className="cr-logro-icon" aria-hidden="true">{n ? l.icon : '🔒'}</span>
              <b>{l.title}</b>
              <small>{n ? torneoLabel(state.startYear, n) : l.desc}</small>
              {!n && <span className="sr-only"> (sin lograr)</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Ficha({ state, onReset }) {
  const p = state.player;
  const st = state.torneo.stats;
  const avg = st.ratings.length ? (st.ratings.reduce((a, b) => a + b, 0) / st.ratings.length).toFixed(1) : '–';
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const copy = async () => {
    const c = exportCode(state);
    setCode(c);
    try {
      await navigator.clipboard.writeText(c);
      setCopied(true);
    } catch {
      /* queda a la vista para copiarlo a mano */
    }
  };
  return (
    <>
      <Vitrina state={state} />
      <Historia state={state} />
      <div className="card">
        <p className="kicker">Atributos</p>
        <ul className="cr-bars">
          {ATTRS.map(({ key }) => (
            <li key={key}><span>{attrLabel(key, p.pos)}</span><span className="cr-meter-bar" aria-hidden="true"><i style={{ width: `${p.attrs[key]}%` }} /></span><b className="num">{p.attrs[key]}</b></li>
          ))}
        </ul>
      </div>
      <div className="card">
        <p className="kicker">{state.torneo.label}</p>
        <dl className="cr-stats">
          <div><dt>Partidos en Primera</dt><dd className="num">{st.pj}</dd></div>
          <div><dt>Titular</dt><dd className="num">{st.tit}</dd></div>
          {statCols(p.pos).map(([k, label]) => <div key={k}><dt>{label}</dt><dd className="num">{st[k] ?? 0}</dd></div>)}
          <div><dt>Puntaje promedio</dt><dd className="num">{avg}</dd></div>
          <div><dt>En Reserva</dt><dd className="num">{st.res.pj} PJ · {p.pos === 'arq' ? `${st.res.at ?? 0} At` : p.pos === 'def' ? `${st.res.qt ?? 0} Qt` : `${st.res.g} G`}</dd></div>
        </dl>
      </div>
      {state.history.length > 0 && (
        <div className="card">
          <p className="kicker">Tu carrera</p>
          <div className="cr-scroll">
            <table className="cr-table">
              <thead><tr><th scope="col">Torneo</th><th scope="col">PJ</th>{statCols(p.pos).map(([k, label, ab]) => <th key={k} scope="col"><abbr title={label}>{ab}</abbr></th>)}<th scope="col">Vélez</th></tr></thead>
              <tbody>
                {state.history.map((h) => (
                  <tr key={h.n}><th scope="row">{h.label}</th><td className="num">{h.pj}</td>{statCols(p.pos).map(([k]) => <td key={k} className="num">{h[k] ?? 0}</td>)}<td>{h.result}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {state.news.length > 0 && (
        <div className="card">
          <p className="kicker">Novedades</p>
          <ul className="cr-news">{state.news.map((n, i) => <li key={i}>{n.text}</li>)}</ul>
        </div>
      )}
      <details className="cr-more">
        <summary>Guardar en otro dispositivo o empezar de nuevo</summary>
        <p className="small muted">La carrera se guarda solo en este navegador. Para seguirla en otro, copiá el código y pegalo allá al crear un jugador.</p>
        <button type="button" className="btn btn-outline" onClick={copy}>{copied ? 'Código copiado' : 'Copiar el código de la carrera'}</button>
        {code && <textarea className="psearch-input cr-code" rows={3} readOnly value={code} aria-label="Código de la carrera" onFocus={(e) => e.target.select()} />}
        {!confirm
          ? <button type="button" className="btn btn-ghost cr-danger" onClick={() => setConfirm(true)}>Empezar otra carrera</button>
          : (
            <p className="cr-confirm" role="alert">
              Se borra {p.name} y todo lo jugado. ¿Seguro?{' '}
              <button type="button" className="btn btn-solid cr-danger-solid" onClick={onReset}>Sí, borrar</button>{' '}
              <button type="button" className="btn btn-outline" onClick={() => setConfirm(false)}>No</button>
            </p>
          )}
      </details>
    </>
  );
}

// ---------- Tabla ----------

function Tabla({ state }) {
  const t = state.torneo;
  const tables = useMemo(() => zoneTables(t), [t]);
  const own = t.teams.find((x) => x.id === state.velez).zone;
  const [zone, setZone] = useState(own);
  const rows = tables[zone] ?? [];
  return (
    <>
      {tables.length > 1 && <Segmented options={tables.map((_, i) => ({ value: i, label: ZONE[i] ?? `Zona ${i + 1}` }))} value={zone} onChange={setZone} label="Zona" />}
      <div className="card cr-scroll">
        <table className="cr-table cr-standings">
          <thead><tr><th scope="col">#</th><th scope="col">Equipo</th><th scope="col">PJ</th><th scope="col">DG</th><th scope="col">Pts</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={`${r.id === state.velez ? 'is-velez' : ''}${r.rank === PLAYOFF_SPOTS ? ' is-cut' : ''}`}>
                <td className="num">{r.rank}</td>
                <th scope="row"><span className="cr-team"><Crest url={r.logo} size={20} />{r.name}</span></th>
                <td className="num">{r.pj}</td>
                <td className="num">{r.dg > 0 ? `+${r.dg}` : r.dg}</td>
                <td className="num"><b>{r.pts}</b></td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted small">Los primeros {PLAYOFF_SPOTS} de cada zona pasan a los playoffs.</p>
      </div>
      {t.bracket && (
        <div className="card">
          <p className="kicker">Playoffs</p>
          {t.bracket.rounds.map((round, i) => (
            <div key={i} className="cr-round">
              <h4 className="cr-round-name">{roundName(round.length)}</h4>
              <ul className="cr-results">
                {round.map((x) => <ResultLine key={`${x.h}-${x.a}`} t={t} h={x.h} a={x.a} score={x.score} pens={x.pens} velez={state.velez} />)}
              </ul>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

const nameOf = (t, id) => t.teams.find((x) => x.id === id)?.name ?? '';

function ResultLine({ t, h, a, score, pens, velez }) {
  return (
    <li className={h === velez || a === velez ? 'is-velez' : undefined}>
      <span className="cr-team">{nameOf(t, h)}</span>
      <b className="num">{score ? `${score[0]} - ${score[1]}` : 'vs'}</b>
      <span className="cr-team is-right">{nameOf(t, a)}</span>
      {pens != null && <small className="muted">({pens ? nameOf(t, h) : nameOf(t, a)} por penales)</small>}
    </li>
  );
}

// ---------- Semana ----------

const TRAIN_ICON = { remate: '🎯', pase: '🧭', velocidad: '⚡', fisico: '💪', descanso: '🛌' };
const ODDS_TEXT = { alta: 'chance alta', media: 'chance media', baja: 'chance baja', fundido: 'estás fundido', tope: 'al máximo' };

function TrainResult({ trained, player }) {
  const t = TRAINING.find((x) => x.key === trained.key);
  const label = t && trainLabel(t, player.pos);
  if (trained.key === 'descanso') return <p className="small cr-note is-rest"><span aria-hidden="true">🛌</span> Descansaste: recuperaste energía.</p>;
  if (trained.tired) return <p className="small cr-note cr-bad"><span aria-hidden="true">🥵</span> {label}: estabas fundido y no te sirvió. Descansá.</p>;
  const value = player.attrs[trained.attr];
  return (
    <div className={`cr-note cr-trained${trained.gain ? ' is-up' : ''}`} role="status">
      <span className="cr-icon" aria-hidden="true">{TRAIN_ICON[trained.key]}</span>
      <span>
        <b>{label}</b>
        <span className="small">{trained.gain ? `${attrLabel(trained.attr, player.pos)} sube a ${value}` : 'esta vez no subiste. Seguí metiéndole.'}</span>
        <span className="cr-meter-bar" aria-hidden="true"><i style={{ width: `${value}%` }} /></span>
      </span>
      {trained.gain > 0 && <b className="cr-gain num" aria-hidden="true">+{trained.gain}</b>}
      <LevelUp ov={trained.ov} />
    </div>
  );
}

/** «¡Media 54!» cuando un entrenamiento o un evento sube la media. */
function LevelUp({ ov }) {
  if (!ov || ov[1] <= ov[0]) return null;
  return <span className="cr-levelup" role="status"><span aria-hidden="true">⬆️</span> ¡Tu media sube a <b className="num">{ov[1]}</b>!</span>;
}

/** El evento de la semana fuera de la cancha: dos opciones con sus efectos a la vista. */
function Evento({ state, act }) {
  const ev = weekEvent(state);
  if (!ev) return null;
  const { event, choice } = ev;
  const opt = choice != null ? event.options[choice] : null;
  return (
    <div className="card cr-week cr-event">
      <p className="kicker"><span aria-hidden="true">🗞️</span> Fuera de la cancha</p>
      <h3 className="cr-moment-text">{(state.player.pos === 'arq' && event.arq) || event.text}</h3>
      {opt ? (
        <div className="cr-note cr-event-res" role="status">
          <b>{opt.label}.</b> {opt.res} <span className="cr-fx">{fxText(opt.fx, state.player.pos)}</span>
          <LevelUp ov={state.torneo.event?.ov} />
        </div>
      ) : (
        <div className="cr-options is-pass">
          {event.options.map((o, i) => (
            <button key={o.label} type="button" className="cr-opt" onClick={() => act(chooseEvent, i)}>
              <b>{o.label}</b>
              <small>{fxText(o.fx, state.player.pos)}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Metas del torneo con su avance (las cumplidas suman hinchas al final). */
function Metas({ torneo }) {
  const goals = goalProgress(torneo);
  if (!goals.length) return null;
  const done = goals.filter((g) => g.done).length;
  return (
    <div className="card cr-week cr-goals">
      <p className="kicker"><span aria-hidden="true">🎯</span> Metas del torneo · {done}/{goals.length}</p>
      <ul>
        {goals.map((g) => {
          const pct = Math.min(100, Math.round((g.value / g.target) * 100));
          return (
            <li key={g.key} className={g.done ? 'is-done' : undefined}>
              <span className="cr-goal-check" aria-hidden="true">{g.done ? '✓' : ''}</span>
              <span className="cr-goals-text">{g.text}</span>
              <b className="num">{g.key === 'avg' ? (g.value || '–') : `${Math.min(g.value, g.target)}/${g.target}`}</b>
              <span className="cr-meter-bar" aria-hidden="true"><i style={{ width: `${pct}%` }} /></span>
              {g.done && <span className="sr-only"> (cumplida)</span>}
            </li>
          );
        })}
      </ul>
      <p className="muted small">Cada meta cumplida suma {GOAL_REWARD} hinchas al terminar el torneo.</p>
    </div>
  );
}

/** Fila de fechas para deslizar: jugadas con su resultado, la de esta semana marcada y las que vienen. */
function Calendar({ state }) {
  const cal = velezCalendar(state);
  const row = useRef(null);
  useEffect(() => {
    const el = row.current;
    const on = el?.querySelector('.is-now');
    if (on) el.scrollTo({ left: on.offsetLeft - (el.clientWidth - on.offsetWidth) / 2 });
  }, [state.torneo.week, state.torneo.bracket?.rounds.length]);
  return (
    <ol className="cr-cal" ref={row} aria-label="Calendario de Vélez">
      {cal.map((x) => {
        const res = x.score ? Math.sign(x.score[0] - x.score[1]) || (x.won == null ? 0 : x.won ? 1 : -1) : null;
        const cls = `${x.now ? ' is-now' : ''}${res === 1 ? ' is-w' : res === -1 ? ' is-l' : res === 0 ? ' is-d' : ''}`;
        const desc = x.libre ? 'libre' : `${x.home ? 'local' : 'visitante'} contra ${x.rival.name}${x.score ? `, ${x.score[0]} a ${x.score[1]}` : ''}`;
        return (
          <li key={x.key} className={cls} aria-current={x.now ? 'step' : undefined} aria-label={`${x.label}: ${desc}`}>
            <small aria-hidden="true">{x.label}</small>
            {x.libre ? <span className="cr-cal-free" aria-hidden="true">Libre</span> : <Crest url={x.rival.logo} size={24} />}
            <b className="num" aria-hidden="true">{x.libre ? '·' : x.score ? `${x.score[0]}-${x.score[1]}` : x.home ? 'L' : 'V'}</b>
          </li>
        );
      })}
    </ol>
  );
}

function Matchup({ state, rival, home, reserva }) {
  const velez = state.torneo.teams.find((x) => x.id === state.velez);
  const sides = [{ name: reserva ? 'Vélez Res.' : 'Vélez', logo: velez?.logo }, { name: reserva ? `${rival.name} Res.` : rival.name, logo: rival.logo }];
  const [a, b] = home ? sides : [sides[1], sides[0]];
  return (
    <div className="cr-matchup">
      <span className="cr-matchup-team"><Crest url={a.logo} size={56} /><b>{a.name}</b></span>
      <span className="cr-vs" aria-hidden="true">vs</span>
      <span className="cr-matchup-team"><Crest url={b.logo} size={56} /><b>{b.name}</b></span>
    </div>
  );
}

function Semana({ state, act }) {
  const game = currentGame(state);
  const t = state.torneo;
  const p = state.player;
  const role = roleOf(p);
  if (!game) return null;
  const libre = game.kind === 'libre';
  const reserva = role === 'reserva';
  return (
    <>
      <Calendar state={state} />
      <div className="card cr-week">
        <p className="kicker">{weekTitle(state)}</p>
        {libre ? <h3 className="cr-title">Fecha libre: Vélez no juega</h3> : (
          <>
            <Matchup state={state} rival={game.rival} home={game.home} reserva={reserva} />
            <p className="cr-tags">
              <span className="cr-tag">{game.home ? 'Local · José Amalfitani' : 'Visitante'}</span>
              <span className={`cr-tag is-${role}`}>{reserva ? 'Jugás en la Reserva' : role === 'titular' ? 'Sos titular' : 'Arrancás en el banco'}</span>
              {game.kind === 'playoff' && <span className="cr-tag is-ko">Mata-mata</span>}
              {isBigMatch(game.rival) && <span className="cr-tag is-big">🔥 Partido grande</span>}
            </p>
          </>
        )}
      </div>
      <div className="card cr-week">
        <p className="kicker">Entrenamiento de la semana</p>
        {t.trained ? <TrainResult trained={t.trained} player={p} /> : (
          <>
            <p className="muted small">Una sesión por semana. Con poca energía rendís menos en el partido.</p>
            <div className="cr-train">
              {TRAINING.map((x) => {
                const odds = x.attr ? trainOdds(p.attrs[x.attr], p.energy) : null;
                return (
                  <button key={x.key} type="button" className={`cr-opt cr-train-opt${x.attr ? '' : ' is-rest'}${odds === 'fundido' ? ' is-tired' : ''}`} onClick={() => act(trainWeek, x.key)}>
                    <span className="cr-icon" aria-hidden="true">{TRAIN_ICON[x.key]}</span>
                    <b>{trainLabel(x, p.pos)}</b>
                    <small>{x.attr ? <>{attrLabel(x.attr, p.pos)} <b className="cr-train-val num">{p.attrs[x.attr]}</b> · {ODDS_TEXT[odds]} · −{x.cost} ⚡</> : `Recuperás ${-x.cost} de energía`}</small>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
      <Evento state={state} act={act} />
      <Metas torneo={t} />
      <div className="cr-cta-bar">
        <button type="button" className="btn btn-solid cr-cta" onClick={() => act(libre ? skipWeek : startMatch)}>
          {libre ? 'Pasar a la fecha siguiente' : t.trained ? 'Salir a la cancha ⚽' : 'Jugar sin entrenar'}
        </button>
      </div>
    </>
  );
}

// ---------- Partido ----------

const surname = (name) => String(name ?? '').split(' ').slice(-1)[0];

function Marcador({ state, match, i, through }) {
  const velez = state.torneo.teams.find((x) => x.id === state.velez);
  const events = eventsAt(match, i, through);
  const v = events.filter((e) => e.team === 'v').length;
  const r = events.length - v;
  const sides = [
    { key: 'v', name: match.side === 'reserva' ? 'Vélez Res.' : 'Vélez', logo: velez?.logo, g: v },
    { key: 'r', name: match.rival.name, logo: match.rival.logo, g: r },
  ];
  const [a, b] = match.home ? sides : [sides[1], sides[0]];
  const scorers = (side) => events.filter((e) => e.team === side.key).map((e, k) => (
    <li key={k} className={e.mine ? 'is-mine' : undefined}>
      <span aria-hidden="true">⚽</span> {e.min}'{side.key === 'v' ? ` ${surname(e.who)}` : ''}
    </li>
  ));
  return (
    <div className="cr-score" role="group" aria-label={`Marcador: ${a.name} ${a.g}, ${b.name} ${b.g}`}>
      <span className="cr-score-team"><Crest url={a.logo} size={32} /><span>{a.name}</span></span>
      <b className="num cr-score-num" aria-hidden="true"><span key={`a${a.g}`} className="cr-digit">{a.g}</span>-<span key={`b${b.g}`} className="cr-digit">{b.g}</span></b>
      <span className="cr-score-team is-right"><span>{b.name}</span><Crest url={b.logo} size={32} /></span>
      {events.length > 0 && (
        <>
          <ul className="cr-scorers">{scorers(a)}</ul>
          <span />
          <ul className="cr-scorers is-right">{scorers(b)}</ul>
        </>
      )}
    </div>
  );
}

const GOL = '¡GOOOL!'.split('');

// Festejos del gol propio (se elige uno por la jugada, siempre el mismo para la misma jugada).
const CELEBRATIONS = [
  'Corriste al alambrado a gritarlo con la hinchada.',
  'Te tiraste de rodillas frente a la tribuna.',
  'Lo festejaste besando el escudo.',
  'Te tapó todo el equipo en el córner.',
  'Señalaste al cielo y lo gritaste con el alma.',
];

// Cómo reacciona la tribuna a cada resultado que no es gol: palabra grande, tono y vibración.
const REACT = {
  atajada: { word: '¡ATAJADA!', tone: 'is-save', buzz: [40] },
  palo: { word: '¡PALO!', tone: 'is-post', buzz: [30, 40, 30] },
  afuera: { word: '¡UHHH!', tone: 'is-near', buzz: [25] },
  mal: { word: '¡A LA TRIBUNA!', tone: 'is-bad', buzz: null },
  ok: { word: '¡BUEN PASE!', tone: 'is-good', buzz: null },
  cortado: { word: '¡CORTADA!', tone: 'is-bad', buzz: null },
  gambeta: { word: '¡QUÉ JUGADA!', tone: 'is-good', buzz: [20, 30, 20] },
  perdida: { word: '¡TE LA SACARON!', tone: 'is-bad', buzz: null },
  tapada: { word: '¡QUÉ ATAJADA!', tone: 'is-save', buzz: [40, 30, 60] },
  desviado: { word: '¡SE SALVÓ VÉLEZ!', tone: 'is-near', buzz: [25] },
  quite: { word: '¡LIMPITO!', tone: 'is-good', buzz: [30] },
  salvada: { word: '¡SE SALVÓ VÉLEZ!', tone: 'is-near', buzz: [25] },
  golrival: { word: 'GOL DE ELLOS', tone: 'is-bad', buzz: [90] },
};
// Cómo se dibuja una atajada en el arco: lo que pasó con la pelota (atajada, gol, palo o con el pie).
const SAVE_SHOT = { tapada: 'atajada', golrival: 'gol', desviado: 'palo' };
const GOAL_BUZZ = [60, 40, 60, 40, 140];

const Letters = ({ text, className }) => (
  <p className={className} aria-label={text}>{text.split('').map((c, k) => <span key={k} style={{ '--i': k }} aria-hidden="true">{c === ' ' ? ' ' : c}</span>)}</p>
);

/** El festejo: destello, letras que saltan de a una, papelitos, quién la hizo y cómo lo gritó. */
function GolBanner({ mine, mate, name, celebration, counter }) {
  return (
    <div className="cr-gol">
      <Confetti />
      <p className="cr-gol-word" aria-label="¡Gol!">{GOL.map((c, k) => <span key={k} style={{ '--i': k }} aria-hidden="true">{c}</span>)}</p>
      <p className="cr-gol-who">{mine ? `Gol de ${name}` : `Gol de ${mate} · ${counter ? 'la recuperaste vos' : 'asistencia tuya'}`}</p>
      {mine && <p className="muted small">{celebration}</p>}
    </div>
  );
}

function vibrate(pattern) {
  try {
    const touched = navigator.userActivation?.hasBeenActive !== false; // sin un toque antes, el navegador la bloquea
    if (pattern && touched && !matchMedia('(prefers-reduced-motion: reduce)').matches) navigator.vibrate?.(pattern);
  } catch {
    /* sin vibración */
  }
}

function Outcome({ state, match, i, onNext }) {
  const mo = match.moments[i];
  const a = match.answers[i];
  const kind = outcomeKind(mo.type, a);
  const goal = kind === 'gol' || kind === 'asistencia' || kind === 'contra';
  const penal = isPenalty(mo);
  const good = goal || a.ok || kind === 'tapada' || kind === 'desviado';
  const [word, cls] = verdict(a.q);
  const react = penal && kind === 'tapada' ? { word: '¡LO ATAJASTE!', tone: 'is-save', buzz: GOAL_BUZZ } : REACT[kind];
  useEffect(() => {
    const t = setTimeout(() => vibrate(goal ? GOAL_BUZZ : react?.buzz), 550); // cuando la pelota llega
    return () => clearTimeout(t);
  }, [goal, react]);
  let scene;
  if (mo.type === 'pase') scene = <Cancha choice={a.choice} result={a} />;
  else if (mo.type === 'gambeta') scene = <Duelo choice={a.choice} result={a} />;
  else if (mo.type === 'quite') scene = <Quite choice={a.choice} result={{ ok: a.ok, kind }} />;
  else if (mo.type === 'atajada') {
    // Te tirás para un lado; la pelota va adonde pateó el rival. Si la sacaste tirado para el otro lado, fue con el pie.
    const shot = a.saved && a.shot !== a.choice ? 'pie' : SAVE_SHOT[kind];
    scene = <Arco mine choice={a.choice} result={{ keeper: a.choice, aim: a.shot, kind: shot }} />;
  } else scene = <Arco choice={a.choice} result={{ keeper: a.keeper, aim: a.choice, kind }} />;
  return (
    <div className={`card cr-moment cr-outcome is-${kind} ${goal ? 'is-goal' : good ? 'is-ok' : 'is-miss'}`} role="status">
      {goal && <span className="cr-flash" aria-hidden="true" />}
      {kind === 'golrival' && <span className="cr-flash is-bad" aria-hidden="true" />}
      <p className="kicker">{penal ? 'Definición por penales' : `Minuto ${mo.min}'`}</p>
      {scene}
      <div className="cr-after">
        {goal && !penal && <GolBanner mine={kind === 'gol'} mate={a.mate} counter={kind === 'contra'} name={state.player.name} celebration={CELEBRATIONS[(mo.min + i) % CELEBRATIONS.length]} />}
        {goal && penal && <Letters text="¡ADENTRO!" className="cr-react-word is-goal" />}
        {!goal && react && <Letters text={react.word} className={`cr-react-word ${react.tone}`} />}
        {kind !== 'asistencia' && <h3 className="cr-moment-text">{goal && !penal ? a.text.replace(/^¡Gol! /, '') : a.text}</h3>}
        <p className="small cr-exec"><Stars q={a.q} /> <span className={`cr-verdict is-inline ${cls}`}>{word}</span> <span className="muted">· ejecución {Math.round(a.q * 100)}/100</span></p>
        <button type="button" className="btn btn-solid" autoFocus onClick={onNext}>{kind === 'gambeta' ? 'Seguir la jugada' : 'Seguir'}</button>
      </div>
    </div>
  );
}

/** Salen los equipos: la previa del partido antes de la primera jugada. */
function Kickoff({ state, match, onStart }) {
  const velez = state.torneo.teams.find((x) => x.id === state.velez);
  const res = match.side === 'reserva';
  const sides = [{ name: res ? 'Vélez Res.' : 'Vélez', logo: velez?.logo, cls: 'is-v' }, { name: res ? `${match.rival.name} Res.` : match.rival.name, logo: match.rival.logo, cls: 'is-r' }];
  const [a, b] = match.home ? sides : [sides[1], sides[0]];
  const n = match.moments.length;
  return (
    <div className="card cr-kickoff">
      <p className="kicker">{match.label}{res ? ' · Reserva' : ''}</p>
      <p className="cr-kick-title">Salen los equipos</p>
      {match.big && <p className="cr-tag is-big">🔥 Partido grande: cada gol vale doble para la hinchada</p>}
      <div className="cr-kick-teams">
        <span className="cr-kick-team is-a"><Crest url={a.logo} size={64} /><b>{a.name}</b></span>
        <b className="cr-kick-vs" aria-hidden="true">VS</b>
        <span className="cr-kick-team is-b"><Crest url={b.logo} size={64} /><b>{b.name}</b></span>
      </div>
      <p className="small">
        {match.role === 'suplente'
          ? `Arrancás en el banco: entrás en el segundo tiempo y jugás ${n} jugadas.`
          : `Sos titular${res ? ' en la Reserva' : ''}: te van a llegar ${n} jugadas clave.`}
      </p>
      <button type="button" className="btn btn-solid cr-cta" autoFocus onClick={onStart}><span aria-hidden="true">📣</span> Pitazo inicial</button>
    </div>
  );
}

/** La línea del partido (0' a 90'): avance, entretiempo, goles de los dos y tus jugadas. */
function Timeline({ match, i, through, done }) {
  const cur = done ? 90 : Math.min(90, match.moments[i]?.min ?? 90);
  const events = done ? eventsAt(match) : eventsAt(match, i, through);
  const pos = (min) => `${(Math.min(min, 90) / 90) * 100}%`;
  return (
    <div className="cr-tl" role="img" aria-label={`Minuto ${cur} de 90. ${events.length} goles hasta ahora.`}>
      <span className="cr-tl-track"><i style={{ width: pos(cur) }} /></span>
      <span className="cr-tl-half" style={{ left: '50%' }} />
      {events.map((e, k) => <span key={`e${k}`} className={`cr-tl-goal ${e.team === 'v' ? 'is-v' : 'is-r'}`} style={{ left: pos(e.min) }} />)}
      {match.moments.map((mo, k) => {
        const a = match.answers[k];
        const kind = a && outcomeKind(mo.type, a);
        const cls = !a ? (k === i && !done ? 'is-now' : '') : kind === 'gol' || kind === 'asistencia' || kind === 'contra' ? 'is-goal'
          : a.ok || ['atajada', 'palo', 'tapada', 'desviado', 'salvada'].includes(kind) ? 'is-ok' : 'is-miss';
        return <span key={`m${k}`} className={`cr-tl-move ${cls}`} style={{ left: isPenalty(mo) ? '100%' : pos(mo.min) }} />;
      })}
      <small className="cr-tl-l" style={{ left: 0 }}>0'</small>
      <small className="cr-tl-l" style={{ left: '50%' }}>ET</small>
      <small className="cr-tl-l" style={{ left: '100%' }}>90'</small>
    </div>
  );
}

const FILLER = [
  'El partido está trabado en el medio.',
  'Vélez tiene la pelota, pero no encuentra espacios.',
  'El rival se defiende con todos atrás.',
  'La hinchada empuja desde la tribuna.',
  'Ida y vuelta: el partido está abierto.',
  'Mucha fricción y pocas situaciones.',
];

/** «Mientras tanto»: lo que pasó entre tu jugada anterior y esta (o hasta el final). */
function Relato({ match, i, done }) {
  const upTo = done ? eventsAt(match) : eventsAt(match, i);
  const prev = i > 0 ? eventsAt(match, i - 1, true) : [];
  const fresh = upTo.filter((e) => e.mi == null && !prev.includes(e));
  const lines = fresh.map((e) => (e.team === 'v'
    ? { min: e.min, icon: '⚽', cls: 'is-v', text: `${e.min}' ¡Gol de Vélez! La mandó a guardar ${e.who}.` }
    : { min: e.min, icon: '😖', cls: 'is-r', text: `${e.min}' Gol de ${match.rival.name}.` }));
  if (i === 0 && match.role === 'suplente' && !done) {
    const min = Math.max(46, match.moments[0].min - 4);
    lines.push({ min, icon: '🔁', cls: '', text: `${min}' Entrás a la cancha.` });
  }
  lines.sort((x, y) => x.min - y.min); // en orden de minuto
  if (!lines.length) lines.push({ icon: '🗣️', cls: 'is-calm', text: FILLER[((match.moments[i]?.min ?? 90) + i) % FILLER.length] });
  if (done) lines.push({ icon: '📣', cls: '', text: "90' Pitazo final." });
  return (
    <ul className="cr-relato" aria-label="Mientras tanto">
      {lines.map((l, k) => <li key={k} className={l.cls} style={{ '--i': k }}><span aria-hidden="true">{l.icon}</span> {l.text}</li>)}
    </ul>
  );
}

function Partido({ state, act }) {
  const m = state.torneo.match;
  const [kicked, setKicked] = useState(m.answers.length > 0);
  const [seen, setSeen] = useState(m.answers.length); // la última jugada ya vista (al recargar, ninguna pendiente)
  const pending = seen < m.answers.length; // hay una jugada recién jugada para mostrar
  const i = pending ? seen : m.answers.length;
  const done = matchDone(m) && !pending;
  if (!kicked) return <section className="cr-match" aria-label="Partido"><Kickoff state={state} match={m} onStart={() => setKicked(true)} /></section>;
  return (
    <section className="cr-match" aria-label="Partido">
      <p className="kicker">{m.label} · {ROLE_LABEL[m.role]}{m.home ? ' · Local' : ' · Visitante'}</p>
      <Marcador state={state} match={m} i={done ? undefined : i} through={pending} />
      <Timeline match={m} i={i} through={pending} done={done} />
      {pending && <Outcome key={`o${seen}`} state={state} match={m} i={seen} onNext={() => setSeen(seen + 1)} />}
      {!pending && !done && (
        <>
          <Relato key={`r${i}`} match={m} i={i} />
          <Momento key={i} moment={m.moments[i]} onAnswer={(a) => act(answerMoment, a)} />
        </>
      )}
      {done && (
        <div className="card cr-moment cr-whistle">
          <p className="cr-whistle-icon" aria-hidden="true">📣</p>
          <p className="kicker">Pitazo final</p>
          <Relato match={m} i={m.moments.length} done />
          <button type="button" className="btn btn-solid" autoFocus onClick={() => act(finishMatch)}>Ver cómo terminó</button>
        </div>
      )}
    </section>
  );
}

// ---------- Resultado ----------

function RatingRing({ rating }) {
  const shown = useCountUp(Math.round(rating * 10), true);
  return (
    <span className={`cr-ring ${ratingClass(rating)}`} style={{ '--p': shown }} aria-label={`Tu puntaje: ${rating.toFixed(1)}`}>
      <b className="num" aria-hidden="true">{(shown / 10).toFixed(1)}</b>
      <small aria-hidden="true">puntaje</small>
    </span>
  );
}

function Resultado({ state, act }) {
  const l = state.torneo.last;
  if (l.libre) {
    return (
      <div className="card cr-result" role="status">
        <p className="kicker">{l.label}</p>
        <h3 className="cr-title">Vélez tuvo fecha libre</h3>
        {l.earned > 0 && <p className="small">Cobraste el sueldo: <b>+{money(l.earned)}</b>.</p>}
        <button type="button" className="btn btn-solid" autoFocus onClick={() => act(dismissLast)}>Seguir</button>
      </div>
    );
  }
  const reserva = l.side === 'reserva';
  const line = (v, r) => (l.home ? `Vélez ${v} - ${r} ${l.rival.name}` : `${l.rival.name} ${r} - ${v} Vélez`);
  const pens = l.first.pens == null ? '' : l.first.pens ? ' (ganó por penales)' : ' (perdió por penales)';
  const won = l.own.v > l.own.r || (!reserva && l.first.pens === true);
  const lost = l.own.v < l.own.r || (!reserva && l.first.pens === false);
  const outcome = won ? ['Ganó Vélez', 'is-win'] : lost ? ['Perdió Vélez', 'is-loss'] : ['Empate', 'is-draw'];
  return (
    <div className={`card cr-result game-end is-fresh ${outcome[1]}`} role="status">
      {(l.rating >= 8 || l.news?.length > 0) && <Confetti />}
      <p className="kicker">{l.label}{reserva ? ' · Reserva' : ''}</p>
      {l.news?.length > 0 && (
        <ul className="cr-milestones">
          {l.news.map((n) => <li key={n}><span aria-hidden="true">🎉</span> {n}</li>)}
        </ul>
      )}
      <Badges ids={l.logros} fresh />
      <p className="cr-tags is-left">
        <span className={`cr-badge ${outcome[1]}`}>{outcome[0]}</span>
        {l.big && <span className="cr-tag is-big">🔥 Partido grande</span>}
        {l.figura && <span className="cr-tag is-figura">⭐ Figura del partido</span>}
        {l.clean && <span className="cr-tag is-clean">🔒 Valla invicta</span>}
        {l.penSaved && <span className="cr-tag is-figura">🖐️ Atajaste en los penales</span>}
      </p>
      <h3 className="cr-title">{reserva ? 'Reserva: ' : ''}{line(l.own.v, l.own.r)}{reserva ? '' : pens}</h3>
      {reserva && <p className="small muted">En Primera: {line(l.first.v, l.first.r)}{pens}.</p>}
      <div className="cr-result-main">
        <RatingRing rating={l.rating} />
        <ul className="cr-chips">
          {state.player.pos === 'arq' ? (
            <li><b className="num">{l.saves ?? 0}</b> {l.saves === 1 ? 'atajada' : 'atajadas'}</li>
          ) : state.player.pos === 'def' ? (
            <>
              <li><b className="num">{l.tackles ?? 0}</b> {l.tackles === 1 ? 'quite' : 'quites'}</li>
              {l.goals > 0 && <li><b className="num">{l.goals}</b> {l.goals === 1 ? 'gol' : 'goles'}</li>}
            </>
          ) : (
            <>
              <li><b className="num">{l.goals}</b> {l.goals === 1 ? 'gol' : 'goles'}</li>
              <li><b className="num">{l.assists}</b> {l.assists === 1 ? 'asistencia' : 'asistencias'}</li>
            </>
          )}
          <li className={l.dtDelta >= 0 ? 'is-up' : 'is-down'}><b className="num">{l.dtDelta >= 0 ? `▲ ${l.dtDelta}` : `▼ ${-l.dtDelta}`}</b> confianza del DT</li>
          {l.earned > 0 && <li className="is-money"><b className="num">+{money(l.earned)}</b>{l.prize ? ` (${money(l.prize)} de premio)` : ''}</li>}
        </ul>
      </div>
      <Prensa last={l} act={act} />
      <button type="button" className="btn btn-solid" autoFocus={!l.press} onClick={() => act(dismissLast)}>Seguir</button>
    </div>
  );
}

/** Conferencia de prensa: una pregunta y tres respuestas con sus efectos a la vista (se contesta una vez, o se saltea). */
function Prensa({ last, act }) {
  const p = last.press ? PRESS[last.press] : null;
  if (!p) return null;
  const chosen = last.pressChoice != null ? p.answers[last.pressChoice] : null;
  return (
    <div className="cr-press">
      <p className="kicker"><span aria-hidden="true">🎙️</span> Conferencia de prensa</p>
      <p className="cr-press-q">{p.q}</p>
      {chosen ? (
        <p className="cr-note" role="status">Respondiste: «{chosen.label}» <span className="cr-fx">{fxText(chosen.fx)}</span></p>
      ) : (
        <div className="cr-options is-pass">
          {p.answers.map((a, i) => (
            <button key={a.label} type="button" className="cr-opt" onClick={() => act(answerPress, i)}>
              <b>«{a.label}»</b>
              <small>{fxText(a.fx)}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- Fin del torneo ----------

function Fin({ state, act }) {
  const s = state.torneo.summary;
  const champ = s.result === 'Campeón';
  const next = torneoLabel(state.startYear, state.torneo.n + 1);
  const pos = state.player.pos;
  const [big, unit] = headline(pos, s);
  const text = `El Fortín · Carrera · ${state.player.name}\n${s.label}: ${s.pj} PJ, ${statsText(pos, s)}${s.avg ? `, puntaje ${s.avg}` : ''}\nVélez: ${s.result}`;
  return (
    <div className={`card cr-result game-end is-fresh${champ ? ' is-win cr-champ' : ''}`} role="status">
      {champ && <Confetti />}
      {champ && <p className="cr-trophy" aria-hidden="true">🏆</p>}
      <p className="kicker">Terminó el {s.label}</p>
      <h3 className="cr-title">{champ ? '¡Vélez campeón!' : `Vélez: ${s.result.toLowerCase()}`}</h3>
      {!champ && s.champion && <p className="small muted">Campeón: {s.champion}. Vélez terminó {s.pos}.º en su zona.</p>}
      <dl className="cr-stats">
        <div><dt>Partidos en Primera</dt><dd className="num">{s.pj}</dd></div>
        {statCols(pos).map(([k, label]) => <div key={k}><dt>{label}</dt><dd className="num">{s[k] ?? 0}</dd></div>)}
        <div><dt>Puntaje</dt><dd className="num">{s.avg ?? '–'}</dd></div>
        {s.goals && <div><dt>Metas cumplidas</dt><dd className="num">{s.goals.done}/{s.goals.total}</dd></div>}
      </dl>
      <Badges ids={s.logros} fresh />
      <ShareResult
        anchor="carrera" file="carrera-velez.png" text={text}
        card={() => ({ kicker: `Carrera · ${s.label}`, headline: state.player.name, big: true, center: `${big}`, sub: `${unit} en ${s.pj} partidos · Vélez: ${s.result}`, lines: ['Armá tu carrera en Vélez en El Fortín.'] })}
      />
      <Retiro state={state} act={act} next={next} />
    </div>
  );
}

/** Seguir o colgar los botines (desde los 33; a los 38 ya no hay opción). */
function Retiro({ state, act, next }) {
  const { can, must } = retireState(state);
  const [ask, setAsk] = useState(false);
  return (
    <div className="cr-retire">
      {must
        ? <p className="small">A los {Math.floor(state.player.age)} años llegó la hora: el cuerpo dice basta.</p>
        : <button type="button" className="btn btn-solid cr-go" onClick={() => act(nextTorneo)}>Jugar el {next}</button>}
      {can && !ask && !must && <button type="button" className="btn btn-outline" onClick={() => setAsk(true)}>Colgar los botines</button>}
      {(must || ask) && (
        <p className="cr-confirm">
          {must ? '' : '¿Seguro? La carrera termina acá. '}
          <button type="button" className="btn btn-solid" onClick={() => act(retire)}>{must ? 'Despedirme de Vélez' : 'Sí, me retiro'}</button>
          {!must && <button type="button" className="btn btn-outline" onClick={() => setAsk(false)}>No, sigo</button>}
        </p>
      )}
    </div>
  );
}

/** Tu lugar en la historia de Vélez: tus totales contra los máximos goleadores y presencias reales (club.json). */
function Historia({ state }) {
  const club = useJson('data/club.json');
  const tot = careerTotals(state);
  const rec = club?.records;
  const arq = state.player.pos === 'arq';
  const rows = rec ? [
    !arq && { label: 'Goleadores', unit: 'goles', value: tot.g, r: historicRank(rec.goleadores, 'goles', tot.g) },
    { label: 'Partidos', unit: 'partidos', value: tot.pj, r: historicRank(rec.presencias, 'partidos', tot.pj) },
  ].filter(Boolean) : [];
  return (
    <div className="card cr-historia">
      <p className="kicker"><span aria-hidden="true">📜</span> Tu lugar en la historia de Vélez</p>
      <dl className="cr-stats">
        <div><dt>Torneos</dt><dd className="num">{tot.torneos}</dd></div>
        <div><dt>Partidos en Primera</dt><dd className="num">{tot.pj}</dd></div>
        {arq ? <div><dt>Vallas invictas</dt><dd className="num">{tot.vi}</dd></div> : <div><dt>Goles</dt><dd className="num">{tot.g}</dd></div>}
        <div><dt>Títulos</dt><dd className="num">{tot.titulos}</dd></div>
      </dl>
      {rows.map(({ label, unit, value, r }) => r && (
        <div key={label} className="cr-rank">
          <p className="small">
            <b>{label}:</b>{' '}
            {r.rank ? <>sos el <b className="num">{r.rank}.º</b> de la historia{r.next ? `; te faltan ${r.gap} ${unit} para pasar a ${r.next.nombre} (${r.next.value}).` : '. ¡Nadie hizo más!'}</>
              : `te faltan ${r.gap} ${unit} para entrar entre los ${r.size} de la historia (pasar a ${r.next?.nombre}).`}
          </p>
          {r.next && <span className="cr-meter-bar" aria-hidden="true"><i style={{ width: `${Math.min(100, Math.round((value / r.next.value) * 100))}%` }} /></span>}
        </div>
      ))}
      {rec && <p className="muted small">Récords: Wikipedia (CC BY-SA). Sin contar a Cubero, como en el resto del sitio.</p>}
    </div>
  );
}

/** La despedida: la carrera completa, con su lugar en la historia, para compartir. */
function Despedida({ state, onReset }) {
  const tot = careerTotals(state);
  const logros = Object.keys(state.logros ?? {}).length;
  const [confirm, setConfirm] = useState(false);
  const pos = state.player.pos;
  const [big, unit] = headline(pos, tot);
  const text = `El Fortín · Carrera · ${state.player.name}\n${tot.torneos} torneos en Vélez: ${tot.pj} partidos, ${statsText(pos, tot)}, ${tot.titulos} títulos`;
  return (
    <>
      <div className="card cr-result cr-champ cr-farewell game-end is-fresh" role="status">
        <p className="cr-trophy" aria-hidden="true">👏</p>
        <p className="kicker">Fin de la carrera · {Math.floor(state.player.age)} años</p>
        <h3 className="cr-title">Gracias, {state.player.name}</h3>
        <p className="small">La tribuna te despide de pie. Te vas con {tot.titulos ? `${tot.titulos} ${tot.titulos === 1 ? 'título' : 'títulos'} y ` : ''}{logros} logros.</p>
        <dl className="cr-stats">
          <div><dt>Torneos</dt><dd className="num">{tot.torneos}</dd></div>
          <div><dt>Partidos</dt><dd className="num">{tot.pj}</dd></div>
          {statCols(pos).map(([k, label]) => <div key={k}><dt>{label}</dt><dd className="num">{tot[k] ?? 0}</dd></div>)}
        </dl>
        <ShareResult
          anchor="carrera" file="carrera-velez.png" text={text}
          card={() => ({ kicker: 'Carrera completa', headline: state.player.name, big: true, center: `${big}`, sub: `${unit} en ${tot.pj} partidos · ${tot.titulos} títulos`, lines: ['Armá tu carrera en Vélez en El Fortín.'] })}
        />
        {!confirm
          ? <button type="button" className="btn btn-outline" onClick={() => setConfirm(true)}>Empezar otra carrera</button>
          : (
            <p className="cr-confirm">
              Se borra esta carrera. <button type="button" className="btn btn-solid cr-danger-solid" onClick={onReset}>Sí, empezar de nuevo</button>
            </p>
          )}
      </div>
      <Historia state={state} />
    </>
  );
}

// ---------- La pestaña ----------

const VIEWS = [{ value: 'semana', label: 'Semana' }, { value: 'tabla', label: 'Tabla' }, { value: 'mejoras', label: 'Mejoras' }, { value: 'ficha', label: 'Ficha' }];

/** Mejoras para invertir la plata: se compran una vez y quedan para toda la carrera. */
function Mejoras({ state, act }) {
  const p = state.player;
  const cash = p.money ?? 0;
  return (
    <div className="card cr-shop">
      <p className="kicker"><span aria-hidden="true">💰</span> Tu plata: {money(cash)}</p>
      <p className="muted small">
        Cobrás {money(salaryOf(p))} por semana (sube con el rol, la media y los hinchas) y, en Primera, {money(GOAL_PRIZE)} por gol y
        {' '}{money(WIN_PRIZE)} por triunfo.
      </p>
      <ul className="cr-perks">
        {PERKS.map((k) => {
          const own = hasPerk(p, k.id);
          const short = k.cost - cash;
          return (
            <li key={k.id} className={own ? 'is-own' : undefined}>
              <span className="cr-perk-icon" aria-hidden="true">{k.icon}</span>
              <span className="cr-perk-text"><b>{k.title}</b><small>{k.desc}</small></span>
              {own
                ? <span className="cr-perk-own">✓ Tuya</span>
                : (
                  <button type="button" className="btn btn-solid cr-perk-buy" disabled={short > 0} onClick={() => act(buyPerk, k.id)}>
                    {money(k.cost)}
                    <span className="sr-only">{short > 0 ? `: te faltan ${money(short)}` : `: comprar ${k.title}`}</span>
                  </button>
                )}
              {!own && short > 0 && <small className="cr-perk-short" aria-hidden="true">Te faltan {money(short)}</small>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function Carrera({ standings, roster }) {
  const [state, setState] = useState(undefined); // undefined = leyendo lo guardado; null = no hay carrera
  const [view, setView] = useState('semana');
  const [saveFailed, setSaveFailed] = useState(false);
  useEffect(() => setState(migrate(load(SAVE_KEY, null))), []);
  const put = (next) => {
    setState(next);
    setSaveFailed(!save(SAVE_KEY, next));
  };
  const act = (fn, arg) => {
    const next = fn(state, arg);
    if (next !== state) put(next);
  };

  if (state === undefined) return <Skeletons className="sk-card" />;
  const disclaimer = (
    <p className="muted small">
      Juego de ficción: los rivales y los compañeros son los reales (ESPN), pero las fuerzas, los goles y los resultados los inventa el juego.
    </p>
  );
  if (!state) {
    return (
      <>
        <Crear standings={standings} roster={roster} onCreate={(s) => s && put(s)} onImport={put} />
        {disclaimer}
      </>
    );
  }
  const t = state.torneo;
  const reset = () => { put(null); setView('semana'); };
  let main;
  if (state.retired) main = <Despedida state={state} onReset={reset} />;
  else if (t.match) main = <Partido key={`${t.n}-${t.week}-${t.bracket?.rounds.length ?? 0}`} state={state} act={act} />;
  else if (t.last) main = <Resultado state={state} act={act} />;
  else if (t.phase === 'fin') main = <Fin state={state} act={act} />;
  else main = <Semana state={state} act={act} />;
  return (
    <div className="cr">
      {saveFailed && <p className="small cr-bad" role="alert">No se pudo guardar en este navegador (¿modo privado?): la carrera se pierde al cerrar la página.</p>}
      <Header state={state} />
      {!t.match && <Segmented options={VIEWS} value={view} onChange={setView} label="Qué ver" />}
      {t.match || view === 'semana' ? main
        : view === 'tabla' ? <Tabla state={state} />
          : view === 'mejoras' ? <Mejoras state={state} act={act} />
            : <Ficha state={state} onReset={reset} />}
      {disclaimer}
    </div>
  );
}

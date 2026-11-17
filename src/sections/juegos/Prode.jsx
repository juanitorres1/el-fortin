// Prode: el pronóstico del próximo partido, con los puntos de la temporada (lib/games.js).
import { useMemo, useState } from 'react';
import { VELEZ_ID, fetchTeamSchedule } from '../../lib/espn.js';
import { teamForm } from '../../lib/facts.js';
import { PRODE_POINTS, PRODE_QUICK, isKnockout, isOpen, prodeClosesIn, prodeLive, prodeReady, prodeSummary } from '../../lib/games.js';
import { useCached } from '../../hooks/data.js';
import { Crest, Empty, ResultBadge, Skeletons } from '../../components/ui.jsx';
import { ShareCardButton } from '../../components/ShareCard.jsx';
import { useStored } from './shared.jsx';
import { matchLabel, rivalOf, upcoming, whenLabel } from './partido.js';

const KIND_LABEL = { exacto: 'Exacto · 3 pts', resultado: 'Resultado · 1 pt', errado: 'Errado · 0 pts' };
const FORM_TTL_MS = 30 * 60 * 1000;
const LIST_SHORT = 5;
const pts = (n) => `${n} ${n === 1 ? 'punto' : 'puntos'}`;

// `value` null = todavía sin elegir (se ve «–»): el prode arranca sin marcador para no sesgar hacia el 1-0.
function Stepper({ label, value, onChange, disabled }) {
  const none = value == null;
  return (
    <div className="stepper" role="group" aria-label={`Goles de ${label}`}>
      <button type="button" className="step-btn" onClick={() => onChange(Math.max(0, value - 1))} disabled={disabled || none || value <= 0} aria-label={`Un gol menos para ${label}`}>−</button>
      <output className="num step-val" aria-live="polite" aria-label={none ? `${label}: sin elegir` : `${label}: ${value}`}>{none ? '–' : value}</output>
      <button type="button" className="step-btn" onClick={() => onChange(none ? 0 : Math.min(15, value + 1))} disabled={disabled} aria-label={none ? `Elegir goles de ${label} (empieza en 0)` : `Un gol más para ${label}`}>+</button>
    </div>
  );
}

/** Los últimos 5 de un equipo, del más viejo al más nuevo. Nada si no hay partidos. */
function FormRow({ team, form }) {
  return (
    <div className="prode-form-row">
      <span className="prode-form-team"><Crest url={team.logo} size={24} /><span>{team.name}</span></span>
      {form === undefined ? <span className="muted small">Cargando…</span>
        : !form ? <span className="muted small">Sin datos</span>
          : (
            <ol className="form-strip" aria-label={`Últimos ${form.last.length} resultados de ${team.name}, del más viejo al más reciente`}>
              {[...form.last].reverse().map((m) => (
                <li key={m.id} title={`${m.score} vs ${m.rival}`}>
                  <ResultBadge result={m.result} />
                  <span className="sr-only"> {m.score} contra {m.rival}</span>
                </li>
              ))}
            </ol>
          )}
    </div>
  );
}

export function Prode({ data, now }) {
  const [preds, setPreds] = useStored('prode', {});
  // Si Vélez está jugando, se muestra ese partido (cerrado y con cómo va el pronóstico); si no, el próximo.
  const live = data?.fixture.find((m) => m.status === 'in');
  const next = live ?? upcoming(data);
  const saved = next && preds[next.id];
  const [draft, setDraft] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const open = isOpen(next, now);
  const cur = draft ?? saved ?? { v: null, r: null };
  const summary = useMemo(() => prodeSummary(preds, data?.results ?? []), [preds, data]);
  const rival = next && rivalOf(next);
  const velezForm = useMemo(() => (data ? teamForm(data.results, VELEZ_ID) : undefined), [data]);
  // Cómo llega el rival: se pide a ESPN solo mientras se puede pronosticar (es para decidir).
  const rivalForm = useCached(open && rival ? `prode-forma-${rival.id}` : null, async () => teamForm(await fetchTeamSchedule(rival.id), rival.id), { ttl: FORM_TTL_MS });

  if (!data) return <Skeletons className="sk-card" />;
  const velezHome = next?.home.id === VELEZ_ID;
  const set = (k) => (v) => setDraft({ ...cur, [k]: v });
  const knockout = isKnockout(next);
  const draw = cur.v != null && cur.v === cur.r;
  const askPass = knockout && draw; // en eliminación, con empate hay que decir quién pasa
  const ready = prodeReady(cur, next);
  const changed = !saved || saved.v !== cur.v || saved.r !== cur.r || (askPass && saved.pass !== cur.pass);
  const passName = (p) => (p === 'v' ? 'Vélez' : rival?.name);
  const toSave = () => (askPass ? { v: cur.v, r: cur.r, pass: cur.pass } : { v: cur.v, r: cur.r });
  // Los marcadores siempre en el orden del partido (local-visitante), como en el tablero.
  const board = (p) => (velezHome ? `${p.v}-${p.r}` : `${p.r}-${p.v}`);
  const closes = prodeClosesIn(next, now);
  const liveScore = live && prodeLive(saved, live);
  const teams = next ? [velezHome ? ['v', next.home] : ['r', next.home], velezHome ? ['r', next.away] : ['v', next.away]] : [];
  const max = summary.played * PRODE_POINTS.exacto;
  const list = showAll ? summary.list : summary.list.slice(0, LIST_SHORT);
  return (
    <div className="games-grid">
      <div className="card prode">
        {next ? (
          <>
            <div className="prode-head">
              <div>
                <p className="kicker">{next.comp}{next.round && next.round !== next.comp ? ` · ${next.round.replace(/^Torneo /, '')}` : ''}</p>
                <p className="prode-when muted small">{whenLabel(next)}</p>
              </div>
              {live ? <span className="prode-chip is-live">En juego</span>
                : closes ? <span className="prode-chip">{closes}</span>
                  : <span className="prode-chip is-closed">Cerrado</span>}
            </div>
            {!open && <p className="kicker prode-cap">{saved ? 'Tu pronóstico' : 'Sin pronóstico'}</p>}
            <div className="prode-row">
              {teams.map(([k, team]) => (
                <div key={team.id} className={`prode-team${k === 'v' ? ' is-velez' : ''}`}>
                  <Crest url={team.logo} size={64} />
                  <span>{team.name}</span>
                  {open ? <Stepper label={team.name} value={cur[k]} onChange={set(k)} />
                    : <span className="num step-val">{saved ? saved[k] : '–'}</span>}
                </div>
              ))}
            </div>
            {open && (
              <div className="prode-quick" role="group" aria-label={`Atajos: marcador ${matchLabel(next)}`}>
                {PRODE_QUICK.map((q) => (
                  <button
                    key={`${q.v}-${q.r}`} type="button" className="seg num" aria-pressed={cur.v === q.v && cur.r === q.r}
                    aria-label={`Vélez ${q.v}, ${rival.name} ${q.r}`}
                    onClick={() => setDraft({ ...cur, v: q.v, r: q.r })}
                  >{board(q)}</button>
                ))}
              </div>
            )}
            {open && askPass && (
              <fieldset className="prode-pass">
                <legend>Empate en los 90: ¿quién pasa?</legend>
                <div className="prode-pass-opts">
                  {['v', 'r'].map((p) => (
                    <button key={p} type="button" className="seg" aria-pressed={cur.pass === p} onClick={() => setDraft({ ...cur, pass: p })}>{passName(p)}</button>
                  ))}
                </div>
              </fieldset>
            )}
            {open ? (
              <div className="cal-links">
                <button type="button" className="btn btn-solid" disabled={!changed || !ready} onClick={() => { setPreds((p) => ({ ...p, [next.id]: toSave() })); setDraft(null); }}>
                  {saved && !changed ? '✓ Pronóstico guardado' : saved ? 'Cambiar el pronóstico' : 'Guardar el pronóstico'}
                </button>
                {!ready && <p className="muted small prode-missing">{cur.v == null || cur.r == null ? 'Elegí los goles de los dos equipos.' : 'Elegí quién pasa.'}</p>}
                {saved && changed && <button type="button" className="link-btn small" onClick={() => setDraft(null)}>Dejar el guardado ({board(saved)}{saved.pass ? `, pasa ${passName(saved.pass)}` : ''})</button>}
                {saved && !changed && (
                  <ShareCardButton
                    label="Compartir mi pronóstico" file="prode-velez.png"
                    getCard={() => ({ kicker: whenLabel(next), headline: 'Mi pronóstico', big: true, center: board(saved), sub: saved.pass ? `${matchLabel(next)} · pasa ${passName(saved.pass)}` : matchLabel(next), lines: ['¿Y el tuyo? Jugá el prode en El Fortín.'] })}
                  />
                )}
              </div>
            ) : live ? (
              <p className="prode-live" aria-live="polite">
                <span>Va {live.home.name} <strong className="num">{live.home.score ?? 0}-{live.away.score ?? 0}</strong> {live.away.name}{live.clock ? ` (${live.clock})` : ''}.</span>{' '}
                {saved
                  ? <span>Dijiste {board(saved)}{saved.pass ? ` (pasa ${passName(saved.pass)})` : ''}{liveScore ? `: si termina así, sumás ${pts(liveScore.pts)}.` : '.'}</span>
                  : <span className="muted">No pronosticaste este partido.</span>}
              </p>
            ) : <p className="muted">{saved ? `Ya empezó: los puntos se suman cuando termine.${saved.pass ? ` Dijiste que pasa ${passName(saved.pass)}.` : ''}` : 'Ya empezó: el prode de este partido está cerrado.'}</p>}
            {open && (
              <section className="prode-form" aria-label="Cómo llegan">
                <h3 className="kicker">Cómo llegan · últimos partidos</h3>
                <FormRow team={next.home} form={velezHome ? velezForm : rivalForm} />
                <FormRow team={next.away} form={velezHome ? rivalForm : velezForm} />
              </section>
            )}
            <p className="muted small">
              {open ? 'Podés cambiarlo hasta que empiece el partido. ' : ''}Exacto: 3 puntos. Ganador o empate: 1 punto (cuentan los 90 minutos).
              {knockout ? ' Quién pasa queda en tu pronóstico, pero no suma puntos.' : ''}
            </p>
          </>
        ) : <Empty>No hay un próximo partido programado. Cuando ESPN publique la fecha, vas a poder pronosticarlo acá.</Empty>}
      </div>
      <div className="card">
        <h3 className="h3 games-h">Tu temporada</h3>
        {summary.played ? (
          <>
            <dl className="prode-stats">
              <div><dt>Puntos <span className="prode-of">de {max}</span></dt><dd className="num">{summary.pts}</dd></div>
              <div><dt>Exactos</dt><dd className="num">{summary.exact}</dd></div>
              <div><dt>Aciertos</dt><dd className="num">{summary.hits}/{summary.played}</dd></div>
            </dl>
            <ul className="prode-list">
              {list.map((x) => {
                const r = rivalOf(x.match);
                return (
                  <li key={x.id}>
                    <Crest url={r.logo} size={32} />
                    <span className="prode-li-main">
                      <strong>Vélez vs {r.name}</strong>
                      <small className="muted">Dijiste {x.pred.v}-{x.pred.r}{x.pred.pass ? ` (pasa ${x.pred.pass === 'v' ? 'Vélez' : r.name})` : ''} · salió {x.score.real}</small>
                    </span>
                    <span className={`po-chip prode-${x.score.kind}`}>{KIND_LABEL[x.score.kind]}</span>
                  </li>
                );
              })}
            </ul>
            {summary.played > LIST_SHORT && (
              <button type="button" className="link-btn" aria-expanded={showAll} onClick={() => setShowAll((s) => !s)}>
                {showAll ? 'Ver menos' : `Ver los ${summary.played} partidos`}
              </button>
            )}
          </>
        ) : <p className="muted">Cuando termine un partido que pronosticaste, acá vas a ver tus puntos. Queda guardado en este navegador.</p>}
      </div>
    </div>
  );
}

// Juegos. Del día (los mismos para todos, salen de la fecha): Trivia, Mano a Mano, El Tapado, Trayectoria V, Grilla
// del Fortín y El Once de Liniers (semanal). Del partido: Prode y «Adiviná el once». Y el modo Carrera, que se carga
// aparte (sections/juegos/carrera/) solo al abrir su pestaña. Se ve un juego por vez (pestañas,
// con el #hash en la URL). Lo que elige cada hincha queda en su navegador (lib/storage.js): no hay cuentas ni
// servidor. Se lee en efectos, después de hidratar.
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { mount } from '../main.jsx';
import { VELEZ_ID } from '../lib/espn.js';
import { DATA, TZ, capitalize, fmt, nextMatch } from '../lib/core.js';
import { GAMES, gameStreak, markPlayed, recordResult, resultStats } from '../lib/daily.js';
import { dailyTrivia, dayNumber, shareText } from '../lib/trivia.js';
import { ONCE_SIZE, isKnockout, isOpen, onceScore, prodeReady, prodeSummary, suspendedFor } from '../lib/games.js';
import { useJson, useLiveData, useNow, useRoster } from '../hooks/data.js';
import { useScrollToHash } from '../hooks/page.js';
import { Layout, PageBand } from '../components/Layout.jsx';
import { Crest, Empty, Skeletons } from '../components/ui.jsx';
import { ShareCardButton } from '../components/ShareCard.jsx';
import { Announcer, DailyStats, GameEnd, ShareResult, useAnnounce, useStored } from '../sections/juegos/shared.jsx';
import { ManoAMano } from '../sections/juegos/ManoAMano.jsx';
import { Tapado } from '../sections/juegos/Tapado.jsx';
import { Trayectoria } from '../sections/juegos/Trayectoria.jsx';
import { Grilla } from '../sections/juegos/Grilla.jsx';
import { Liniers } from '../sections/juegos/Liniers.jsx';

const Carrera = lazy(() => import('../sections/juegos/carrera/Carrera.jsx'));

const POS_GROUP = { G: 'Arqueros', D: 'Defensores', M: 'Mediocampistas', F: 'Delanteros' };
const POS_ORDER = ['G', 'D', 'M', 'F'];
const DAY_MONTH = new Intl.DateTimeFormat('es-AR', { timeZone: TZ, day: '2-digit', month: '2-digit' });
const KIND_LABEL = { exacto: 'Exacto · 3 pts', resultado: 'Resultado · 1 pt', errado: 'Errado · 0 pts' };

// El próximo partido para pronosticar: el que sigue en pie (un postergado no cuenta) y todavía no empezó.
const upcoming = (data) => {
  const m = data && nextMatch(data.fixture);
  return m && m.status !== 'in' ? m : undefined;
};

const rivalOf = (m) => (m.home.id === VELEZ_ID ? m.away : m.home);
const matchLabel = (m) => `${m.home.name} vs ${m.away.name}`;
const whenLabel = (m) => `${capitalize(fmt.long.format(new Date(m.date)))}${m.timeValid ? ` · ${fmt.time.format(new Date(m.date))} h` : ''}`;

// ---------- Trivia ----------

function Trivia({ club, onDone, streak }) {
  const now = useNow();
  const day = dayNumber(new Date(now));
  const questions = useMemo(() => (club ? dailyTrivia(club, day) : []), [club, day]);
  const [state, setState] = useStored('trivia', { day: null, answers: [] });
  const [history, setHistory] = useStored('trivia-history', {});
  const answers = state.day === day ? state.answers : [];
  const done = questions.length > 0 && answers.length === questions.length;
  const results = answers.map((a, i) => questions[i] && questions[i].options[a] === questions[i].answer);
  const score = results.filter(Boolean).length;
  const label = DAY_MONTH.format(new Date(now)); // «17/10»
  const [fresh, setFresh] = useState(false);
  const [said, say] = useAnnounce();
  // Al responder, las opciones quedan deshabilitadas: el foco pasa al enunciado de la pregunta siguiente (o, en la
  // última, a la tarjeta final, que se enfoca sola). Solo después de jugar, no al abrir la página.
  const heads = useRef([]);
  const moved = useRef(false);
  useEffect(() => {
    if (!moved.current || done) return;
    heads.current[answers.length]?.focus();
  }, [answers.length, done]);

  const answer = (qi, oi) => {
    if (answers.length !== qi) return;
    const next = [...answers, oi];
    const q = questions[qi];
    moved.current = true;
    say(`${q.options[oi] === q.answer ? '¡Bien!' : `No. Era «${q.answer}».`}${q.note ? ` ${q.note}` : ''}`);
    setState({ day, answers: next });
    if (next.length === questions.length) {
      const ok = next.filter((a, i) => questions[i].options[a] === questions[i].answer).length;
      setHistory((h) => recordResult(h, day, ok));
      setFresh(true);
      onDone('trivia');
    }
  };
  const st = resultStats(history, 'score', questions.length);

  if (club === undefined) return <Skeletons className="sk-card" />;
  if (!questions.length) return <Empty>La trivia no está disponible ahora.</Empty>;
  return (
    <>
      <Announcer text={said} />
      <ol className="trivia">
        {/* De a una: las respondidas y la que sigue. */}
        {questions.slice(0, answers.length + 1).map((q, qi) => {
          const picked = answers[qi];
          const answered = picked != null;
          return (
            <li key={q.id} className="card trivia-q">
              <p className="kicker">Pregunta {qi + 1} de {questions.length}</p>
              <h3 className="trivia-text" tabIndex={-1} ref={(el) => { heads.current[qi] = el; }}>{q.text}</h3>
              <div className="trivia-options">
                {q.options.map((o, oi) => {
                  const cls = !answered ? '' : o === q.answer ? ' is-right' : oi === picked ? ' is-wrong' : '';
                  return (
                    <button key={o} type="button" className={`trivia-opt${cls}`} disabled={answered} aria-pressed={answered ? oi === picked : undefined} onClick={() => answer(qi, oi)}>
                      {o}
                      {answered && o === q.answer && <span className="sr-only"> (respuesta correcta)</span>}
                    </button>
                  );
                })}
              </div>
              {answered && (
                <p className={`trivia-note ${q.options[picked] === q.answer ? 'is-right' : 'is-wrong'}`}>
                  <b>{q.options[picked] === q.answer ? '¡Bien!' : `Era «${q.answer}».`}</b>{q.note ? ` ${q.note}` : ''}
                </p>
              )}
            </li>
          );
        })}
      </ol>
      {done && (
        <GameEnd
          fresh={fresh} win={score === questions.length} kicker={`Trivia del ${label}`} score={`${score}/${questions.length}`}
          phrase={score === questions.length ? '¡Perfecto! Sabés todo de Vélez.' : score >= 3 ? 'Muy bien, hincha.' : 'Mañana hay otra.'}
          marks={results.map((r) => (r ? '🟦' : '⬜')).join('')}
          stats={<DailyStats streak={streak} stats={[['Jugadas', st.played], ['Promedio', st.avg != null ? `${String(st.avg).replace('.', ',')}/${questions.length}` : null], ['Perfectas', st.perfect]]} />}
        >
          <ShareResult
            anchor="trivia" file="trivia-velez.png" text={shareText(results, label)}
            card={() => ({ kicker: `Trivia del ${label}`, headline: 'Trivia de Vélez', big: true, center: `${score}/${questions.length}`, sub: results.map((r) => (r ? 'Bien' : 'Mal')).join(' · '), lines: ['¿Cuánto sabés vos? Jugá en El Fortín: 5 preguntas nuevas por día.'] })}
          />
        </GameEnd>
      )}
      <p className="muted small">Cinco preguntas por día, las mismas para todos y sin repetir hasta que pasen todas. Salen de la historia, el palmarés y los récords del club que están en este sitio.</p>
    </>
  );
}

// ---------- Prode ----------

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

function Prode({ data, now }) {
  const [preds, setPreds] = useStored('prode', {});
  const next = upcoming(data);
  const saved = next && preds[next.id];
  const [draft, setDraft] = useState(null);
  const open = isOpen(next, now);
  const cur = draft ?? saved ?? { v: null, r: null };
  const summary = useMemo(() => prodeSummary(preds, data?.results ?? []), [preds, data]);

  if (!data) return <Skeletons className="sk-card" />;
  const rival = next && rivalOf(next);
  const velezHome = next?.home.id === VELEZ_ID;
  const set = (k) => (v) => setDraft({ ...cur, [k]: v });
  const knockout = isKnockout(next);
  const draw = cur.v != null && cur.v === cur.r;
  const askPass = knockout && draw; // en eliminación, con empate hay que decir quién pasa
  const ready = prodeReady(cur, next);
  const changed = !saved || saved.v !== cur.v || saved.r !== cur.r || (askPass && saved.pass !== cur.pass);
  const passName = (p) => (p === 'v' ? 'Vélez' : rival?.name);
  const toSave = () => (askPass ? { v: cur.v, r: cur.r, pass: cur.pass } : { v: cur.v, r: cur.r });
  return (
    <div className="games-grid">
      <div className="card prode">
        {next ? (
          <>
            <p className="kicker">{next.comp}</p>
            <p className="prode-when muted small">{whenLabel(next)}</p>
            <div className="prode-row">
              {[velezHome ? ['v', next.home] : ['r', next.home], velezHome ? ['r', next.away] : ['v', next.away]].map(([k, team]) => (
                <div key={team.id} className="prode-team">
                  <Crest url={team.logo} size={48} />
                  <span>{team.name}</span>
                  <Stepper label={team.name} value={cur[k]} onChange={set(k)} disabled={!open} />
                </div>
              ))}
            </div>
            {askPass && (
              <fieldset className="prode-pass" disabled={!open}>
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
                  {saved && !changed ? 'Pronóstico guardado' : saved ? 'Cambiar el pronóstico' : 'Guardar el pronóstico'}
                </button>
                {!ready && <p className="muted small prode-missing">{cur.v == null || cur.r == null ? 'Elegí los goles de los dos equipos.' : 'Elegí quién pasa.'}</p>}
                {saved && (
                  <ShareCardButton
                    label="Compartir" file="prode-velez.png"
                    getCard={() => ({ kicker: whenLabel(next), headline: 'Mi pronóstico', big: true, center: velezHome ? `${saved.v}-${saved.r}` : `${saved.r}-${saved.v}`, sub: saved.pass ? `${matchLabel(next)} · pasa ${passName(saved.pass)}` : matchLabel(next), lines: ['¿Y el tuyo? Jugá el prode en El Fortín.'] })}
                  />
                )}
              </div>
            ) : <p className="muted">{saved ? `Tu pronóstico: Vélez ${saved.v}-${saved.r} ${rival.name}${saved.pass ? ` (pasa ${passName(saved.pass)})` : ''}. Ya empezó: se cierra hasta el final.` : 'Ya empezó: el prode de este partido está cerrado.'}</p>}
            <p className="muted small">
              {open ? 'Podés cambiarlo hasta que empiece el partido. ' : ''}Exacto: 3 puntos. Ganador o empate: 1 punto (cuentan los 90 minutos).
              {knockout ? ' Quién pasa queda en tu pronóstico, pero no suma puntos.' : ''}
            </p>
          </>
        ) : <Empty>No hay un próximo partido programado.</Empty>}
      </div>
      <div className="card">
        <h3 className="h3 games-h">Tu temporada</h3>
        {summary.played ? (
          <>
            <dl className="prode-stats">
              <div><dt>Puntos</dt><dd className="num">{summary.pts}</dd></div>
              <div><dt>Exactos</dt><dd className="num">{summary.exact}</dd></div>
              <div><dt>Aciertos</dt><dd className="num">{summary.hits}/{summary.played}</dd></div>
            </dl>
            <ul className="prode-list">
              {summary.list.slice(0, 6).map((x) => (
                <li key={x.id}>
                  <span><strong>{rivalOf(x.match).name}</strong><small className="muted">Dijiste {x.pred.v}-{x.pred.r}{x.pred.pass ? ` (pasa ${x.pred.pass === 'v' ? 'Vélez' : rivalOf(x.match).name})` : ''} · salió {x.score.real}</small></span>
                  <span className={`po-chip prode-${x.score.kind}`}>{KIND_LABEL[x.score.kind]}</span>
                </li>
              ))}
            </ul>
          </>
        ) : <p className="muted">Cuando termine un partido que pronosticaste, acá vas a ver tus puntos. Queda guardado en este navegador.</p>}
      </div>
    </div>
  );
}

// ---------- Adiviná el once ----------

function Once({ data, roster, games, now }) {
  const [picks, setPicks] = useStored('once', {});
  const stats = useJson(`${DATA}players.json`);
  const next = upcoming(data);
  const open = isOpen(next, now);
  const mine = (next && picks[next.id]) ?? [];
  const evaluated = useMemo(() => {
    const byId = new Map((games?.games ?? []).map((g) => [g.id, g]));
    return Object.entries(picks).map(([id, ids]) => ({ id, game: byId.get(id), score: onceScore(ids, byId.get(id)) })).filter((x) => x.score).sort((a, b) => Date.parse(b.game.date) - Date.parse(a.game.date));
  }, [picks, games]);

  if (!data || roster === undefined) return <Skeletons className="sk-card" />;
  const toggle = (id) => {
    if (!open) return;
    setPicks((p) => {
      const set = new Set(p[next.id] ?? []);
      if (set.has(id)) set.delete(id);
      else if (set.size < ONCE_SIZE) set.add(id);
      return { ...p, [next.id]: [...set] };
    });
  };
  const players = roster?.players ?? [];
  // Suspendidos para este partido (estimación con las tarjetas): se pueden elegir igual, pero avisados.
  const out = suspendedFor(stats?.discipline, next);
  const byPos = POS_ORDER.map((pos) => [pos, players.filter((p) => p.pos === pos).sort((a, b) => Number(a.jersey ?? 99) - Number(b.jersey ?? 99))]).filter(([, l]) => l.length);
  const last = evaluated[0];
  return (
    <>
      {last && (
        <div className="card once-result">
          <p className="kicker">Vs. {last.game.rival.name} · {last.game.label}</p>
          <p className="trivia-score"><b className="num">{last.score.hits}/{last.score.total}</b> titulares acertados</p>
          <ul className="once-starters">
            {last.score.starters.map((p) => <li key={p.id} className={last.score.hitIds.has(p.id) ? 'is-hit' : undefined}>{last.score.hitIds.has(p.id) ? '✓ ' : ''}{p.name}</li>)}
          </ul>
          <ShareCardButton
            label="Compartir" file="once-velez.png"
            getCard={() => ({ kicker: `Vs. ${last.game.rival.name} · ${last.game.label}`, headline: 'Adiviné el once', big: true, center: `${last.score.hits}/${last.score.total}`, sub: 'titulares acertados', lines: ['¿Vos cuántos sacás? Jugá en El Fortín.'] })}
          />
          {evaluated.length > 1 && <p className="muted small">Promedio: {(evaluated.reduce((n, x) => n + x.score.hits, 0) / evaluated.length).toFixed(1)} aciertos en {evaluated.length} partidos.</p>}
        </div>
      )}
      {!next ? <Empty>No hay un próximo partido programado.</Empty> : !players.length ? <Empty>El plantel no está disponible ahora.</Empty> : (
        <div className="card once">
          <div className="once-head">
            <div>
              <p className="kicker">Vs. {rivalOf(next).name}</p>
              <p className="muted small">{whenLabel(next)}</p>
            </div>
            <p className={`once-count num${mine.length === ONCE_SIZE ? ' is-full' : ''}`} aria-live="polite">{mine.length}/{ONCE_SIZE}</p>
          </div>
          {!open && <p className="muted">Ya empezó: el once quedó guardado como estaba. El resultado aparece cuando se actualicen los datos del partido.</p>}
          {byPos.map(([pos, list]) => (
            <fieldset key={pos} className="once-group" disabled={!open}>
              <legend>{POS_GROUP[pos]}</legend>
              <div className="once-grid">
                {list.map((p) => {
                  const on = mine.includes(p.id);
                  const susp = out.get(p.id);
                  return (
                    <button key={p.id} type="button" className={`once-player${susp ? ' is-susp' : ''}`} aria-pressed={on} disabled={!open || (!on && mine.length >= ONCE_SIZE)} onClick={() => toggle(p.id)} title={susp ? `${susp.text} (estimado)` : undefined}>
                      <span className="num">{p.jersey ?? '–'}</span>{p.name}
                      {susp && <small className="once-susp">Suspendido<span className="sr-only">: {susp.text.toLowerCase()}</span></small>}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ))}
          {out.size > 0 && <p className="muted small">«Suspendido»: le tocaría cumplir una fecha por tarjetas según los datos de ESPN. Es una estimación (lo define el Tribunal de Disciplina): podés elegirlo igual.</p>}
          <p className="muted small">Se guarda solo en este navegador. Podés cambiarlo hasta que empiece; después del partido te decimos cuántos acertaste.</p>
        </div>
      )}
    </>
  );
}

const ABOUT = {
  trivia: ['Trivia del día', 'Cinco preguntas de la historia del club.'],
  duelo: ['Mano a Mano', 'Diez duelos: ¿a quién le ganó más veces Vélez?'],
  tapado: ['El Tapado', 'Adiviná el jugador por sus datos.'],
  trayectoria: ['Trayectoria V', 'Adiviná el jugador por los clubes de su carrera.'],
  grilla: ['Grilla del Fortín', 'Nueve casillas, nueve jugadores que pasaron por Vélez.'],
  liniers: ['El Once de Liniers', 'Los once titulares de un partido para el recuerdo.'],
  prode: ['Prode', 'Tu pronóstico del próximo partido.'],
  once: ['Adiviná el once', 'Los titulares del próximo partido.'],
  carrera: ['Carrera', 'Salís de las inferiores: entrená, ganate el puesto y jugá las jugadas clave de cada partido.'],
};
const isGame = (key) => GAMES.some((g) => g.key === key);

function Juegos() {
  const state = useLiveData();
  const club = useJson('data/club.json');
  const games = useJson(`${DATA}games.json`);
  const roster = useRoster();
  const now = useNow(60_000);
  const day = dayNumber(new Date(now));
  const label = DAY_MONTH.format(new Date(now));
  // El juego elegido sigue al #hash (los links compartidos abren directo en su juego). Se lee al montar: el HTML del
  // deploy es el mismo para todos.
  const [tab, setTab] = useState('trivia');
  useEffect(() => {
    const read = () => {
      const key = location.hash.slice(1);
      if (isGame(key)) setTab(key);
    };
    read();
    addEventListener('hashchange', read);
    return () => removeEventListener('hashchange', read);
  }, []);
  const pick = (key) => {
    setTab(key);
    history.replaceState(null, '', `#${key}`);
  };
  // Racha: días seguidos con al menos un juego del día terminado (los de la trivia de antes también cuentan).
  const [log, setLog] = useStored('jugados', {});
  const [triviaDays] = useStored('trivia-history', {});
  const onDone = (game) => setLog((l) => markPlayed(l, day, game));
  const streak = gameStreak(log, day, Object.keys(triviaDays).map(Number));
  const doneToday = new Set(log[day] ?? []);
  useScrollToHash(club !== undefined && state.status !== 'loading');
  // En el celular las pestañas son una fila que se desliza: la elegida tiene que quedar a la vista.
  const tabsRef = useRef(null);
  useEffect(() => {
    const row = tabsRef.current;
    const on = row?.querySelector('[aria-pressed="true"]');
    if (on) row.scrollTo({ left: on.offsetLeft - (row.clientWidth - on.offsetWidth) / 2 });
  }, [tab]);
  const [title, about] = ABOUT[tab];
  return (
    <Layout page="juegos" band={<PageBand title="Juegos"><p className="lead">Seis juegos del día, el prode, el once y una carrera en Vélez. Para jugar con la V en el pecho.</p></PageBand>}>
      <nav className="games-tabs" aria-label="Elegir juego" ref={tabsRef}>
        {GAMES.map((g) => (
          <button key={g.key} type="button" className="seg" aria-pressed={g.key === tab} onClick={() => pick(g.key)}>
            {g.label}{doneToday.has(g.key) && <><span aria-hidden="true"> ✓</span><span className="sr-only"> (jugado hoy)</span></>}
          </button>
        ))}
      </nav>
      {streak > 0 && (
        <p className="games-streak" role="status" key={doneToday.size}>
          <span className="games-flame" aria-hidden="true">🔥</span><b className="num">{streak}</b> {streak === 1 ? 'día' : 'días seguidos'} jugando{doneToday.size ? '.' : ': jugá hoy para no cortar la racha.'}
        </p>
      )}
      <section className="block game-in" id={tab} key={tab} aria-labelledby="t-game">
        <div className="section-head"><h2 className="h2" id="t-game">{title}</h2></div>
        <p className="muted games-about">{about}</p>
        {tab === 'trivia' && <Trivia club={club} onDone={onDone} streak={streak} />}
        {tab === 'duelo' && <ManoAMano day={day} label={label} onDone={onDone} streak={streak} />}
        {tab === 'tapado' && <Tapado day={day} label={label} roster={roster} onDone={onDone} streak={streak} />}
        {tab === 'trayectoria' && <Trayectoria day={day} label={label} onDone={onDone} streak={streak} />}
        {tab === 'grilla' && <Grilla day={day} label={label} onDone={onDone} streak={streak} />}
        {tab === 'liniers' && <Liniers day={day} onDone={onDone} streak={streak} />}
        {tab === 'prode' && <Prode data={state.data} now={now} />}
        {tab === 'once' && <Once data={state.data} roster={roster} games={games} now={now} />}
        {tab === 'carrera' && (
          <Suspense fallback={<Skeletons className="sk-card" />}>
            <Carrera standings={state.data?.standings ?? (state.status === 'loading' ? undefined : null)} roster={roster} />
          </Suspense>
        )}
      </section>
    </Layout>
  );
}

export default Juegos;
mount(Juegos);

// Juegos: trivia diaria (sale de data/club.json), prode del próximo partido y «Adiviná el once». Lo que elige cada
// hincha queda en su navegador (lib/storage.js): no hay cuentas ni servidor. Se lee en efectos, después de hidratar.
import { useEffect, useMemo, useState } from 'react';
import { mount } from '../main.jsx';
import { VELEZ_ID } from '../lib/espn.js';
import { DATA, TZ, capitalize, fmt } from '../lib/core.js';
import { dailyTrivia, dayNumber, playStreak, shareText } from '../lib/trivia.js';
import { ONCE_SIZE, isOpen, onceScore, prodeSummary } from '../lib/games.js';
import { load, save } from '../lib/storage.js';
import { useJson, useLiveData, useNow, useRoster } from '../hooks/data.js';
import { useScrollToHash } from '../hooks/page.js';
import { Layout, PageBand } from '../components/Layout.jsx';
import { Crest, Empty, Skeletons } from '../components/ui.jsx';
import { ShareCardButton } from '../components/ShareCard.jsx';

const POS_GROUP = { G: 'Arqueros', D: 'Defensores', M: 'Mediocampistas', F: 'Delanteros' };
const POS_ORDER = ['G', 'D', 'M', 'F'];
const DAY_MONTH = new Intl.DateTimeFormat('es-AR', { timeZone: TZ, day: '2-digit', month: '2-digit' });
const KIND_LABEL = { exacto: 'Exacto · 3 pts', resultado: 'Resultado · 1 pt', errado: 'Errado · 0 pts' };

/** Estado guardado en el navegador: arranca vacío (igual que el HTML del deploy) y se lee al montar. */
function useStored(key, fallback) {
  const [value, setValue] = useState(fallback);
  useEffect(() => setValue(load(key, fallback)), [key]);
  const update = (next) => {
    setValue((prev) => {
      const v = typeof next === 'function' ? next(prev) : next;
      save(key, v);
      return v;
    });
  };
  return [value, update];
}

const rivalOf = (m) => (m.home.id === VELEZ_ID ? m.away : m.home);
const matchLabel = (m) => `${m.home.name} vs ${m.away.name}`;
const whenLabel = (m) => `${capitalize(fmt.long.format(new Date(m.date)))}${m.timeValid ? ` · ${fmt.time.format(new Date(m.date))} h` : ''}`;

// ---------- Trivia ----------

function Trivia({ club }) {
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
  const streak = playStreak(Object.keys(history).map(Number), day);
  const [copied, setCopied] = useState(false);

  const answer = (qi, oi) => {
    if (answers.length !== qi) return;
    const next = [...answers, oi];
    setState({ day, answers: next });
    if (next.length === questions.length) {
      const ok = next.filter((a, i) => questions[i].options[a] === questions[i].answer).length;
      setHistory((h) => ({ ...h, [day]: ok }));
    }
  };
  const shareResult = async () => {
    const text = `${shareText(results, label)}\n${location.href.split('#')[0]}#trivia`;
    try {
      if (navigator.share) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(text);
        setCopied(true);
      }
    } catch {
      /* canceló */
    }
  };

  if (club === undefined) return <Skeletons className="sk-card" />;
  if (!questions.length) return <Empty>La trivia no está disponible ahora.</Empty>;
  return (
    <>
      <ol className="trivia">
        {/* De a una: las respondidas y la que sigue. */}
        {questions.slice(0, answers.length + 1).map((q, qi) => {
          const picked = answers[qi];
          const answered = picked != null;
          return (
            <li key={q.id} className="card trivia-q">
              <p className="kicker">Pregunta {qi + 1} de {questions.length}</p>
              <h3 className="trivia-text">{q.text}</h3>
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
                <p className={`trivia-note ${q.options[picked] === q.answer ? 'is-right' : 'is-wrong'}`} role="status">
                  <b>{q.options[picked] === q.answer ? '¡Bien!' : `Era «${q.answer}».`}</b>{q.note ? ` ${q.note}` : ''}
                </p>
              )}
            </li>
          );
        })}
      </ol>
      {done && (
        <div className="card trivia-end" role="status">
          <p className="kicker">Trivia del {label}</p>
          <p className="trivia-score"><b className="num">{score}/{questions.length}</b> {score === questions.length ? '¡Perfecto! Sabés todo de Vélez.' : score >= 3 ? 'Muy bien, hincha.' : 'Mañana hay otra.'}</p>
          <p className="trivia-squares" aria-hidden="true">{results.map((r) => (r ? '🟦' : '⬜')).join('')}</p>
          {streak > 1 && <p className="muted">Llevás {streak} días seguidos jugando.</p>}
          <div className="cal-links">
            <button type="button" className="btn btn-solid" onClick={shareResult}>{copied ? 'Copiado: pegalo en WhatsApp' : 'Compartir el resultado'}</button>
            <ShareCardButton
              label="Compartir como imagen" file="trivia-velez.png"
              getCard={() => ({ kicker: `Trivia del ${label}`, headline: 'Trivia de Vélez', big: true, center: `${score}/${questions.length}`, sub: results.map((r) => (r ? 'Bien' : 'Mal')).join(' · '), lines: ['¿Cuánto sabés vos? Jugá en El Fortín: 5 preguntas nuevas por día.'] })}
            />
          </div>
        </div>
      )}
      <p className="muted small">Cinco preguntas por día, las mismas para todos. Salen de la historia, el palmarés y los récords del club que están en este sitio.</p>
    </>
  );
}

// ---------- Prode ----------

function Stepper({ label, value, onChange, disabled }) {
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" className="step-btn" onClick={() => onChange(Math.max(0, value - 1))} disabled={disabled || value <= 0} aria-label={`Un gol menos para ${label}`}>−</button>
      <output className="num step-val" aria-live="polite">{value}</output>
      <button type="button" className="step-btn" onClick={() => onChange(Math.min(15, value + 1))} disabled={disabled} aria-label={`Un gol más para ${label}`}>+</button>
    </div>
  );
}

function Prode({ data, now }) {
  const [preds, setPreds] = useStored('prode', {});
  const next = data?.fixture.find((m) => !m.completed && m.status !== 'in');
  const saved = next && preds[next.id];
  const [draft, setDraft] = useState(null);
  const open = isOpen(next, now);
  const cur = draft ?? saved ?? { v: 1, r: 0 };
  const summary = useMemo(() => prodeSummary(preds, data?.results ?? []), [preds, data]);

  if (!data) return <Skeletons className="sk-card" />;
  const rival = next && rivalOf(next);
  const velezHome = next?.home.id === VELEZ_ID;
  const set = (k) => (v) => setDraft({ ...cur, [k]: v });
  const changed = !saved || saved.v !== cur.v || saved.r !== cur.r;
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
            {open ? (
              <div className="cal-links">
                <button type="button" className="btn btn-solid" disabled={!changed} onClick={() => { setPreds((p) => ({ ...p, [next.id]: { v: cur.v, r: cur.r } })); setDraft(null); }}>
                  {saved && !changed ? 'Pronóstico guardado' : saved ? 'Cambiar el pronóstico' : 'Guardar el pronóstico'}
                </button>
                {saved && (
                  <ShareCardButton
                    label="Compartir" file="prode-velez.png"
                    getCard={() => ({ kicker: whenLabel(next), headline: 'Mi pronóstico', big: true, center: velezHome ? `${saved.v}-${saved.r}` : `${saved.r}-${saved.v}`, sub: matchLabel(next), lines: ['¿Y el tuyo? Jugá el prode en El Fortín.'] })}
                  />
                )}
              </div>
            ) : <p className="muted">{saved ? `Tu pronóstico: Vélez ${saved.v}-${saved.r} ${rival.name}. Ya empezó: se cierra hasta el final.` : 'Ya empezó: el prode de este partido está cerrado.'}</p>}
            <p className="muted small">{open ? 'Podés cambiarlo hasta que empiece el partido. ' : ''}Exacto: 3 puntos. Ganador o empate: 1 punto.</p>
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
                  <span><strong>{rivalOf(x.match).name}</strong><small className="muted">Dijiste {x.pred.v}-{x.pred.r} · salió {x.score.real}</small></span>
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
  const next = data?.fixture.find((m) => !m.completed && m.status !== 'in');
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
                  return (
                    <button key={p.id} type="button" className="once-player" aria-pressed={on} disabled={!open || (!on && mine.length >= ONCE_SIZE)} onClick={() => toggle(p.id)}>
                      <span className="num">{p.jersey ?? '–'}</span>{p.name}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ))}
          <p className="muted small">Se guarda solo en este navegador. Podés cambiarlo hasta que empiece; después del partido te decimos cuántos acertaste.</p>
        </div>
      )}
    </>
  );
}

function Juegos() {
  const state = useLiveData();
  const club = useJson('data/club.json');
  const games = useJson(`${DATA}games.json`);
  const roster = useRoster();
  const now = useNow(60_000);
  useScrollToHash(club !== undefined && state.status !== 'loading');
  return (
    <Layout page="juegos" band={<PageBand title="Juegos"><p className="lead">Trivia, prode y el once. Para jugar con la V en el pecho.</p></PageBand>}>
      <section className="block" id="trivia" aria-labelledby="t-trivia">
        <div className="section-head"><h2 className="h2" id="t-trivia">Trivia del día</h2></div>
        <Trivia club={club} />
      </section>
      <section className="block bleed bleed-gray" id="prode" aria-labelledby="t-prode">
        <div className="section-head"><h2 className="h2" id="t-prode">Prode</h2></div>
        <Prode data={state.data} now={now} />
      </section>
      <section className="block" id="once" aria-labelledby="t-once">
        <div className="section-head"><h2 className="h2" id="t-once">Adiviná el once</h2></div>
        <Once data={state.data} roster={roster} games={games} now={now} />
      </section>
    </Layout>
  );
}

export default Juegos;
mount(Juegos);

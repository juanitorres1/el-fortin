// Trivia del día: cinco preguntas de la historia del club (lib/trivia.js), las mismas para todos. Se juega de a una
// tarjeta: al responder aparece el dato (con la foto si la respuesta es un jugador con foto de Commons) y un botón para
// seguir; al final, el resultado y el repaso de las cinco.
import { useEffect, useMemo, useRef, useState } from 'react';
import { TZ } from '../../lib/core.js';
import { recordResult, resultStats } from '../../lib/daily.js';
import { photoOf } from '../../lib/players.js';
import { TRIVIA_TYPES, dailyTrivia, dayNumber, findPerson, shareText } from '../../lib/trivia.js';
import { loadJson, useNow } from '../../hooks/data.js';
import { Empty, Skeletons } from '../../components/ui.jsx';
import { Announcer, DailyStats, GameEnd, PlayerReveal, ShareResult, buzz, useAnnounce, useStored } from './shared.jsx';

const DAY_MONTH = new Intl.DateTimeFormat('es-AR', { timeZone: TZ, day: '2-digit', month: '2-digit' });
const PLAYERS = 'data/jugadores.json'; // el mismo pedido que la Grilla (loadJson lo pide una sola vez por página)
const calm = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function Trivia({ club, onDone, streak }) {
  const now = useNow();
  const day = dayNumber(new Date(now));
  const questions = useMemo(() => (club ? dailyTrivia(club, day) : []), [club, day]);
  const [state, setState] = useStored('trivia', { day: null, answers: [] });
  const [history, setHistory] = useStored('trivia-history', {});
  const answers = state.day === day ? state.answers : [];
  const total = questions.length;
  const done = total > 0 && answers.length === total;
  const isRight = (i) => questions[i] && questions[i].options[answers[i]] === questions[i].answer;
  const results = answers.map((_, i) => isRight(i));
  const score = results.filter(Boolean).length;
  const label = DAY_MONTH.format(new Date(now)); // «17/10»
  const [fresh, setFresh] = useState(false);
  const [said, say] = useAnnounce();
  // `seen` = la pregunta recién respondida que sigue en pantalla con su dato (null = la que toca, o el final).
  const [seen, setSeen] = useState(null);
  const view = seen ?? answers.length;
  const showEnd = done && seen == null;

  // Fotos: jugadores.json (~200 KB) se pide recién al responder la primera, y solo si hoy hay preguntas de personas.
  const [people, setPeople] = useState(null);
  const wantsPhotos = answers.length > 0 && questions.some((q) => q.person);
  useEffect(() => {
    if (!wantsPhotos || people) return;
    let on = true;
    loadJson(PLAYERS).then((json) => on && json && setPeople(json.players ?? null));
    return () => {
      on = false;
    };
  }, [wantsPhotos, people]);

  // La tarjeta en pantalla: la pregunta, lo elegido y, si la respuesta es un jugador con foto, su foto.
  const qi = Math.min(view, Math.max(total - 1, 0));
  const q = questions[qi];
  const picked = answers[qi];
  const answered = picked != null;
  const ok = answered && isRight(qi);
  const person = answered && q?.person ? findPerson(people, q.person) : null;
  const photo = person ? photoOf(person.img) : null;

  // Foco y scroll: al responder, el dato y el botón «Siguiente» quedan a la vista (el foco va al botón: las opciones
  // quedan deshabilitadas); al seguir, la tarjeta nueva sube y el foco va a su enunciado. Solo después de jugar. La foto
  // llega después (jugadores.json): cuando aparece, se vuelve a acomodar para que el botón no quede abajo de todo.
  const card = useRef(null);
  const head = useRef(null);
  const nextBtn = useRef(null);
  const feedback = useRef(null);
  const moved = useRef(false);
  useEffect(() => {
    if (!moved.current || showEnd) return;
    const smooth = calm() ? 'auto' : 'smooth';
    if (seen != null) {
      feedback.current?.scrollIntoView({ block: 'nearest', behavior: smooth });
      nextBtn.current?.focus({ preventScroll: true });
    } else {
      card.current?.scrollIntoView({ block: 'start', behavior: smooth });
      head.current?.focus({ preventScroll: true });
    }
  }, [seen, view, showEnd, photo?.src]);

  const answer = (qi, oi) => {
    if (answers.length !== qi) return;
    const next = [...answers, oi];
    const q = questions[qi];
    const ok = q.options[oi] === q.answer;
    moved.current = true;
    buzz(ok);
    say(`${ok ? '¡Bien!' : `No. Era «${q.answer}».`}${q.note ? ` ${q.note}` : ''}`);
    setState({ day, answers: next });
    setSeen(qi);
    if (next.length === total) {
      const right = next.filter((a, i) => questions[i].options[a] === questions[i].answer).length;
      setHistory((h) => recordResult(h, day, right));
      onDone('trivia');
    }
  };
  const goOn = () => {
    if (seen === total - 1) setFresh(true); // el final se enfoca solo (GameEnd)
    setSeen(null);
  };
  const st = resultStats(history, 'score', total);

  if (club === undefined) return <Skeletons className="sk-card" />;
  if (!total) return <Empty>La trivia no está disponible ahora.</Empty>;
  return (
    <>
      <Announcer text={said} />
      {!showEnd && (
        <ol className="trivia-progress" aria-label="Las cinco preguntas de hoy">
          {questions.map((x, i) => {
            const mark = i < answers.length ? (results[i] ? 'is-right' : 'is-wrong') : '';
            const current = i === view;
            return (
              <li key={x.id} className={`${mark}${current ? ' is-now' : ''}`} aria-current={current ? 'step' : undefined}>
                <span aria-hidden="true">{i < answers.length ? (results[i] ? '✓' : '✗') : i + 1}</span>
                <span className="sr-only">Pregunta {i + 1}: {i < answers.length ? (results[i] ? 'bien' : 'mal') : 'sin responder'}</span>
              </li>
            );
          })}
        </ol>
      )}
      {!showEnd && (
        <div ref={card} key={q.id} className="card trivia-q game-in">
          <p className="kicker">Pregunta {qi + 1} de {total}<span className="trivia-type"> · {TRIVIA_TYPES[q.type] ?? 'Historia'}</span></p>
          <h3 className="trivia-text" tabIndex={-1} ref={head}>{q.text}</h3>
          <div className="trivia-options">
            {q.options.map((o, oi) => {
              const cls = !answered ? '' : o === q.answer ? ' is-right' : oi === picked ? ' is-wrong' : ' is-off';
              return (
                <button key={o} type="button" className={`trivia-opt${cls}`} disabled={answered} aria-pressed={answered ? oi === picked : undefined} onClick={() => answer(qi, oi)}>
                  <span>{o}</span>
                  {answered && o === q.answer && <span className="trivia-icon" aria-hidden="true">✓</span>}
                  {answered && oi === picked && o !== q.answer && <span className="trivia-icon" aria-hidden="true">✗</span>}
                  {answered && o === q.answer && <span className="sr-only"> (respuesta correcta)</span>}
                </button>
              );
            })}
          </div>
          {answered && (
            <div ref={feedback} className={`trivia-feedback game-in ${ok ? 'is-right' : 'is-wrong'}`}>
              <p className="trivia-verdict"><b>{ok ? '¡Bien!' : 'No era.'}</b>{!ok && <> La respuesta: <b>{q.answer}</b>.</>}</p>
              {photo && <PlayerReveal player={{ n: person.n, photo }} />}
              {q.note && q.note !== q.text && <p className="trivia-note">{q.note}</p>}
              <button ref={nextBtn} type="button" className="btn btn-solid trivia-next" onClick={goOn}>
                {qi + 1 < total ? 'Siguiente pregunta' : 'Ver el resultado'}<span aria-hidden="true"> →</span>
              </button>
            </div>
          )}
        </div>
      )}
      {showEnd && (
        <>
          <GameEnd
            fresh={fresh} win={score === total} kicker={`Trivia del ${label}`} score={`${score}/${total}`}
            phrase={score === total ? '¡Perfecto! Sabés todo de Vélez.' : score >= 3 ? 'Muy bien, hincha.' : 'Mañana hay otra.'}
            marks={results.map((r) => (r ? '🟦' : '⬜')).join('')}
            stats={<DailyStats streak={streak} stats={[['Jugadas', st.played], ['Promedio', st.avg != null ? `${String(st.avg).replace('.', ',')}/${total}` : null], ['Perfectas', st.perfect]]} />}
          >
            <ShareResult
              anchor="trivia" file="trivia-velez.png" text={shareText(results, label)}
              card={() => ({ kicker: `Trivia del ${label}`, headline: 'Trivia de Vélez', big: true, center: `${score}/${total}`, sub: results.map((r) => (r ? 'Bien' : 'Mal')).join(' · '), lines: ['¿Cuánto sabés vos? Jugá en El Fortín: 5 preguntas nuevas por día.'] })}
            />
          </GameEnd>
          <section className="trivia-review" aria-labelledby="trivia-review-t">
            <h3 className="trivia-review-t" id="trivia-review-t">Repaso de hoy</h3>
            <ol>
              {questions.map((x, i) => (
                <li key={x.id} className={results[i] ? 'is-right' : 'is-wrong'}>
                  <span className="trivia-mark" aria-hidden="true">{results[i] ? '✓' : '✗'}</span>
                  <div>
                    <p className="trivia-review-q"><span className="sr-only">{results[i] ? 'Bien. ' : 'Mal. '}</span>{x.text}</p>
                    <p className="trivia-review-a">
                      <b>{x.answer}</b>
                      {!results[i] && <span className="muted"> · elegiste {x.options[answers[i]]}</span>}
                    </p>
                    {x.note && x.note !== x.text && (
                      <details className="trivia-more">
                        <summary>El dato</summary>
                        <p>{x.note}</p>
                      </details>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </>
      )}
      <p className="muted small">Cinco preguntas por día, las mismas para todos y sin repetir hasta que pasen todas. Salen de la historia, el palmarés y los récords del club que están en este sitio.</p>
    </>
  );
}

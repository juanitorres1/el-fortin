// Mano a Mano: 10 duelos por día entre dos rivales («¿a quién le ganó más veces Vélez?»), con el historial completo.
// Al elegir, el duelo muestra los dos números (suben contando, con una barra y su unidad). Si acertaste pasa solo al
// siguiente; si no, espera a «Siguiente» para que se pueda leer la respuesta. Al final, cada rival lleva a su historial.
import { useEffect, useMemo, useRef, useState } from 'react';
import { DATA } from '../../lib/core.js';
import { DUEL_STATS, dailyDuels, duelSentence, duelUnit, rivalHref } from '../../lib/duel.js';
import { resultStats, squares } from '../../lib/daily.js';
import { useJson } from '../../hooks/data.js';
import { Crest, Empty, Skeletons } from '../../components/ui.jsx';
import { Announcer, DailyStats, GameEnd, ShareResult, buzz, useAnnounce, useCountUp, useDaily, useResults } from './shared.jsx';

const REVEAL_MS = 2200; // lo que se ve un acierto antes de pasar al duelo siguiente (se puede tocar «Siguiente»)

function Side({ side, stat, top, picked, max, revealed, onPick }) {
  const value = useCountUp(side.value, revealed);
  const state = !revealed ? '' : top ? ' is-top' : ' is-low';
  return (
    <button type="button" className={`duel-opt${state}${picked ? ' is-picked' : ''}`} disabled={revealed} onClick={onPick}>
      {revealed && picked && <span className="duel-tag" aria-hidden="true">Tu respuesta</span>}
      <Crest url={side.logo} size={72} />
      <span className="duel-name">{side.name}</span>
      {revealed && (
        <>
          <b className="num duel-value">{value}</b>
          <span className="duel-unit">{DUEL_STATS[stat].unit[side.value === 1 ? 0 : 1]}{stat !== 'pj' && side.pj ? <small> en {side.pj} partidos</small> : null}</span>
          <span className="duel-bar" aria-hidden="true"><i style={{ width: `${Math.max(6, (side.value / max) * 100)}%` }} /></span>
          <span className="sr-only">{top ? ' (el mayor)' : ''}{picked ? ' (tu respuesta)' : ''}</span>
        </>
      )}
    </button>
  );
}

export function ManoAMano({ day, label, onDone, streak }) {
  const json = useJson(`${DATA}duelos.json`);
  const duels = useMemo(() => dailyDuels(json?.rows, day), [json, day]);
  const [game, setGame] = useDaily('duelo', day, { answers: [] });
  const answers = game.answers.slice(0, duels.length);
  const results = answers.map((a, i) => a === duels[i].answer);
  const done = duels.length > 0 && answers.length === duels.length;
  const score = results.filter(Boolean).length;
  // El duelo recién respondido queda un momento en pantalla con sus números (solo en esta visita: al volver a abrir
  // la página se ve el que sigue).
  const [reveal, setReveal] = useState(null);
  const [fresh, setFresh] = useState(false);
  const auto = reveal != null && reveal < answers.length && results[reveal];
  useEffect(() => {
    if (!auto) return undefined;
    const t = setTimeout(() => setReveal(null), REVEAL_MS);
    return () => clearTimeout(t);
  }, [auto, reveal]);
  const showing = reveal != null && reveal < answers.length ? reveal : null;
  const index = showing ?? answers.length;
  const current = duels[index];
  const [hist, record] = useResults('duelo');
  const [said, say] = useAnnounce();
  // Foco: al elegir, los dos botones quedan deshabilitados; el foco va a «Siguiente» y, al pasar al duelo que sigue,
  // a su pregunta (solo después de jugar, no al abrir la página). Al terminar, a la tarjeta final.
  const nextBtn = useRef(null);
  const head = useRef(null);
  const moved = useRef(false);
  useEffect(() => {
    if (!moved.current) return;
    if (showing != null) nextBtn.current?.focus();
    else if (!done) head.current?.focus();
  }, [showing, index, done]);

  const answer = (side) => {
    if (showing != null) return;
    const next = [...answers, side];
    const d = duels[answers.length];
    const ok = side === d.answer;
    moved.current = true;
    buzz(ok);
    say(`${ok ? '¡Bien!' : 'No.'} ${duelSentence(d)}`);
    setReveal(answers.length);
    setGame({ answers: next });
    if (next.length === duels.length) {
      record(day, next.filter((a, i) => a === duels[i].answer).length);
      setFresh(true);
      onDone('duelo');
    }
  };

  const st = resultStats(hist, 'score', duels.length);
  if (json === undefined) return <Skeletons className="sk-card" />;
  if (!duels.length) return <Empty>Mano a Mano no está disponible ahora.</Empty>;
  const max = current ? Math.max(current.a.value, current.b.value) : 1;
  return (
    <>
      <Announcer text={said} />
      <ol className="duel-dots" role="img" aria-label={answers.length ? `Llevás ${score} bien de ${answers.length} duelos` : `${duels.length} duelos por jugar`}>
        {duels.map((_, i) => <li key={i} className={i < answers.length ? (results[i] ? 'is-right' : 'is-wrong') : i === index ? 'is-now' : undefined} />)}
      </ol>
      {current && (
        <div className={`card duel${showing != null ? (results[showing] ? ' is-right' : ' is-wrong') : ''}`} key={index}>
          <p className="kicker">Duelo {index + 1} de {duels.length}{answers.length > 0 && <span className="duel-score"> · {score} {score === 1 ? 'acierto' : 'aciertos'}</span>}</p>
          <h3 className="trivia-text" tabIndex={-1} ref={head}>{current.text}</h3>
          <div className="duel-options">
            {['a', 'b'].map((s) => (
              <Side key={s} side={current[s]} stat={current.stat} top={current.answer === s} picked={answers[index] === s} max={max} revealed={showing != null} onPick={() => answer(s)} />
            ))}
            <span className="duel-vs" aria-hidden="true">VS</span>
          </div>
          {showing != null && (
            <div className="duel-verdict">
              <p>
                <b>{results[showing] ? '¡Bien!' : 'No era.'}</b>{' '}
                <span className="duel-says">{duelSentence(current)}</span>
              </p>
              <button ref={nextBtn} type="button" className={`btn ${auto ? 'btn-outline duel-next is-auto' : 'btn-solid duel-next'}`} style={{ '--wait': `${REVEAL_MS}ms` }} onClick={() => setReveal(null)}>
                {showing + 1 < duels.length ? 'Siguiente' : 'Ver el resultado'}
              </button>
            </div>
          )}
        </div>
      )}
      {done && showing == null && (
        <GameEnd fresh={fresh} win={score >= 7} kicker={`Mano a Mano del ${label}`} score={`${score}/${duels.length}`} phrase={score === duels.length ? '¡Perfecto! Te sabés el historial de memoria.' : score >= 7 ? 'Muy bien, hincha.' : 'Mañana hay otros diez.'} marks={squares(results)}
          stats={<DailyStats streak={streak} stats={[['Jugados', st.played], ['Promedio', st.avg != null ? `${String(st.avg).replace('.', ',')}/${duels.length}` : null], ['Mejor', st.best != null ? `${st.best}/${duels.length}` : null]]} />}
        >
          <ShareResult
            anchor="duelo" file="mano-a-mano-velez.png" text={`El Fortín · Mano a Mano ${label} · ${score}/${duels.length}\n${squares(results)}`}
            card={() => ({ kicker: `Mano a Mano del ${label}`, headline: 'Mano a Mano', big: true, center: `${score}/${duels.length}`, sub: 'duelos acertados', lines: ['¿A quién le ganó más veces Vélez? Jugá en El Fortín: 10 duelos nuevos por día.'] })}
          />
        </GameEnd>
      )}
      {answers.length > 0 && showing == null && (
        <details className="duel-history" open={done}>
          <summary>Tus respuestas ({score} de {answers.length})</summary>
          <ol className="duel-past">
            {answers.map((a, i) => {
              const d = duels[i];
              return (
                <li key={i} className={results[i] ? 'is-right' : 'is-wrong'}>
                  <span className="duel-mark" aria-hidden="true">{results[i] ? '✓' : '✗'}</span>
                  <span className="sr-only">{results[i] ? 'Bien: ' : 'Mal: '}</span>
                  <span className="duel-past-body">
                    <small className="muted">{d.text}</small>
                    {['a', 'b'].map((s) => (
                      <a key={s} className={`duel-rival${d.answer === s ? ' is-top' : ''}${a === s ? ' is-mine' : ''}`} href={rivalHref(d[s].id)}>
                        <Crest url={d[s].logo} size={28} />
                        <span className="duel-rival-name">{d[s].name}{a === s && <>{' '}<small className="duel-mine">Tu respuesta</small></>}</span>
                        <b className="num">{duelUnit(d.stat, d[s].value)}</b>
                      </a>
                    ))}
                  </span>
                </li>
              );
            })}
          </ol>
          <p className="muted small duel-hint">Tocá un rival para ver todos sus partidos contra Vélez.</p>
        </details>
      )}
      <p className="muted small">
        Diez duelos por día, los mismos para todos y cada vez más parejos. Cuentan los partidos oficiales del historial de este sitio
        (desde 1919; entre 1931 y 2000, solo Primera División y copas internacionales). Un partido definido por penales cuenta como empate.
      </p>
    </>
  );
}

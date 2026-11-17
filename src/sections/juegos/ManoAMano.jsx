// Mano a Mano: 10 duelos por día entre dos rivales («¿a quién le ganó más veces Vélez?»), con el historial completo.
// Al elegir, el duelo muestra los dos números (suben contando, con una barra) y pasa solo al siguiente.
import { useEffect, useMemo, useRef, useState } from 'react';
import { DATA } from '../../lib/core.js';
import { dailyDuels } from '../../lib/duel.js';
import { resultStats, squares } from '../../lib/daily.js';
import { useJson } from '../../hooks/data.js';
import { Crest, Empty, Skeletons } from '../../components/ui.jsx';
import { Announcer, DailyStats, GameEnd, ShareResult, buzz, useAnnounce, useCountUp, useDaily, useResults } from './shared.jsx';

const REVEAL_MS = 1700; // lo que se ve el resultado antes de pasar al duelo siguiente (se puede tocar «Siguiente»)

function Side({ side, top, picked, max, revealed, onPick }) {
  const value = useCountUp(side.value, revealed);
  const state = !revealed ? '' : top ? ' is-top' : ' is-low';
  return (
    <button type="button" className={`duel-opt${state}${picked ? ' is-picked' : ''}`} disabled={revealed} onClick={onPick}>
      <Crest url={side.logo} size={56} />
      <span className="duel-name">{side.name}</span>
      {revealed && (
        <>
          <b className="num duel-value">{value}</b>
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
  useEffect(() => {
    if (reveal == null) return undefined;
    const t = setTimeout(() => setReveal(null), REVEAL_MS);
    return () => clearTimeout(t);
  }, [reveal]);
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
    say(`${ok ? '¡Bien!' : 'No.'} ${d.a.name} ${d.a.value}, ${d.b.name} ${d.b.value}.`);
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
          <p className="kicker">Duelo {index + 1} de {duels.length}</p>
          <h3 className="trivia-text" tabIndex={-1} ref={head}>{current.text}</h3>
          <div className="duel-options">
            {['a', 'b'].map((s) => (
              <Side key={s} side={current[s]} top={current.answer === s} picked={answers[index] === s} max={max} revealed={showing != null} onPick={() => answer(s)} />
            ))}
            <span className="duel-vs" aria-hidden="true">VS</span>
          </div>
          {showing != null && (
            <p className="duel-verdict">
              <span>
                <b>{results[showing] ? '¡Bien!' : 'No.'}</b>{' '}
                <span className="duel-nums">{current.a.name} <b className="num">{current.a.value}</b> · {current.b.name} <b className="num">{current.b.value}</b></span>
              </span>
              <button ref={nextBtn} type="button" className="btn btn-outline" onClick={() => setReveal(null)}>{showing + 1 < duels.length ? 'Siguiente' : 'Ver el resultado'}</button>
            </p>
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
                  <span>
                    <small className="muted">{d.text}</small>
                    <span className="duel-line">
                      {['a', 'b'].map((s) => <span key={s} className={d.answer === s ? 'is-top' : undefined}><Crest url={d[s].logo} size={18} /> {d[s].name} <b className="num">{d[s].value}</b></span>)}
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>
        </details>
      )}
      <p className="muted small">
        Diez duelos por día, los mismos para todos y cada vez más parejos. Cuentan los partidos oficiales del historial de este sitio
        (desde 1919; entre 1931 y 2000, solo Primera División y copas internacionales). Un partido definido por penales cuenta como empate.
      </p>
    </>
  );
}

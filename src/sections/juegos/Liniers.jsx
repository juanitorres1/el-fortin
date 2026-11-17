// El Once de Liniers: los 11 titulares de un partido recordado, con el dorsal y el puesto a la vista. Cambia los
// domingos. Se escribe un jugador: si fue titular, aparece en su lugar; si no, se pierde una vida.
import { useMemo, useState } from 'react';
import { resultStats, squares, weekNumber } from '../../lib/daily.js';
import { ONCE_LIVES, onceNames, onceOfWeek, photoOf } from '../../lib/players.js';
import { teamLogo, VELEZ_ID } from '../../lib/espn.js';
import { useJson } from '../../hooks/data.js';
import { Crest, Empty, ExtLink, Skeletons } from '../../components/ui.jsx';
import { Announcer, Avatar, DailyStats, GameEnd, PlayerSearch, ShareResult, buzz, useAnnounce, useDaily, useFlash, useResults } from './shared.jsx';

const LINES = ['G', 'D', 'M', 'F'];
const LINE_NAME = { G: 'Arquero', D: 'Defensores', M: 'Mediocampistas', F: 'Delanteros' };
const DATE = new Intl.DateTimeFormat('es-AR', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' });

export function Liniers({ day, onDone, streak }) {
  const json = useJson('data/onces.json');
  const week = weekNumber(day);
  const once = useMemo(() => onceOfWeek(json?.onces, day), [json, day]);
  const names = useMemo(() => onceNames(json?.onces), [json]);
  const [game, setGame] = useDaily('liniers', week, { found: [], wrong: [] });
  const [flash, fire] = useFlash();
  const [fresh, setFresh] = useState(false);
  const [hist, record] = useResults('liniers'); // por semana: la clave es el número de semana
  const [said, say] = useAnnounce();

  if (json === undefined) return <Skeletons className="sk-card" />;
  if (!once) return <Empty>El Once de Liniers no está disponible ahora.</Empty>;
  const found = new Set(game.found);
  const lost = game.wrong.length >= ONCE_LIVES;
  const done = lost || found.size === once.players.length;
  const results = once.players.map((p) => found.has(p.n));
  const score = results.filter(Boolean).length;
  const match = `${once.home ? 'Vélez' : once.rival} ${once.home ? once.score : once.score.split('-').reverse().join('-')} ${once.home ? once.rival : 'Vélez'}`;

  const guess = (p) => {
    if (done) return;
    const hit = once.players.some((x) => x.n === p.n);
    const next = hit ? { found: [...game.found, p.n] } : { wrong: [...game.wrong, p.n] };
    setGame(next);
    buzz(hit);
    fire(hit ? p.n : 'miss');
    const x = once.players.find((y) => y.n === p.n);
    const lives = ONCE_LIVES - game.wrong.length - (hit ? 0 : 1);
    say(hit ? `¡Sí! ${p.n} fue titular${x?.num != null ? ` con la ${x.num}` : ''}. Llevás ${game.found.length + 1} de ${once.players.length}.` : `${p.n} no fue titular. Te quedan ${lives} ${lives === 1 ? 'vida' : 'vidas'}.`);
    if ((hit && game.found.length + 1 === once.players.length) || (!hit && game.wrong.length + 1 >= ONCE_LIVES)) {
      record(week, game.found.length + (hit ? 1 : 0));
      setFresh(true);
      onDone('liniers');
    }
  };

  const st = resultStats(hist, 'score', once.players.length);
  return (
    <>
      <Announcer text={said} />
      <div className="card liniers">
        <p className="kicker">{once.title}</p>
        <div className="liniers-match">
          {[once.home, !once.home].map((velez, i) => (
            <span key={i} className="liniers-team">
              <Crest url={teamLogo(velez ? VELEZ_ID : once.rivalId)} size={44} />
              <span>{velez ? 'Vélez' : once.rival}</span>
            </span>
          ))}
          <b className="num liniers-score">{once.home ? once.score : once.score.split('-').reverse().join('-')}</b>
        </div>
        <h3 className="sr-only">{match}</h3>
        <p className="muted small">{DATE.format(new Date(`${once.date}T12:00:00Z`))} · <ExtLink href={once.src}>fuente</ExtLink></p>
        {LINES.map((line) => (
          <div key={line} className="liniers-line">
            <p className="liniers-pos">{LINE_NAME[line]}</p>
            <ul>
              {once.players.filter((p) => p.pos === line).map((p) => {
                const shown = found.has(p.n) || done;
                return (
                  <li key={p.n} className={`${found.has(p.n) ? 'is-hit' : done ? 'is-miss' : ''}${flash === p.n ? ' is-new' : ''}`}>
                    {shown ? <Avatar photo={photoOf(p.img)} name={p.n} size={32} /> : <span className="avatar avatar-none liniers-shirt" aria-hidden="true">?</span>}
                    <span className="num">{p.num ?? '–'}</span>
                    {shown ? p.n : <><span aria-hidden="true">? ? ?</span><span className="sr-only">Sin adivinar</span></>}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        {!done && (
          <>
            <p className={`liniers-lives${flash === 'miss' ? ' is-shake' : ''}`}>
              <span aria-hidden="true">{'●'.repeat(ONCE_LIVES - game.wrong.length)}{'○'.repeat(game.wrong.length)}</span>{' '}
              Te quedan {ONCE_LIVES - game.wrong.length} de {ONCE_LIVES} vidas{game.wrong.length ? ` · No jugaron de titular: ${game.wrong.join(', ')}` : ''}
            </p>
            <PlayerSearch list={names} onPick={guess} exclude={new Set([...game.found, ...game.wrong])} label="Escribí un titular de ese partido" detail={`Encontraste ${score} de ${once.players.length}. Te quedan ${ONCE_LIVES - game.wrong.length} vidas.`} shake={flash === 'miss'} />
          </>
        )}
      </div>
      {done && (
        <GameEnd fresh={fresh} win={score === once.players.length} kicker={`El Once de Liniers · ${once.title}`} score={`${score}/${once.players.length}`} phrase={score === once.players.length ? '¡Los once! Estuviste en la cancha.' : 'El domingo hay otro once.'} marks={squares(results)}
          stats={<DailyStats weekly streak={streak} stats={[['Semanas jugadas', st.played], ['Promedio', st.avg != null ? `${String(st.avg).replace('.', ',')}/${once.players.length}` : null], ['Completos', st.perfect]]} />}
        >
          <ShareResult
            anchor="liniers" file="once-de-liniers.png" text={`El Fortín · El Once de Liniers · ${once.title} · ${score}/${once.players.length}\n${squares(results)}`}
            card={() => ({ kicker: once.title, headline: 'El Once de Liniers', big: true, center: `${score}/${once.players.length}`, sub: 'titulares acertados', lines: [match, '¿Vos cuántos sacás? Un once histórico por semana en El Fortín.'] })}
          />
        </GameEnd>
      )}
      <p className="muted small">Un partido por semana: cambia los domingos. Solo valen los titulares, con el nombre como figura en la fuente.</p>
    </>
  );
}

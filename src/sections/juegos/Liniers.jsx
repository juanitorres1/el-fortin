// El Once de Liniers: los 11 titulares de un partido recordado, parados en la cancha con el dorsal y el puesto a la
// vista. Cambia los domingos. Se escribe un jugador: si fue titular, aparece en su lugar (con su foto, si la hay);
// si no, se pierde una vida. Tocando una camiseta se ve al jugador (foto grande con su crédito) o, si falta, se piden
// sus iniciales a cambio de una vida.
import { useMemo, useRef, useState } from 'react';
import { resultStats, squares, weekNumber } from '../../lib/daily.js';
import { ONCE_LIVES, POS_NAME, onceFormation, onceInitials, onceNames, onceOfWeek, onceProgress, onceRows, onceShort, photoOf } from '../../lib/players.js';
import { teamLogo, VELEZ_ID } from '../../lib/espn.js';
import { useJson } from '../../hooks/data.js';
import { Crest, Empty, ExtLink, Skeletons } from '../../components/ui.jsx';
import { Announcer, Avatar, DailyStats, GameEnd, PlayerReveal, PlayerSearch, ShareResult, buzz, useAnnounce, useDaily, useFlash, useResults } from './shared.jsx';

const LINE_NAME = { G: 'Arquero', D: 'Defensores', M: 'Mediocampistas', F: 'Delanteros' };
const DATE = new Intl.DateTimeFormat('es-AR', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' });
const lives = (n) => `${n} ${n === 1 ? 'vida' : 'vidas'}`;
const calm = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const shirt = (p) => (p.num != null ? `la ${p.num}` : 'sin número');

export function Liniers({ day, onDone, streak }) {
  const json = useJson('data/onces.json');
  const week = weekNumber(day);
  const once = useMemo(() => onceOfWeek(json?.onces, day), [json, day]);
  const names = useMemo(() => onceNames(json?.onces), [json]);
  const rows = useMemo(() => onceRows(once?.players), [once]);
  const [game, setGame] = useDaily('liniers', week, { found: [], wrong: [], hints: [] });
  const [flash, fire] = useFlash();
  const [fresh, setFresh] = useState(false);
  const [sel, setSel] = useState(null); // índice del jugador tocado en la cancha
  const [hist, record] = useResults('liniers'); // por semana: la clave es el número de semana
  const [said, say] = useAnnounce();
  const panel = useRef(null);

  if (json === undefined) return <Skeletons className="sk-card" />;
  if (!once) return <Empty>El Once de Liniers no está disponible ahora.</Empty>;
  const pr = onceProgress(once, game);
  const { found, done, score, total } = pr;
  const score2 = once.home ? once.score : once.score.split('-').reverse().join('-');
  const match = `${once.home ? 'Vélez' : once.rival} ${score2} ${once.home ? once.rival : 'Vélez'}`;
  const picked = sel != null ? once.players[sel] : null;

  const update = (patch) => {
    const next = onceProgress(once, { ...game, ...patch });
    setGame(patch);
    if (next.done && !pr.done) {
      record(week, next.score);
      setFresh(true);
      onDone('liniers');
    }
    return next;
  };

  const guess = (p) => {
    if (done) return;
    const i = once.players.findIndex((x) => x.n === p.n);
    const hit = i >= 0;
    const next = update(hit ? { found: [...game.found, p.n] } : { wrong: [...game.wrong, p.n] });
    buzz(hit);
    fire(hit ? p.n : 'miss');
    if (hit) setSel(i);
    const x = once.players[i];
    say(hit
      ? `¡Sí! ${p.n} fue titular con ${shirt(x)}, de ${POS_NAME[x.pos].toLowerCase()}. Llevás ${next.score} de ${total}.`
      : `${p.n} no fue titular. Te ${next.lives === 1 ? 'queda' : 'quedan'} ${lives(next.lives)}.`);
  };

  const hint = (p) => {
    if (!pr.canHint || pr.hints.has(p.n)) return;
    const next = update({ hints: [...(game.hints ?? []), p.n] });
    say(`Pista para ${shirt(p)}: ${onceInitials(p.n)} Te ${next.lives === 1 ? 'queda' : 'quedan'} ${lives(next.lives)}.`);
  };

  // Tocar una camiseta abre (o cierra) su ficha debajo de la cancha; si quedó fuera de la pantalla, se acerca.
  const pick = (i) => {
    const open = sel !== i;
    setSel(open ? i : null);
    if (open) setTimeout(() => panel.current?.scrollIntoView?.({ block: 'nearest', behavior: calm() ? 'auto' : 'smooth' }), 0);
  };

  // Las fotos que están a la vista en la cancha, para el crédito.
  const credits = once.players.filter((p) => p.img && (found.has(p.n) || done)).map((p) => [p.n, photoOf(p.img)]);
  const st = resultStats(hist, 'score', total);
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
          <b className="num liniers-score">{score2}</b>
        </div>
        <h3 className="sr-only">{match}</h3>
        <p className="muted small lp-meta">
          {DATE.format(new Date(`${once.date}T12:00:00Z`))} · {once.home ? 'de local' : 'de visitante'} · Formación {onceFormation(once.players)} · <ExtLink href={once.src}>fuente</ExtLink>
        </p>

        <div className="lp-status">
          <p><b className="num">{score}</b>/{total} <span className="muted">titulares</span></p>
          {!done && (
            <p className={flash === 'miss' ? 'is-shake' : ''}>
              <span className="lp-hearts" aria-hidden="true">{'●'.repeat(pr.lives)}<span>{'○'.repeat(ONCE_LIVES - pr.lives)}</span></span>{' '}
              {lives(pr.lives)}
            </p>
          )}
        </div>

        {!done && (
          <>
            <PlayerSearch list={names} onPick={guess} exclude={new Set([...game.found, ...game.wrong])} label="Escribí un titular de ese partido" detail={`Encontraste ${score} de ${total}. Te quedan ${lives(pr.lives)}.`} shake={flash === 'miss'} />
            {game.wrong.length > 0 && (
              <div className="lp-wrong">
                <p className="small muted">No fueron titulares:</p>
                <ul>{game.wrong.map((n) => <li key={n}>{n}</li>)}</ul>
              </div>
            )}
          </>
        )}

        <div className="lp-pitch" role="group" aria-label={`La cancha: formación ${onceFormation(once.players)}, de los delanteros al arquero`}>
          {rows.map((row) => (
            <ul key={row[0].pos} className="lp-row" aria-label={LINE_NAME[row[0].pos]}>
              {row.map((p) => {
                const hit = found.has(p.n);
                const shown = hit || done;
                const hinted = pr.hints.has(p.n);
                const photo = shown ? photoOf(p.img) : null;
                const state = hit ? 'is-hit' : done ? 'is-miss' : hinted ? 'is-hint' : '';
                const label = shown
                  ? `${p.n}, ${shirt(p)}, ${POS_NAME[p.pos].toLowerCase()}${hit ? '' : ', no lo sacaste'}`
                  : `Falta ${shirt(p)}, ${POS_NAME[p.pos].toLowerCase()}${hinted ? `, iniciales ${onceInitials(p.n)}` : ''}`;
                return (
                  <li key={p.n} className={`lp-spot ${state}${flash === p.n ? ' is-new' : ''}${sel === p.i ? ' is-sel' : ''}`}>
                    <button type="button" className="lp-btn" aria-pressed={sel === p.i} aria-label={label} onClick={() => pick(p.i)}>
                      <span className="lp-shirt" aria-hidden="true">
                        {photo ? <Avatar photo={photo} name={p.n} num={p.num} size={44} /> : <span className="num">{p.num ?? '?'}</span>}
                        {photo && p.num != null && <span className="lp-badge num">{p.num}</span>}
                      </span>
                      <span className="lp-name" aria-hidden="true">{shown ? onceShort(p.n) : hinted ? onceInitials(p.n) : '¿?'}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ))}
        </div>

        <div className="lp-panel" ref={panel}>
          {!picked && <p className="muted small">Tocá una camiseta para ver al jugador{done ? '' : ' o pedir sus iniciales'}.</p>}
          {picked && (found.has(picked.n) || done) && (
            <PlayerReveal key={picked.n} player={{ n: picked.n, photo: photoOf(picked.img), jersey: picked.num }}
              sub={`${picked.num != null ? `La ${picked.num} · ` : ''}${POS_NAME[picked.pos]}${found.has(picked.n) ? '' : ' · no lo sacaste'}`} />
          )}
          {picked && !found.has(picked.n) && !done && (
            <div className="lp-ask">
              <p><b>{picked.num != null ? `La ${picked.num}` : 'Sin número'}</b> · {POS_NAME[picked.pos]}</p>
              {pr.hints.has(picked.n)
                ? <p>Iniciales: <b className="lp-initials">{onceInitials(picked.n)}</b></p>
                : pr.canHint
                  ? <button type="button" className="btn btn-outline" onClick={() => hint(picked)}>Ver las iniciales · cuesta 1 vida</button>
                  : <p className="muted small">Con la última vida no hay pistas: jugate.</p>}
            </div>
          )}
        </div>

        {credits.length > 0 && (
          <details className="lp-credits small">
            <summary>Créditos de las fotos ({credits.length})</summary>
            <ul>{credits.map(([n, ph]) => <li key={n}>{n}: <ExtLink href={ph.href}>{ph.credit}</ExtLink></li>)}</ul>
          </details>
        )}
      </div>
      {done && (
        <GameEnd fresh={fresh} win={pr.win} kicker={`El Once de Liniers · ${once.title}`} score={`${score}/${total}`} phrase={pr.win ? '¡Los once! Estuviste en la cancha.' : 'El domingo hay otro once.'} marks={squares(pr.results)}
          stats={<DailyStats weekly streak={streak} stats={[['Semanas jugadas', st.played], ['Promedio', st.avg != null ? `${String(st.avg).replace('.', ',')}/${total}` : null], ['Completos', st.perfect]]} />}
        >
          <ShareResult
            anchor="liniers" file="once-de-liniers.png" text={`El Fortín · El Once de Liniers · ${once.title} · ${score}/${total}\n${squares(pr.results)}`}
            card={() => ({ kicker: once.title, headline: 'El Once de Liniers', big: true, center: `${score}/${total}`, sub: 'titulares acertados', lines: [match, '¿Vos cuántos sacás? Un once histórico por semana en El Fortín.'] })}
          />
        </GameEnd>
      )}
      <p className="muted small">Un partido por semana: cambia los domingos. Solo valen los titulares, con el nombre como figura en la fuente. Cada error o pista cuesta una vida.</p>
    </>
  );
}

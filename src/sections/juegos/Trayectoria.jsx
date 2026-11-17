// Trayectoria V: adivinar un jugador que pasó por Vélez viendo su carrera. Los años y Vélez se ven siempre; cada
// intento fallido destapa un club más.
import { useMemo, useState } from 'react';
import { resultStats, squares } from '../../lib/daily.js';
import { PATH_TRIES, POS_NAME, historicPlayers, pathOfDay, pathView } from '../../lib/players.js';
import { useJson } from '../../hooks/data.js';
import { Crest, Empty, Skeletons } from '../../components/ui.jsx';
import { Announcer, Avatar, DailyStats, GameEnd, PlayerSearch, ShareResult, buzz, useAnnounce, useDaily, useFlash, useResults } from './shared.jsx';

const years = (s) => (s.from == null ? '' : s.to == null ? `${s.from}–` : s.to === s.from ? String(s.from) : `${s.from}–${s.to}`);

export function Trayectoria({ day, label, onDone, streak }) {
  const json = useJson('data/jugadores.json');
  const players = useMemo(() => historicPlayers(json), [json]);
  const [game, setGame] = useDaily('trayectoria', day, { guesses: [], answer: null });
  const target = useMemo(() => players.find((p) => p.id === game.answer) ?? pathOfDay(players, day), [players, game.answer, day]);
  const [flash, fire] = useFlash();
  const [fresh, setFresh] = useState(false);
  const [hist, record] = useResults('trayectoria');
  const [said, say] = useAnnounce();

  if (json === undefined) return <Skeletons className="sk-card" />;
  if (!target) return <Empty>Trayectoria V no está disponible ahora.</Empty>;
  const guesses = game.guesses.map((id) => players.find((p) => p.id === id)).filter(Boolean);
  const won = guesses.some((p) => p.id === target.id);
  const done = won || guesses.length >= PATH_TRIES;
  const fails = guesses.filter((p) => p.id !== target.id).length;
  const view = pathView(target, fails, done);
  // El club que se acaba de destapar (el último visible que no es Vélez) entra con animación.
  const opened = flash === 'miss' && !done ? view.steps.findLastIndex((s) => !s.hidden && !s.velez) : -1;
  const sub = [target.pos.map((x) => POS_NAME[x]).join(' / '), target.nat.join(' / ')].filter(Boolean).join(' · ');
  const marks = squares(Array.from({ length: PATH_TRIES }, (_, i) => won && i === guesses.length - 1));

  const guess = (p) => {
    if (done) return;
    const next = [...game.guesses, p.id];
    setGame({ guesses: next, answer: target.id });
    buzz(p.id === target.id);
    fire(p.id === target.id ? 'hit' : 'miss');
    if (p.id !== target.id && next.length < PATH_TRIES) {
      // El club que se destapa con este fallo, para el lector de pantalla.
      const shown = pathView(target, fails + 1, false).steps.filter((x) => !x.hidden && !x.velez);
      const club = shown.at(-1);
      say(`${p.n}: no es. ${club ? `Se destapó ${club.club}${club.from != null ? ` (${years(club)})` : ''}.` : ''} Te quedan ${PATH_TRIES - next.length} intentos.`);
    }
    if (p.id === target.id || next.length >= PATH_TRIES) {
      record(day, p.id === target.id ? next.length : 0);
      setFresh(true);
      onDone('trayectoria');
    }
  };

  const st = resultStats(hist, 'guess');
  return (
    <>
      <Announcer text={said} />
      <div className="card path">
        <p className="kicker">{done ? target.n : `¿Quién es? · Intento ${Math.min(guesses.length + 1, PATH_TRIES)} de ${PATH_TRIES}`}</p>
        {!done && <p className="tries" aria-hidden="true">{Array.from({ length: PATH_TRIES }, (_, i) => <i key={i} className={i < guesses.length ? 'is-used' : undefined} />)}</p>}
        <ol className="path-steps">
          {view.steps.map((s, i) => (
            <li key={i} className={`${s.velez ? 'is-velez' : s.hidden ? 'is-hidden' : ''}${i === opened ? ' is-open' : ''}`}>
              <span className="num path-years">{years(s)}</span>
              {s.hidden ? <span className="path-crest path-unknown" aria-hidden="true">?</span> : <span className="path-crest"><Crest url={s.logo} size={32} /></span>}
              <span className="path-club">
                {s.hidden ? 'Club tapado' : s.club}
                {!s.hidden && !s.velez && s.pais && <small className="muted"> · {s.pais}</small>}
              </span>
            </li>
          ))}
        </ol>
        {view.hint && <p className="path-hint"><b>Pista:</b> {view.hint}</p>}
        {!done && guesses.length > 0 && (
          <ul className="path-wrong" aria-label="No es">
            {guesses.map((p) => <li key={p.id}><Avatar photo={p.photo} name={p.n} size={24} /><s>{p.n}</s></li>)}
          </ul>
        )}
        {!done && <PlayerSearch list={players} onPick={guess} exclude={new Set(game.guesses)} label="¿Quién es? Escribí el nombre del jugador" detail={`Intento ${guesses.length + 1} de ${PATH_TRIES}`} shake={flash === 'miss'} />}
      </div>
      {done && (
        <GameEnd fresh={fresh} win={won} player={target} sub={sub} kicker={`Trayectoria V del ${label}`} score={won ? `${guesses.length}/${PATH_TRIES}` : 'X'} phrase={won ? `¡Era ${target.n}!` : `Era ${target.n}. Mañana hay otro.`} marks={marks}
          stats={<DailyStats streak={streak} stats={[['Jugados', st.played], ['Acertados', st.played ? `${st.wins} (${st.pct} %)` : null], ['Intentos promedio', st.avg != null ? String(st.avg).replace('.', ',') : null]]} />}
        >
          <ShareResult
            anchor="trayectoria" file="trayectoria-velez.png" text={`El Fortín · Trayectoria V ${label} · ${won ? guesses.length : 'X'}/${PATH_TRIES}\n${marks}`}
            card={() => ({ kicker: `Trayectoria V del ${label}`, headline: 'Trayectoria V', big: true, center: won ? `${guesses.length}/${PATH_TRIES}` : 'X', sub: won ? 'intentos' : 'no lo saqué', lines: ['¿Vos lo sacás por su carrera? Un jugador por día en El Fortín.'] })}
          />
        </GameEnd>
      )}
      <p className="muted small">Un jugador por día. Cada intento fallido destapa un club; al tercero aparecen el puesto y el país. Trayectorias de Wikidata: puede haber errores u omisiones.</p>
    </>
  );
}

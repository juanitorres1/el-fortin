// Trayectoria V: adivinar un jugador que pasó por Vélez viendo su carrera. Los años y Vélez se ven siempre; cada
// intento fallido (o «Destapar un club», que gasta un intento sin arriesgar) destapa un club más, y desde el segundo
// fallo se suma una pista (país, puesto, año de nacimiento).
import { useMemo, useState } from 'react';
import { resultStats, squares } from '../../lib/daily.js';
import { PATH_TRIES, POS_NAME, historicPlayers, pathClues, pathOfDay, pathState, pathView } from '../../lib/players.js';
import { useJson } from '../../hooks/data.js';
import { Crest, Empty, Skeletons } from '../../components/ui.jsx';
import { Announcer, Avatar, DailyStats, GameEnd, PlayerSearch, ShareResult, buzz, useAnnounce, useDaily, useFlash, useResults } from './shared.jsx';

const years = (s) => (s.from == null ? '' : s.to == null ? `${s.from}–` : s.to === s.from ? String(s.from) : `${s.from}–${s.to}`);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

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
  const { tries, won, fails, done, left } = pathState(game.guesses, target.id);
  const view = pathView(target, fails, done);
  const clues = pathClues(target, fails, done);
  const hidden = view.steps.filter((s) => s.hidden).length;
  // El club que se acaba de destapar entra con animación; el próximo en destaparse va marcado.
  const missed = (flash === 'miss' || flash === 'pass') && !done;
  const before = missed ? pathView(target, fails - 1).steps : null;
  const opened = before ? view.steps.findIndex((s, i) => !s.hidden && before[i].hidden) : -1;
  const next = done ? -1 : view.steps.findIndex((s) => s.hidden);
  const wrong = game.guesses.map((id, i) => ({ i, p: id == null ? null : players.find((x) => x.id === id) })).filter((g) => g.p !== undefined && g.p?.id !== target.id);
  const velezYears = target.v?.from ? `En Vélez ${years(target.v)}` : '';
  const sub = [target.pos.map((x) => POS_NAME[x]).join(' / '), target.nat.join(' / '), velezYears].filter(Boolean).join(' · ');
  const marks = squares(Array.from({ length: PATH_TRIES }, (_, i) => won && i === tries - 1));

  // Lo que se destapa con un fallo más, para el lector de pantalla.
  const revealText = () => {
    const club = pathView(target, fails + 1, false).steps.filter((x) => !x.hidden && !x.velez).at(-1);
    const clue = pathClues(target, fails + 1).find((c) => c.at === fails + 1);
    return [club && `Se destapó ${club.club}${club.from != null ? ` (${years(club)})` : ''}.`, clue && `Pista: ${clue.label.toLowerCase()} ${clue.value}.`].filter(Boolean).join(' ');
  };

  const play = (id) => {
    if (done) return;
    const nextGuesses = [...game.guesses, id];
    const hit = id === target.id;
    setGame({ guesses: nextGuesses, answer: target.id });
    buzz(hit);
    fire(hit ? 'hit' : id == null ? 'pass' : 'miss');
    if (!hit && nextGuesses.length < PATH_TRIES) {
      const who = id == null ? 'Pasaste.' : `${players.find((x) => x.id === id)?.n ?? 'Ese'}: no es.`;
      say(`${who} ${revealText()} ${left - 1 === 1 ? 'Te queda 1 intento.' : `Te quedan ${left - 1} intentos.`}`);
    }
    if (hit || nextGuesses.length >= PATH_TRIES) {
      record(day, hit ? nextGuesses.length : 0);
      setFresh(true);
      onDone('trayectoria');
    }
  };

  const st = resultStats(hist, 'guess');
  return (
    <>
      <Announcer text={said} />
      <div className="card path tray">
        <div className="tray-head">
          <p className="kicker">{done ? target.n : `¿Quién es? · Intento ${Math.min(tries + 1, PATH_TRIES)} de ${PATH_TRIES}`}</p>
          <p className="muted small">{done ? 'La carrera completa' : `${plural(view.steps.length, 'etapa', 'etapas')} · ${hidden ? plural(hidden, 'club tapado', 'clubes tapados') : 'todo a la vista'}`}</p>
        </div>
        {!done && <p className="tries" aria-hidden="true">{Array.from({ length: PATH_TRIES }, (_, i) => <i key={i} className={i < tries ? 'is-used' : undefined} />)}</p>}
        <ol className="path-steps tray-line">
          {view.steps.map((s, i) => (
            <li key={i} className={['tray-step', s.velez ? 'is-velez' : s.hidden ? 'is-hidden' : 'is-shown', i === opened && 'is-open', i === next && 'is-next'].filter(Boolean).join(' ')}>
              <span className="num path-years">{years(s)}</span>
              {s.hidden
                ? <span className="path-crest path-unknown" aria-hidden="true">?</span>
                : <span className="path-crest"><Crest url={s.logo} size={40} /></span>}
              <span className="path-club">
                {s.hidden ? (i === next ? <span className="tray-tag">Próximo club</span> : 'Club tapado') : s.club}
                {!s.hidden && !s.velez && s.pais && <small className="muted tray-pais"><span className="sr-only">, </span>{s.pais}</small>}
              </span>
            </li>
          ))}
        </ol>
        {clues.length > 0 && (
          <ul className="tray-clues" aria-label="Pistas">
            {clues.map((c) => (
              <li key={c.key} className={c.open ? (missed && c.at === fails ? 'is-on is-new' : 'is-on') : undefined}>
                <span className="tray-clue-label">{c.label}</span>
                {c.open ? <b>{c.value}</b> : <span className="tray-clue-lock">con {c.at} fallos</span>}
              </li>
            ))}
          </ul>
        )}
        {!done && wrong.length > 0 && (
          <ul className="path-wrong" aria-label="Intentos que no fueron">
            {wrong.map(({ i, p }) => (p
              ? <li key={i}><Avatar photo={p.photo} name={p.n} size={24} /><s>{p.n}</s></li>
              : <li key={i} className="tray-pass">Pasaste</li>))}
          </ul>
        )}
        {!done && (
          <div className="tray-play">
            <PlayerSearch list={players} onPick={(p) => play(p.id)} exclude={new Set(game.guesses)} label="¿Quién es? Escribí el nombre del jugador" detail={`Intento ${tries + 1} de ${PATH_TRIES}`} shake={flash === 'miss'} />
            {left > 1 && hidden > 0 && (
              <p className="tray-skip">
                <button type="button" className="btn btn-outline" onClick={() => play(null)}>Destapar un club</button>
                <span className="muted small">¿Ni idea? Gastás un intento sin arriesgar.</span>
              </p>
            )}
          </div>
        )}
      </div>
      {done && (
        <GameEnd fresh={fresh} win={won} player={target} sub={sub} kicker={`Trayectoria V del ${label}`} score={won ? `${tries}/${PATH_TRIES}` : 'X'} phrase={won ? `¡Era ${target.n}!` : `Era ${target.n}. Mañana hay otro.`} marks={marks}
          stats={<DailyStats streak={streak} stats={[['Jugados', st.played], ['Acertados', st.played ? `${st.wins} (${st.pct} %)` : null], ['Intentos promedio', st.avg != null ? String(st.avg).replace('.', ',') : null]]} />}
        >
          <ShareResult
            anchor="trayectoria" file="trayectoria-velez.png" text={`El Fortín · Trayectoria V ${label} · ${won ? tries : 'X'}/${PATH_TRIES}\n${marks}`}
            card={() => ({ kicker: `Trayectoria V del ${label}`, headline: 'Trayectoria V', big: true, center: won ? `${tries}/${PATH_TRIES}` : 'X', sub: won ? 'intentos' : 'no lo saqué', lines: ['¿Vos lo sacás por su carrera? Un jugador por día en El Fortín.'] })}
          />
        </GameEnd>
      )}
      <p className="muted small">Un jugador por día. Cada intento fallido destapa un club, del primero de su carrera en adelante; desde el segundo se suman pistas: país, puesto y año de nacimiento. Trayectorias de Wikidata: puede haber errores u omisiones.</p>
    </>
  );
}

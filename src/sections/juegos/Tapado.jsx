// El Tapado: adivinar un jugador por sus datos. Cada intento dice qué coincide (✓), qué está cerca (≈, con una flecha
// hacia la respuesta) y qué no. Dos partidas por día: el plantel de hoy (ESPN) y los históricos (Wikidata).
import { useMemo, useState } from 'react';
import { DATA } from '../../lib/core.js';
import { resultStats, squares } from '../../lib/daily.js';
import { POS_NAME, TAPADO_TRIES, historicPlayers, squadAnswers, squadPlayers, tapadoOfDay, tapadoPools, tapadoRow } from '../../lib/players.js';
import { useJson } from '../../hooks/data.js';
import { Empty, Segmented, Skeletons } from '../../components/ui.jsx';
import { Announcer, Avatar, DailyStats, GameEnd, PlayerSearch, ShareResult, buzz, useAnnounce, useDaily, useFlash, useResults } from './shared.jsx';

const MODES = [{ value: 'hoy', label: 'Plantel de hoy' }, { value: 'historia', label: 'Históricos' }];
const STATE_TEXT = { ok: 'coincide', near: 'cerca', no: 'no coincide' };
const STATE_MARK = { ok: '✓', near: '≈', no: '' };
const DIR = { up: ['↑', 'la respuesta es más'], down: ['↓', 'la respuesta es menos'] };

function Board({ mode, day, label, guessList, answers, onDone, streak }) {
  const tries = TAPADO_TRIES[mode];
  const [game, setGame] = useDaily(`tapado-${mode}`, day, { guesses: [], answer: null });
  // La respuesta queda fija al primer intento: si el plantel cambia a mitad del día, la partida empezada no cambia.
  const target = useMemo(() => guessList.find((p) => p.id === game.answer) ?? tapadoOfDay(answers, day, mode), [guessList, answers, game.answer, day, mode]);
  const guesses = game.guesses.map((id) => guessList.find((p) => p.id === id)).filter(Boolean);
  const [flash, fire] = useFlash(1400); // la fila recién jugada da vuelta sus casillas de a una
  const [fresh, setFresh] = useState(false);
  const [hist, record] = useResults(`tapado-${mode}`);
  const [said, say] = useAnnounce();
  if (!target) return <Empty>El Tapado no está disponible ahora.</Empty>;
  const won = guesses.some((p) => p.id === target.id);
  const done = won || guesses.length >= tries;
  const rows = guesses.map((p) => tapadoRow(p, target, mode));
  const marks = rows.map((r) => squares(r.map((c) => (c.state === 'ok' ? true : c.state === 'near' ? 'near' : false)))).join('\n');
  const title = mode === 'hoy' ? 'El Tapado' : 'El Tapado histórico';
  const sub = [[target.pos].flat().map((x) => POS_NAME[x]).join(' / '), [target.nat].flat().filter(Boolean).join(' / ')].filter(Boolean).join(' · ');

  const guess = (p) => {
    if (done) return;
    const next = [...game.guesses, p.id];
    setGame({ guesses: next, answer: target.id });
    buzz(p.id === target.id);
    fire(p.id);
    // Lo que dio el intento, para el lector de pantalla (la fila nueva se dibuja arriba de todo).
    if (p.id !== target.id && next.length < tries) {
      const row = tapadoRow(p, target, mode);
      say(`${p.n}: no es. ${row.map((c) => `${c.label} ${c.text}, ${STATE_TEXT[c.state]}${c.dir ? `, ${DIR[c.dir][1]}` : ''}`).join('; ')}. Te quedan ${tries - next.length} intentos.`);
    }
    if (p.id === target.id || next.length >= tries) {
      record(day, p.id === target.id ? next.length : 0);
      setFresh(true);
      onDone('tapado');
    }
  };

  const st = resultStats(hist, 'guess');
  return (
    <>
      <Announcer text={said} />
      {!done && (
        <div className="card">
          <p className="tries" aria-hidden="true">{Array.from({ length: tries }, (_, i) => <i key={i} className={i < guesses.length ? 'is-used' : undefined} />)}</p>
          <PlayerSearch list={guessList} onPick={guess} exclude={new Set(game.guesses)} label={mode === 'hoy' ? 'Escribí el nombre de un jugador del plantel' : 'Escribí el nombre de un jugador histórico'} detail={`Intento ${guesses.length + 1} de ${tries}`} />
        </div>
      )}
      {rows.length > 0 && (
        <div className="tapado" role="table" aria-label="Tus intentos">
          {[...rows.keys()].reverse().map((i) => (
            <div key={guesses[i].id} className={`tapado-row${flash === guesses[i].id ? ' is-new' : ''}`} role="row">
              <strong className="tapado-name" role="rowheader"><Avatar photo={guesses[i].photo} name={guesses[i].n} num={guesses[i].jersey} size={32} />{guesses[i].n}</strong>
              {rows[i].map((c, ci) => (
                <span key={c.key} role="cell" className={`tapado-cell is-${c.state}`} style={{ '--i': ci }}>
                  <small>{c.label}</small>
                  <span>{c.text} <i aria-hidden="true">{STATE_MARK[c.state]}{c.dir ? DIR[c.dir][0] : ''}</i></span>
                  <span className="sr-only"> ({STATE_TEXT[c.state]}{c.dir ? `, ${DIR[c.dir][1]}` : ''})</span>
                </span>
              ))}
            </div>
          ))}
        </div>
      )}
      {done && flash == null && (
        <GameEnd fresh={fresh} win={won} player={target} sub={sub} kicker={`${title} del ${label}`} score={won ? `${guesses.length}/${tries}` : 'X'} phrase={won ? `¡Era ${target.n}!` : `Era ${target.n}. Mañana hay otro.`} marks={marks}
          stats={<DailyStats streak={streak} stats={[['Jugados', st.played], ['Acertados', st.played ? `${st.wins} (${st.pct} %)` : null], ['Intentos promedio', st.avg != null ? String(st.avg).replace('.', ',') : null]]} />}
        >
          <ShareResult
            anchor="tapado" file="tapado-velez.png" text={`El Fortín · ${title} ${label} · ${won ? guesses.length : 'X'}/${tries}\n${marks}`}
            card={() => ({ kicker: `${title} del ${label}`, headline: title, big: true, center: won ? `${guesses.length}/${tries}` : 'X', sub: won ? 'intentos' : 'no lo saqué', lines: ['¿Vos lo sacás? Un jugador de Vélez por día en El Fortín.'] })}
          />
        </GameEnd>
      )}
    </>
  );
}

function Hoy({ roster, ...rest }) {
  const stats = useJson(`${DATA}players.json`);
  const squad = useMemo(() => squadPlayers(roster, stats), [roster, stats]);
  const answers = useMemo(() => squadAnswers(squad), [squad]);
  if (roster === undefined || stats === undefined) return <Skeletons className="sk-card" />;
  return <Board mode="hoy" guessList={squad} answers={answers} {...rest} />;
}

function Historia(props) {
  const json = useJson('data/jugadores.json');
  const pools = useMemo(() => tapadoPools(historicPlayers(json)), [json]);
  if (json === undefined) return <Skeletons className="sk-card" />;
  return <Board mode="historia" guessList={pools.guess} answers={pools.answers} {...props} />;
}

export function Tapado({ day, label, roster, onDone, streak }) {
  const [mode, setMode] = useState('hoy');
  return (
    <>
      <Segmented options={MODES} value={mode} onChange={setMode} label="Qué jugadores" />
      {mode === 'hoy' ? <Hoy roster={roster} day={day} label={label} onDone={onDone} streak={streak} /> : <Historia day={day} label={label} onDone={onDone} streak={streak} />}
      <p className="muted small">
        <b>✓</b> coincide · <b>≈</b> cerca · <b>↑ ↓</b> la respuesta es más alta o más baja.{' '}
        {mode === 'hoy'
          ? 'Plantel, edad y dorsal de ESPN; partidos y goles del torneo en curso.'
          : '«Llegó» es el año en que llegó a Vélez y «Clubes», cuántos tuvo en su carrera. Datos de Wikidata: puede haber errores u omisiones.'}
      </p>
    </>
  );
}

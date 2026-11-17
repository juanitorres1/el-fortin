// El Tapado: adivinar un jugador por sus datos. Cada intento dice qué coincide (✓), qué está cerca (≈, con una flecha
// hacia la respuesta) y qué no; «Lo que ya sabés» junta todos los intentos (rangos, descartados). Dos partidas por
// día: el plantel de hoy (ESPN) y los históricos (Wikidata).
import { useEffect, useMemo, useRef, useState } from 'react';
import { DATA, sized } from '../../lib/core.js';
import { resultStats, squares } from '../../lib/daily.js';
import { load } from '../../lib/storage.js';
import { TAPADO_COLS, TAPADO_TRIES, historicPlayers, squadAnswers, squadPlayers, tapadoClues, tapadoDone, tapadoFicha, tapadoOfDay, tapadoPools, tapadoRow } from '../../lib/players.js';
import { useJson } from '../../hooks/data.js';
import { Empty, Segmented, Skeletons } from '../../components/ui.jsx';
import { Announcer, Avatar, DailyStats, GameEnd, PlayerSearch, ShareResult, buzz, useAnnounce, useDaily, useFlash, useResults } from './shared.jsx';

const MODES = [{ value: 'hoy', label: 'Plantel de hoy' }, { value: 'historia', label: 'Históricos' }];
const TITLE = { hoy: 'El Tapado', historia: 'El Tapado histórico' };
const NEXT_TEXT = { hoy: 'Ahora, con el plantel de hoy', historia: 'Ahora, con los históricos' };
const STATE_TEXT ={ ok: 'coincide', near: 'cerca', no: 'no coincide' };
const STATE_MARK = { ok: '✓', near: '≈', no: '' };
const DIR = { up: ['↑', 'la respuesta es más'], down: ['↓', 'la respuesta es menos'] };
const NOT_SHOWN = 3; // descartados que se ven en «Lo que ya sabés» (el resto, «+N»)

/** Una fila de casillas (un intento, o la respuesta al perder). */
function Row({ player, cells, isNew, answer }) {
  return (
    <div className={`tapado-row${isNew ? ' is-new' : ''}${answer ? ' is-answer' : ''}`} role="row">
      <strong className="tapado-name" role="rowheader">
        <Avatar photo={player.photo} name={player.n} num={player.jersey} size={32} />
        {answer && <span className="tapado-tag">Era</span>}
        {player.n}
      </strong>
      {cells.map((c, ci) => (
        <span key={c.key} role="cell" className={`tapado-cell is-${answer ? 'ok' : c.state}`} style={{ '--i': ci }}>
          <small>{c.label}</small>
          <span>
            {c.key === 'nat' && player.flag && <img className="tapado-flag" src={sized(player.flag, 16)} alt="" width="16" height="16" loading="lazy" decoding="async" onError={(e) => e.currentTarget.remove()} />}
            {c.text}{!answer && <i aria-hidden="true"> {STATE_MARK[c.state]}{c.dir ? DIR[c.dir][0] : ''}</i>}
          </span>
          {!answer && <span className="sr-only"> ({STATE_TEXT[c.state]}{c.dir ? `, ${DIR[c.dir][1]}` : ''})</span>}
        </span>
      ))}
    </div>
  );
}

/** Lo que ya se sabe de la respuesta, juntando todos los intentos. */
function Clues({ clues }) {
  return (
    <section className="tapado-clues" aria-labelledby="tapado-clues-t">
      <h3 className="kicker" id="tapado-clues-t">Lo que ya sabés</h3>
      <dl>
        {clues.map((c) => (
          <div key={c.key} className={`tapado-clue is-${c.state}`}>
            <dt>{c.label}</dt>
            <dd>
              {c.state === 'unknown' ? <span aria-label="sin datos">?</span> : c.state === 'some' ? <span>comparte con {c.text}</span> : c.text}
              {c.state !== 'ok' && c.not.length > 0 && (
                <small>no: {c.not.slice(0, NOT_SHOWN).join(', ')}{c.not.length > NOT_SHOWN ? ` +${c.not.length - NOT_SHOWN}` : ''}</small>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Board({ mode, day, label, guessList, answers, onDone, streak, next }) {
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
  const clues = done || !guesses.length ? null : tapadoClues(guesses, target, mode);
  const marks = rows.map((r) => squares(r.map((c) => (c.state === 'ok' ? true : c.state === 'near' ? 'near' : false)))).join('\n');
  const title = TITLE[mode];
  const left = tries - guesses.length;

  const guess = (p) => {
    if (done) return;
    const list = [...game.guesses, p.id];
    setGame({ guesses: list, answer: target.id });
    buzz(p.id === target.id);
    fire(p.id);
    // Lo que dio el intento, para el lector de pantalla (la fila nueva se dibuja arriba de todo).
    if (p.id !== target.id && list.length < tries) {
      const row = tapadoRow(p, target, mode);
      say(`${p.n}: no es. ${row.map((c) => `${c.label} ${c.text}, ${STATE_TEXT[c.state]}${c.dir ? `, ${DIR[c.dir][1]}` : ''}`).join('; ')}. Te quedan ${tries - list.length} intentos.`);
    }
    if (p.id === target.id || list.length >= tries) {
      record(day, p.id === target.id ? list.length : 0);
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
          <PlayerSearch
            list={guessList} onPick={guess} exclude={new Set(game.guesses)} label={mode === 'hoy' ? 'Escribí el nombre de un jugador del plantel' : 'Escribí el nombre de un jugador histórico'}
            detail={left === 1 ? `Último intento (${tries} de ${tries})` : `Intento ${guesses.length + 1} de ${tries}`}
          />
          {clues && <Clues clues={clues} />}
        </div>
      )}
      {done && flash == null && (
        <GameEnd fresh={fresh} win={won} player={target} sub={tapadoFicha(target, mode)} kicker={`${title} del ${label}`} score={won ? `${guesses.length}/${tries}` : 'X'} phrase={won ? `¡Era ${target.n}!` : `Era ${target.n}. Mañana hay otro.`} marks={marks}
          stats={<DailyStats streak={streak} stats={[['Jugados', st.played], ['Acertados', st.played ? `${st.wins} (${st.pct} %)` : null], ['Intentos promedio', st.avg != null ? String(st.avg).replace('.', ',') : null]]} />}
        >
          <ShareResult
            anchor="tapado" file="tapado-velez.png" text={`El Fortín · ${title} ${label} · ${won ? guesses.length : 'X'}/${tries}\n${marks}`}
            card={() => ({ kicker: `${title} del ${label}`, headline: title, big: true, center: won ? `${guesses.length}/${tries}` : 'X', sub: won ? 'intentos' : 'no lo saqué', lines: ['¿Vos lo sacás? Un jugador de Vélez por día en El Fortín.'] })}
          />
          {next && <button type="button" className="btn btn-outline tapado-next" onClick={next.go}>{NEXT_TEXT[next.mode]} →</button>}
        </GameEnd>
      )}
      {rows.length > 0 && (
        <div className="tapado" role="table" aria-label={done ? 'Tus intentos' : `Tus intentos (te quedan ${left})`}>
          {done && !won && flash == null && <Row player={target} cells={tapadoRow(target, target, mode)} answer />}
          {[...rows.keys()].reverse().map((i) => <Row key={guesses[i].id} player={guesses[i]} cells={rows[i]} isNew={flash === guesses[i].id} />)}
        </div>
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

/** Cuánto es «cerca» en cada dato numérico: «Edad ±2 · Dorsal ±5…». */
const nearText = (mode) => TAPADO_COLS[mode].filter((c) => c.num).map((c) => `${c.label.toLowerCase()} ±${c.near}`).join(', ');

export function Tapado({ day, label, roster, onDone, streak }) {
  const [mode, setMode] = useState('hoy');
  const [finished, setFinished] = useState({});
  const top = useRef(null);
  // Lo jugado hoy se lee al montar (no al dibujar: el HTML del deploy no lo sabe). Si ya jugó el plantel, abre los históricos.
  useEffect(() => {
    const f = Object.fromEntries(MODES.map((m) => [m.value, tapadoDone(load(`tapado-${m.value}`), day, m.value)]));
    setFinished(f);
    if (f.hoy && !f.historia) setMode('historia');
  }, [day]);
  const finish = (game) => {
    setFinished((f) => ({ ...f, [mode]: true }));
    onDone(game);
  };
  const other = mode === 'hoy' ? 'historia' : 'hoy';
  const next = finished[other] ? null : {
    mode: other,
    go: () => {
      setMode(other);
      top.current?.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    },
  };
  const options = MODES.map((m) => ({
    value: m.value,
    label: finished[m.value] ? <>{m.label}<span aria-hidden="true"> ✓</span><span className="sr-only"> (jugado hoy)</span></> : m.label,
  }));
  const props = { day, label, onDone: finish, streak, next };
  return (
    <>
      <div ref={top} className="tapado-modes"><Segmented options={options} value={mode} onChange={setMode} label="Qué jugadores" /></div>
      {mode === 'hoy' ? <Hoy key="hoy" roster={roster} {...props} /> : <Historia key="historia" {...props} />}
      <p className="muted small">
        <b>✓</b> coincide · <b>≈</b> cerca ({nearText(mode)}) · <b>↑ ↓</b> la respuesta es más alta o más baja.{' '}
        {mode === 'hoy'
          ? 'Plantel, edad y dorsal de ESPN; partidos y goles del torneo en curso.'
          : '«Llegó» es el año en que llegó a Vélez y «Clubes», cuántos tuvo en su carrera. Datos de Wikidata: puede haber errores u omisiones.'}
      </p>
    </>
  );
}

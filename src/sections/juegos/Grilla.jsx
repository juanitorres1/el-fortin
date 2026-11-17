// Grilla del Fortín: 3×3. Cada casilla pide un jugador que pasó por Vélez y cumple la condición de su fila y la de
// su columna. Hay un cupo total de intentos (GRID_TRIES: 9 + 3 de margen), no uno por casilla: un error no cierra la
// casilla. Cada jugador vale una sola vez. Al final se muestran respuestas válidas de cada casilla.
import { useMemo, useState } from 'react';
import { resultStats, squares } from '../../lib/daily.js';
import { GRID_TRIES, cellPlayers, dailyGrid, gridCheck, gridState, historicPlayers, rarity } from '../../lib/players.js';
import { useJson } from '../../hooks/data.js';
import { Empty, Skeletons } from '../../components/ui.jsx';
import { Announcer, Avatar, DailyStats, GameEnd, PlayerSearch, ShareResult, buzz, useAnnounce, useDaily, useFlash, useResults } from './shared.jsx';

const CELLS = [0, 1, 2, 3, 4, 5, 6, 7, 8];
const surname = (name) => name.split(' ').at(-1);

export function Grilla({ day, label, onDone, streak }) {
  const json = useJson('data/jugadores.json');
  const players = useMemo(() => historicPlayers(json), [json]);
  const grid = useMemo(() => dailyGrid(players, day), [players, day]);
  const [game, setGame] = useDaily('grilla', day, { cells: {}, misses: [] });
  const [picked, setPicked] = useState(null);
  const [flash, fire] = useFlash();
  const [fresh, setFresh] = useState(false);
  const [hist, record] = useResults('grilla');
  const [said, say] = useAnnounce();

  if (json === undefined) return <Skeletons className="sk-card" />;
  if (!grid) return <Empty>La grilla no está disponible ahora.</Empty>;
  const g = gridState(game);
  const results = CELLS.map((i) => g.right[i] != null);
  const score = results.filter(Boolean).length;
  const byId = new Map(players.map((p) => [p.id, p]));
  const points = CELLS.reduce((n, i) => n + (g.right[i] != null ? rarity(byId.get(g.right[i])) : 0), 0);
  const used = new Set(Object.values(g.right));
  const current = picked != null && !g.closed.has(picked) ? picked : null;
  const what = (i) => `${grid.rows[Math.floor(i / 3)].label} + ${grid.cols[i % 3].label}`;
  const done = g.done;
  const st = resultStats(hist, 'score', 9);

  const guess = (p) => {
    if (current == null || done) return;
    const ok = gridCheck(grid, current, p);
    const next = ok ? { cells: { ...game.cells, [current]: { id: p.id, ok } } } : { misses: [...(game.misses ?? []), { i: current, id: p.id }] };
    const after = gridState({ ...game, ...next });
    setGame(next);
    buzz(ok);
    fire(current);
    const tries = `Te quedan ${after.left} ${after.left === 1 ? 'intento' : 'intentos'}.`;
    say(ok ? `¡Bien! ${p.n} vale para ${what(current)}. ${tries}` : `${p.n} no vale para ${what(current)}. ${tries}`);
    // Al acertar, la casilla se cierra: el buscador (que tiene el foco) pasa a la siguiente libre.
    if (ok) setPicked(CELLS.find((i) => !after.closed.has(i)) ?? null);
    if (after.done) {
      record(day, CELLS.filter((i) => after.right[i] != null).length);
      setFresh(true);
      onDone('grilla');
    }
  };

  return (
    <>
      <Announcer text={said} />
      <p className="grid9-count"><b className="num">{score}</b> de 9 · quedan <b className="num">{g.left}</b> de {GRID_TRIES} intentos</p>
      <div className="grid9" role="grid" aria-label="Grilla del día">
        <div role="row" className="grid9-row">
          <span role="presentation" />
          {grid.cols.map((c) => <span key={c.id} role="columnheader" className="grid9-head">{c.label}</span>)}
        </div>
        {grid.rows.map((r, ri) => (
          <div role="row" className="grid9-row" key={r.id}>
            <span role="rowheader" className="grid9-head">{r.label}</span>
            {[0, 1, 2].map((ci) => {
              const i = ri * 3 + ci;
              const id = g.right[i] ?? (g.closed.has(i) ? g.missed[i]?.at(-1) : null);
              const ok = g.right[i] != null;
              const player = id && byId.get(id);
              const misses = g.missed[i]?.length ?? 0;
              const closed = g.closed.has(i) || done;
              return (
                <span role="gridcell" key={i}>
                  <button
                    type="button" className={`grid9-cell${id ? (ok ? ' is-ok' : ' is-no') : ''}${flash === i ? ' is-new' : ''}`} disabled={closed} aria-pressed={current === i}
                    aria-label={id ? `${what(i)}: ${player?.n ?? ''}, ${ok ? 'bien' : 'mal'}` : `${closed ? 'Sin completar' : 'Elegir casilla'}: ${what(i)}${misses ? ` (${misses} ${misses === 1 ? 'error' : 'errores'})` : ''}`}
                    onClick={() => setPicked(i)}
                  >
                    {id
                      ? <><Avatar photo={player?.photo} name={player?.n} size={36} /><span><i aria-hidden="true">{ok ? '✓' : '✗'}</i> {player ? surname(player.n) : ''}</span></>
                      : <span className="grid9-plus" aria-hidden="true">{misses ? '✗'.repeat(Math.min(3, misses)) : '+'}</span>}
                  </button>
                </span>
              );
            })}
          </div>
        ))}
      </div>
      {!done && (
        <div className="card">
          {current == null
            ? <p className="muted grid9-pick">Tocá una casilla para elegirla.</p>
            : (
              <PlayerSearch
                list={players} onPick={guess} exclude={new Set([...used, ...(g.missed[current] ?? [])])}
                label={`Escribí un jugador que cumpla: ${what(current)}`} detail={`Quedan ${g.left} de ${GRID_TRIES} intentos para toda la grilla.`}
                hint="Un error no cierra la casilla: podés probar otro mientras te queden intentos."
              />
            )}
        </div>
      )}
      {done && (
        <>
          <GameEnd
            fresh={fresh} win={score >= 6} kicker={`Grilla del ${label}`} score={`${score}/9`} phrase={score === 9 ? '¡Grilla perfecta!' : score >= 6 ? 'Muy bien, hincha.' : 'Mañana hay otra.'} marks={squares(results, 3)}
            stats={<DailyStats streak={streak} stats={[['Jugadas', st.played], ['Promedio', st.avg != null ? `${String(st.avg).replace('.', ',')}/9` : null], ['Perfectas', st.perfect]]} />}
          >
            <p className="muted">Puntos de tapado: <b className="num">{points}</b> (vale más el jugador menos conocido).</p>
            <ShareResult
              anchor="grilla" file="grilla-velez.png" text={`El Fortín · Grilla ${label} · ${score}/9 · ${points} pts de tapado\n${squares(results, 3)}`}
              card={() => ({ kicker: `Grilla del ${label}`, headline: 'Grilla del Fortín', big: true, center: `${score}/9`, sub: `${points} puntos de tapado`, lines: ['Nueve casilleros, nueve jugadores de Vélez. Jugá en El Fortín.'] })}
            />
          </GameEnd>
          <h3 className="h3 games-h">Respuestas válidas</h3>
          <ul className="grid9-answers">
            {CELLS.map((i) => {
              const options = cellPlayers(players, grid.rows[Math.floor(i / 3)], grid.cols[i % 3]).sort((a, b) => b.links - a.links);
              const mine = g.right[i];
              const others = options.filter((p) => p.id !== mine);
              return (
                <li key={i}>
                  <b>{what(i)}:</b> {mine ? <>pusiste a {byId.get(mine)?.n}. </> : null}
                  valían {options.length}{others.length ? `, por ejemplo ${others.slice(0, 4).map((p) => p.n).join(', ')}` : ''}.
                </li>
              );
            })}
          </ul>
        </>
      )}
      <p className="muted small">Una grilla por día, con {GRID_TRIES} intentos en total. Valen los jugadores que pasaron por Vélez según Wikidata: si falta alguno o un dato está mal, puede no valer (por eso hay margen).</p>
    </>
  );
}

// Grilla del Fortín: 3×3. Cada casilla pide un jugador que pasó por Vélez y cumple la condición de su fila y la de
// su columna. Un intento por casilla y cada jugador vale una sola vez.
import { useMemo, useState } from 'react';
import { squares } from '../../lib/daily.js';
import { cellPlayers, dailyGrid, gridCheck, historicPlayers, rarity } from '../../lib/players.js';
import { useJson } from '../../hooks/data.js';
import { Empty, Skeletons } from '../../components/ui.jsx';
import { Avatar, GameEnd, PlayerSearch, ShareResult, buzz, useDaily, useFlash } from './shared.jsx';

const CELLS = [0, 1, 2, 3, 4, 5, 6, 7, 8];
const surname = (name) => name.split(' ').at(-1);

export function Grilla({ day, label, onDone }) {
  const json = useJson('data/jugadores.json');
  const players = useMemo(() => historicPlayers(json), [json]);
  const grid = useMemo(() => dailyGrid(players, day), [players, day]);
  const [game, setGame] = useDaily('grilla', day, { cells: {} });
  const [picked, setPicked] = useState(null);
  const [flash, fire] = useFlash();
  const [fresh, setFresh] = useState(false);

  if (json === undefined) return <Skeletons className="sk-card" />;
  if (!grid) return <Empty>La grilla no está disponible ahora.</Empty>;
  const cells = game.cells;
  const filled = CELLS.filter((i) => cells[i]);
  const done = filled.length === CELLS.length;
  const results = CELLS.map((i) => Boolean(cells[i]?.ok));
  const score = results.filter(Boolean).length;
  const byId = new Map(players.map((p) => [p.id, p]));
  const points = CELLS.reduce((n, i) => n + (cells[i]?.ok ? rarity(byId.get(cells[i].id)) : 0), 0);
  const used = new Set(CELLS.filter((i) => cells[i]?.ok).map((i) => cells[i].id));
  const current = picked != null && !cells[picked] ? picked : null;
  const what = (i) => `${grid.rows[Math.floor(i / 3)].label} + ${grid.cols[i % 3].label}`;

  const guess = (p) => {
    if (current == null) return;
    const ok = gridCheck(grid, current, p);
    const next = { ...cells, [current]: { id: p.id, ok } };
    setGame({ cells: next });
    buzz(ok);
    fire(current);
    setPicked(CELLS.find((i) => !next[i]) ?? null);
    if (CELLS.every((i) => next[i])) {
      setFresh(true);
      onDone('grilla');
    }
  };

  return (
    <>
      <p className="grid9-count" role="status"><b className="num">{score}</b> de 9 · quedan {9 - filled.length} casillas</p>
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
              const cell = cells[i];
              const player = cell && byId.get(cell.id);
              return (
                <span role="gridcell" key={i}>
                  <button
                    type="button" className={`grid9-cell${cell ? (cell.ok ? ' is-ok' : ' is-no') : ''}${flash === i ? ' is-new' : ''}`} disabled={Boolean(cell)} aria-pressed={current === i}
                    aria-label={cell ? `${what(i)}: ${player?.n ?? ''}, ${cell.ok ? 'bien' : 'mal'}` : `Elegir casilla: ${what(i)}`} onClick={() => setPicked(i)}
                  >
                    {cell ? <><Avatar photo={player?.photo} name={player?.n} size={36} /><span><i aria-hidden="true">{cell.ok ? '✓' : '✗'}</i> {player ? surname(player.n) : ''}</span></> : <span className="grid9-plus" aria-hidden="true">+</span>}
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
            : <PlayerSearch list={players} onPick={guess} exclude={used} label={what(current)} hint="Un solo intento por casilla." />}
        </div>
      )}
      {done && (
        <>
          <GameEnd fresh={fresh} win={score >= 6} kicker={`Grilla del ${label}`} score={`${score}/9`} phrase={score === 9 ? '¡Grilla perfecta!' : score >= 6 ? 'Muy bien, hincha.' : 'Mañana hay otra.'} marks={squares(results, 3)}>
            <p className="muted">Puntos de tapado: <b className="num">{points}</b> (vale más el jugador menos conocido).</p>
            <ShareResult
              anchor="grilla" file="grilla-velez.png" text={`El Fortín · Grilla ${label} · ${score}/9 · ${points} pts de tapado\n${squares(results, 3)}`}
              card={() => ({ kicker: `Grilla del ${label}`, headline: 'Grilla del Fortín', big: true, center: `${score}/9`, sub: `${points} puntos de tapado`, lines: ['Nueve casilleros, nueve jugadores de Vélez. Jugá en El Fortín.'] })}
            />
          </GameEnd>
          <ul className="grid9-answers">
            {CELLS.filter((i) => !cells[i].ok).map((i) => {
              const options = cellPlayers(players, grid.rows[Math.floor(i / 3)], grid.cols[i % 3]);
              return <li key={i}><b>{what(i)}:</b> valían {options.length}, por ejemplo {options.slice(0, 3).map((p) => p.n).join(', ')}.</li>;
            })}
          </ul>
        </>
      )}
      <p className="muted small">Una grilla por día. Valen los jugadores que pasaron por Vélez según Wikidata: si falta alguno o un dato está mal, la casilla puede darse por errada.</p>
    </>
  );
}

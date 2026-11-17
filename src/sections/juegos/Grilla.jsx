// Grilla del Fortín: 3×3. Cada casilla pide un jugador que pasó por Vélez y cumple la condición de su fila y la de
// su columna. Hay un cupo total de intentos (GRID_TRIES: 9 + 3 de margen), no uno por casilla: un error no cierra la
// casilla. Cada jugador vale una sola vez. Al final se muestran respuestas válidas de cada casilla.
import { useMemo, useRef, useState } from 'react';
import { resultStats, squares } from '../../lib/daily.js';
import { GRID_TRIES, criterionLogo, dailyGrid, gridAnswers, gridCheck, gridFirstOpen, gridMisses, gridState, historicPlayers, rarity } from '../../lib/players.js';
import { useJson } from '../../hooks/data.js';
import { Crest, Empty, ExtLink, Skeletons } from '../../components/ui.jsx';
import { Announcer, Avatar, DailyStats, GameEnd, PlayerSearch, ShareResult, buzz, useAnnounce, useDaily, useFlash, useResults } from './shared.jsx';

const CELLS = [0, 1, 2, 3, 4, 5, 6, 7, 8];
const surname = (name) => name.split(' ').at(-1);
const pts = (n) => `+${n} ${n === 1 ? 'punto' : 'puntos'}`;

/** Encabezado de fila o columna: escudo (si es un club), antetítulo chico y el dato corto. */
function Head({ crit, logo, role, on }) {
  return (
    <span role={role} className={`grid9-head${on ? ' is-on' : ''}`} aria-label={crit.label}>
      {logo && <Crest url={logo} size={28} className="crest grid9-crest" />}
      <small aria-hidden="true">{crit.head[0]}</small>
      <b aria-hidden="true" className={crit.head[1].length >= 10 ? 'is-long' : undefined}>{crit.head[1]}</b>
    </span>
  );
}

export function Grilla({ day, label, onDone, streak }) {
  const json = useJson('data/jugadores.json');
  const players = useMemo(() => historicPlayers(json), [json]);
  const grid = useMemo(() => dailyGrid(players, day), [players, day]);
  const logos = useMemo(() => new Map(grid ? [...grid.rows, ...grid.cols].map((c) => [c.id, criterionLogo(players, c)]) : []), [grid, players]);
  const [game, setGame] = useDaily('grilla', day, { cells: {}, misses: [] });
  const [picked, setPicked] = useState(null);
  const [flash, fire] = useFlash();
  const [fresh, setFresh] = useState(false);
  const [last, setLast] = useState(null); // el último intento, para mostrarlo (el lector de pantalla lo oye por Announcer)
  const [hist, record] = useResults('grilla');
  const [said, say] = useAnnounce();
  const searchBox = useRef(null);

  if (json === undefined) return <Skeletons className="sk-card" />;
  if (!grid) return <Empty>La grilla no está disponible ahora.</Empty>;
  const g = gridState(game);
  const results = CELLS.map((i) => g.right[i] != null);
  const score = results.filter(Boolean).length;
  const byId = new Map(players.map((p) => [p.id, p]));
  const points = CELLS.reduce((n, i) => n + (g.right[i] != null ? rarity(byId.get(g.right[i])) : 0), 0);
  const used = new Set(Object.values(g.right));
  const done = g.done;
  // Siempre hay una casilla elegida mientras se juega: la que tocó el hincha o, si no, la primera libre.
  const current = done ? null : picked != null && !g.closed.has(picked) ? picked : gridFirstOpen(g.closed);
  const what = (i) => `${grid.rows[Math.floor(i / 3)].label} + ${grid.cols[i % 3].label}`;
  const st = resultStats(hist, 'score', 9);
  const shown = CELLS.map((i) => g.right[i] ?? (g.closed.has(i) ? g.missed[i]?.at(-1) : null));
  const credits = [...new Set(shown.filter(Boolean))].map((id) => byId.get(id)).filter((p) => p?.photo);

  const choose = (i) => {
    setPicked(i);
    setLast(null);
    // Elegir casilla y escribir es un solo paso: el foco va directo al buscador.
    searchBox.current?.querySelector('input')?.focus();
  };

  const guess = (p) => {
    if (current == null || done) return;
    const ok = gridCheck(grid, current, p);
    const next = ok ? { cells: { ...game.cells, [current]: { id: p.id, ok } } } : { misses: [...(game.misses ?? []), { i: current, id: p.id }] };
    const after = gridState({ ...game, ...next });
    setGame(next);
    buzz(ok);
    fire(current);
    const why = ok ? [] : gridMisses(grid, current, p).map((c) => `«${c.label}»`);
    setLast({ ok, name: p.n, why, pts: ok ? rarity(p) : 0, left: after.left });
    const tries = `Te quedan ${after.left} ${after.left === 1 ? 'intento' : 'intentos'}.`;
    say(ok ? `¡Bien! ${p.n} vale para ${what(current)}. ${tries}` : `${p.n} no vale para ${what(current)}: según los datos no cumple ${why.join(' ni ')}. ${tries}`);
    // Al acertar, la casilla se cierra: el buscador (que tiene el foco) pasa a la siguiente libre.
    if (ok) setPicked(gridFirstOpen(after.closed));
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
          <span role="presentation" className="grid9-corner" aria-hidden="true">V</span>
          {grid.cols.map((c, ci) => <Head key={c.id} crit={c} logo={logos.get(c.id)} role="columnheader" on={current != null && current % 3 === ci} />)}
        </div>
        {grid.rows.map((r, ri) => (
          <div role="row" className="grid9-row" key={r.id}>
            <Head crit={r} logo={logos.get(r.id)} role="rowheader" on={current != null && Math.floor(current / 3) === ri} />
            {[0, 1, 2].map((ci) => {
              const i = ri * 3 + ci;
              const id = shown[i];
              const ok = g.right[i] != null;
              const player = id && byId.get(id);
              const misses = g.missed[i]?.length ?? 0;
              const closed = g.closed.has(i) || done;
              return (
                <span role="gridcell" key={i}>
                  <button
                    type="button" className={`grid9-cell${id ? (ok ? ' is-ok' : ' is-no') : ''}${flash === i ? ' is-new' : ''}`} disabled={closed} aria-pressed={current === i}
                    aria-label={id ? `${what(i)}: ${player?.n ?? ''}, ${ok ? 'bien' : 'mal'}` : `${closed ? 'Sin completar' : 'Elegir casilla'}: ${what(i)}${misses ? ` (${misses} ${misses === 1 ? 'error' : 'errores'})` : ''}`}
                    onClick={() => choose(i)}
                  >
                    {id
                      ? <><Avatar photo={player?.photo} name={player?.n} size={44} /><span className="grid9-name"><i aria-hidden="true">{ok ? '✓' : '✗'}</i> {player ? surname(player.n) : ''}</span></>
                      : <>
                          <span className="grid9-plus" aria-hidden="true">{current === i ? '?' : '+'}</span>
                          {misses > 0 && <span className="grid9-miss" aria-hidden="true">{'✗'.repeat(Math.min(3, misses))}</span>}
                        </>}
                  </button>
                </span>
              );
            })}
          </div>
        ))}
      </div>
      {!done && current != null && (
        <div className="card grid9-search" ref={searchBox}>
          {last && (
            <p className={`grid9-last ${last.ok ? 'is-ok' : 'is-no'}`} aria-hidden="true">
              {last.ok
                ? <><b>✓ {last.name}</b> vale. {pts(last.pts)} de tapado.</>
                : <><b>✗ {last.name}</b> no vale: según los datos no cumple {last.why.join(' ni ')}.</>}
            </p>
          )}
          <PlayerSearch
            list={players} onPick={guess} exclude={new Set([...used, ...(g.missed[current] ?? [])])}
            label={`Escribí un jugador que cumpla: ${what(current)}`} detail={`Quedan ${g.left} de ${GRID_TRIES} intentos para toda la grilla.`}
            hint="Un error no cierra la casilla: podés probar otro mientras te queden intentos. Tocá otra casilla para cambiar."
          />
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
              const mine = g.right[i] ?? null;
              const { total, known, rare } = gridAnswers(players, grid, i, mine);
              const me = mine && byId.get(mine);
              return (
                <li key={i} className={mine ? 'is-ok' : 'is-no'}>
                  <p className="grid9-answers-head"><b>{what(i)}</b> <span className="muted">valían {total}</span></p>
                  <p>
                    {me ? <>Pusiste a <b>{me.n}</b> ({pts(rarity(me))}).</> : <>Quedó sin completar.</>}
                    {known.length > 0 && <> {me ? 'Otros' : 'Valían'}: {known.map((p) => p.n).join(', ')}.</>}
                    {rare && <> El más tapado: <b>{rare.n}</b>.</>}
                  </p>
                </li>
              );
            })}
          </ul>
        </>
      )}
      {credits.length > 0 && (
        <details className="grid9-credits">
          <summary>Créditos de las fotos</summary>
          <ul>
            {credits.map((p) => <li key={p.id}>{p.n}: {p.photo.href ? <ExtLink href={p.photo.href}>{p.photo.credit}</ExtLink> : p.photo.credit}</li>)}
          </ul>
        </details>
      )}
      <p className="muted small">Una grilla por día, con {GRID_TRIES} intentos en total. Valen los jugadores que pasaron por Vélez según Wikidata: si falta alguno o un dato está mal, puede no valer (por eso hay margen).</p>
    </>
  );
}

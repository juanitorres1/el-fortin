// Adiviná el once: los titulares del próximo partido; después del partido, cuántos acertaste (lib/games.js).
// El once se ve sobre una cancha a medida que se elige (por puesto de ESPN) y el resultado se muestra en la misma cancha.
import { useMemo } from 'react';
import { DATA, nextMatch } from '../../lib/core.js';
import { ONCE_LINES, ONCE_SIZE, isOpen, onceFormation, onceLast, onceLines, onceScore, onceWarnings, suspendedFor } from '../../lib/games.js';
import { useJson } from '../../hooks/data.js';
import { Empty, Skeletons } from '../../components/ui.jsx';
import { ShareCardButton } from '../../components/ShareCard.jsx';
import { Announcer, Avatar, useAnnounce, useFlash, useStored } from './shared.jsx';
import { rivalOf, upcoming, whenLabel } from './partido.js';

const POS_GROUP = { G: 'Arqueros', D: 'Defensores', M: 'Mediocampistas', F: 'Delanteros' };
const POS_ONE = { G: 'arquero', D: 'defensor', M: 'mediocampista', F: 'delantero' };
// Altura de cada línea en la cancha (%, Vélez ataca hacia arriba).
const LINE_Y = { G: 88, D: 67, M: 43, F: 19 };

/** «Lisandro Magallán» → «Magallán»; los apellidos compuestos quedan enteros («De la Fuente»). */
const shortName = (name) => {
  const w = String(name ?? '').split(' ').filter(Boolean);
  if (w.length < 2) return w[0] ?? '';
  const i = w.findIndex((x, k) => k > 0 && /^(de|del|la|van|di|da)$/i.test(x));
  return w.slice(i > 0 ? i : 1).join(' ');
};

/**
 * La cancha con el once por líneas. `lines` = onceLines(); cada jugador { id, name, jersey }. `onTap(id)` = sacarlo
 * (si no se pasa, la cancha es solo para ver). `mark(id)` = 'hit' | 'miss' para el resultado.
 */
function Cancha({ lines, onTap, mark, label, children }) {
  const empty = ONCE_LINES.every((k) => !lines[k].length);
  return (
    <div className="once-pitch" role="group" aria-label={label}>
      <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false" preserveAspectRatio="none">
        {Array.from({ length: 6 }, (_, i) => <rect key={i} className={i % 2 ? 'once-g2' : 'once-g1'} x="0" y={i * (100 / 6)} width="100" height={100 / 6} />)}
        <g className="once-chalk">
          <rect x="3" y="3" width="94" height="94" />
          <path d="M3 50H97" />
          <ellipse cx="50" cy="50" rx="11" ry="9" />
          <rect x="26" y="3" width="48" height="14" />
          <rect x="26" y="83" width="48" height="14" />
          <rect x="40" y="91" width="20" height="6" />
          <rect x="40" y="3" width="20" height="6" />
        </g>
      </svg>
      {empty && <p className="once-pitch-empty">{children}</p>}
      {ONCE_LINES.map((k) => lines[k].map((p, i, all) => {
        const m = mark?.(p.id);
        // Cada línea reparte el ancho útil (90 %) en partes iguales; el nombre se corta con «…» si no entra.
        const part = 90 / all.length;
        const style = { left: `${5 + part * (i + 0.5)}%`, top: `${LINE_Y[k]}%`, '--w': `${Math.min(part - 1, 30)}%` };
        const cls = `once-spot is-${k}${m ? ` is-${m}` : ''}`;
        const inner = (
          <>
            <span className="once-dot num" aria-hidden="true">{m === 'hit' ? '✓' : p.jersey ?? '–'}</span>
            <span className="once-name" aria-hidden="true">{shortName(p.name)}</span>
          </>
        );
        return onTap
          ? <button key={p.id} type="button" className={cls} style={style} onClick={() => onTap(p.id)} aria-label={`Sacar a ${p.name}`}>{inner}</button>
          : <span key={p.id} className={cls} style={style} role="img" aria-label={`${p.name}${m === 'hit' ? ': acertado' : m === 'miss' ? ': no lo elegiste' : ''}`}>{inner}</span>;
      }))}
    </div>
  );
}

/** Lo último que se evaluó: cuántos acertaste, sobre la cancha con los titulares reales. */
function Resultado({ last, evaluated, posOf, byId }) {
  const { game, score } = last;
  const lines = onceLines(score.starters.map((p) => ({ ...p, jersey: byId.get(p.id)?.jersey })), posOf);
  const missed = last.picked.filter((id) => !score.hitIds.has(id)).map((id) => byId.get(id)?.name).filter(Boolean);
  return (
    <div className="card once-result">
      <p className="kicker">Tu once vs. {game.rival.name} · {game.label}{game.score ? ` · Vélez ${game.result === 'G' ? 'ganó' : game.result === 'P' ? 'perdió' : 'empató'} ${game.score}` : ''}</p>
      <p className="trivia-score"><b className="num">{score.hits}/{score.total}</b> titulares acertados</p>
      <Cancha lines={lines} mark={(id) => (score.hitIds.has(id) ? 'hit' : 'miss')} label={`Los titulares de Vélez vs. ${game.rival.name}, formación ${onceFormation(lines)}`} />
      <p className="once-legend small"><span className="once-key is-hit" aria-hidden="true">✓</span> Lo elegiste <span className="once-key is-miss" aria-hidden="true" /> No lo elegiste</p>
      {missed.length > 0 && <p className="muted small">Elegiste y no fueron titulares: {missed.join(', ')}.</p>}
      <ShareCardButton
        label="Compartir" file="once-velez.png"
        getCard={() => ({ kicker: `Vs. ${game.rival.name} · ${game.label}`, headline: 'Adiviné el once', big: true, center: `${score.hits}/${score.total}`, sub: 'titulares acertados', lines: ['¿Vos cuántos sacás? Jugá en El Fortín.'] })}
      />
      {evaluated.length > 1 && <p className="muted small">Promedio: {(evaluated.reduce((n, x) => n + x.score.hits, 0) / evaluated.length).toFixed(1).replace('.', ',')} aciertos en {evaluated.length} partidos.</p>}
    </div>
  );
}

export function Once({ data, roster, games, now }) {
  const [picks, setPicks] = useStored('once', {});
  const stats = useJson(`${DATA}players.json`);
  const [said, say] = useAnnounce();
  const [full, flashFull] = useFlash(2200);
  // Mientras se juega, `upcoming` no lo da: se muestra igual, cerrado, con el once que quedó.
  const playing = data ? nextMatch(data.fixture) : undefined;
  const next = upcoming(data) ?? (playing?.status === 'in' ? playing : undefined);
  const open = isOpen(next, now);
  const mine = (next && picks[next.id]) ?? [];
  const players = roster?.players ?? [];
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const posOf = (id) => byId.get(id)?.pos;
  const evaluated = useMemo(() => {
    const gamesById = new Map((games?.games ?? []).map((g) => [g.id, g]));
    return Object.entries(picks).map(([id, ids]) => ({ id, picked: ids, game: gamesById.get(id), score: onceScore(ids, gamesById.get(id)) })).filter((x) => x.score).sort((a, b) => Date.parse(b.game.date) - Date.parse(a.game.date));
  }, [picks, games]);
  const prev = useMemo(() => onceLast(games?.games, new Set(players.map((p) => p.id))), [games, players]);

  if (!data || roster === undefined) return <Skeletons className="sk-card" />;
  const setMine = (ids) => setPicks((p) => ({ ...p, [next.id]: ids }));
  const toggle = (id) => {
    if (!open) return;
    const p = byId.get(id);
    const set = new Set(mine);
    if (set.has(id)) {
      set.delete(id);
      say(`Sacaste a ${p?.name ?? 'un jugador'}. ${set.size} de ${ONCE_SIZE}.`);
    } else if (set.size >= ONCE_SIZE) {
      flashFull('full');
      say(`Ya tenés ${ONCE_SIZE}: sacá uno para meter a ${p?.name}.`);
      return;
    } else {
      set.add(id);
      say(set.size === ONCE_SIZE ? `Metiste a ${p?.name}. Once completo.` : `Metiste a ${p?.name}. ${set.size} de ${ONCE_SIZE}.`);
    }
    setMine([...set]);
  };
  const fromLast = () => {
    setMine(prev.ids.slice(0, ONCE_SIZE));
    say(`Cargado el once que jugó contra ${prev.game.rival.name}: ${prev.ids.length} de ${ONCE_SIZE}.`);
  };
  const clear = () => {
    setMine([]);
    say('Once vacío.');
  };
  // Suspendidos para este partido (estimación con las tarjetas): se pueden elegir igual, pero avisados.
  const out = suspendedFor(stats?.discipline, next);
  const startedLast = new Set(prev?.game.players.filter((p) => p.s).map((p) => p.id));
  const byPos = ONCE_LINES.map((pos) => [pos, players.filter((p) => p.pos === pos).sort((a, b) => Number(a.jersey ?? 99) - Number(b.jersey ?? 99))]).filter(([, l]) => l.length);
  const chosen = mine.map((id) => byId.get(id)).filter(Boolean);
  const lines = onceLines(chosen, posOf);
  const formation = onceFormation(lines);
  const warnings = onceWarnings(lines);
  const complete = chosen.length === ONCE_SIZE;
  const last = evaluated[0];
  return (
    <>
      {last && <Resultado last={last} evaluated={evaluated} posOf={posOf} byId={byId} />}
      {!next ? <Empty>No hay un próximo partido programado. Cuando ESPN lo publique, vas a poder armar el once.</Empty> : !players.length ? <Empty>El plantel no está disponible ahora.</Empty> : (
        <div className={`card once${open ? '' : ' is-closed'}`}>
          <Announcer text={said} />
          <div className="once-head">
            <div>
              <p className="kicker">{last ? 'Próximo: ' : ''}Vs. {rivalOf(next).name}</p>
              <p className="muted small">{whenLabel(next)}</p>
            </div>
            <p className={`once-count num${complete ? ' is-full' : ''}`} aria-hidden="true">{chosen.length}<small>/{ONCE_SIZE}</small></p>
          </div>
          {!open && (
            <p className="once-closed">
              {next.status === 'in' ? 'Se está jugando. ' : 'Ya empezó. '}
              {mine.length ? 'Tu once quedó guardado como estaba: cuando terminen de cargarse los datos del partido, te decimos cuántos acertaste.' : 'No llegaste a armar el once para este partido. Va de nuevo en el próximo.'}
            </p>
          )}
          {(open || chosen.length > 0) && (
            <div className="once-body">
              <div className="once-side">
                <Cancha lines={lines} onTap={open ? toggle : undefined} label={`Tu once${formation ? `, formación ${formation}` : ''}`}>
                  Tocá jugadores de la lista para ponerlos en la cancha.
                </Cancha>
                {open && (
                  <>
                    <div className="once-tools">
                      {prev && prev.ids.length > 0 && chosen.length === 0 && (
                        <button type="button" className="btn btn-outline" onClick={fromLast}>Partir del once vs. {prev.game.rival.name}</button>
                      )}
                      {chosen.length > 0 && <button type="button" className="btn btn-outline once-clear" onClick={clear}>Vaciar</button>}
                      {chosen.length > 0 && <p className="muted small once-tip">Tocá un jugador en la cancha para sacarlo.</p>}
                    </div>
                    {complete && (
                      <p className={`once-done${warnings.length ? ' is-warn' : ''}`}>
                        {warnings.length ? `${warnings[0]} Igual queda guardado; si querés, cambialo hasta que empiece.` : `Once completo (${formation}). Queda guardado: después del partido te decimos cuántos acertaste.`}
                      </p>
                    )}
                  </>
                )}
              </div>
              {open && (
                <div className="once-list">
                  {byPos.map(([pos, list]) => {
                    const n = lines[pos].length;
                    return (
                      <fieldset key={pos} className="once-group">
                        <legend>{POS_GROUP[pos]}{n > 0 && <span className="once-n"> · {n} {n === 1 ? 'elegido' : 'elegidos'}</span>}</legend>
                        <div className="once-grid">
                          {list.map((p) => {
                            const on = mine.includes(p.id);
                            const susp = out.get(p.id);
                            return (
                              <button key={p.id} type="button" className={`once-player${susp ? ' is-susp' : ''}${!on && complete ? ' is-dim' : ''}`} aria-pressed={on} onClick={() => toggle(p.id)} title={susp ? `${susp.text} (estimado)` : undefined}>
                                <Avatar photo={p.photo ? { src: p.photo } : null} name={p.name} num={p.jersey ?? '–'} size={34} className="once-av" />
                                <span className="once-pname">
                                  {p.name}
                                  {startedLast.has(p.id) && <small className="once-last">Titular vs. {prev.game.rival.name}</small>}
                                  <span className="sr-only">, {POS_ONE[pos]}{p.jersey ? `, número ${p.jersey}` : ''}</span>
                                </span>
                                {susp && <small className="once-susp">Suspendido<span className="sr-only">: {susp.text.toLowerCase()}</span></small>}
                                {on && <span className="once-check" aria-hidden="true">✓</span>}
                              </button>
                            );
                          })}
                        </div>
                      </fieldset>
                    );
                  })}
                  {out.size > 0 && <p className="muted small">«Suspendido»: le tocaría cumplir una fecha por tarjetas según los datos de ESPN. Es una estimación (lo define el Tribunal de Disciplina): podés elegirlo igual.</p>}
                  <p className="muted small">Se guarda solo en este navegador. Podés cambiarlo hasta que empiece; después del partido te decimos cuántos acertaste.</p>
                  <div className={`once-bar${complete ? ' is-full' : ''}${full && complete ? ' is-shake' : ''}`} aria-hidden="true">
                    <span className="once-bar-n num">{chosen.length}/{ONCE_SIZE}</span>
                    <span className="once-bar-meter"><i style={{ width: `${(chosen.length / ONCE_SIZE) * 100}%` }} /></span>
                    <span className="once-bar-text">
                      {full && complete ? 'Ya tenés 11: sacá uno' : complete ? `¡Listo! ${formation}${warnings.length ? ` · ${warnings[0]}` : ''}` : `${ONCE_SIZE - chosen.length === 1 ? 'Falta' : 'Faltan'} ${ONCE_SIZE - chosen.length}${formation ? ` · ${formation}` : ''}`}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}

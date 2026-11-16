// Cuadro de los playoffs (el «mapa» del reducido): octavos, cuartos, semis y final con los resultados en vivo.
// Los partidos salen de data/generated/playoffs.json (el deploy) más el scoreboard del día que ya trae useLiveData
// (`playoffNow`: cada 5 min y cada 1 min mientras se juega un partido del cuadro). Si el deploy se atrasó y a un
// partido de un día anterior le falta el resultado, se pide ese día a ESPN. El armado está en lib/bracket.js.
import { useEffect, useRef } from 'react';
import { VELEZ_ID, fetchPlayoffDay } from '../lib/espn.js';
import { buildBracket, currentRound, mergePlayoffEvents, staleDays, teamPath } from '../lib/bracket.js';
import { PLAYOFF_SEEDS, rulesApply } from '../lib/rules.js';
import { TZ, fmt } from '../lib/core.js';
import { offLabel } from '../lib/alerts.js';
import { useCached } from '../hooks/data.js';
import { Crest, Lines } from '../components/ui.jsx';

const STALE_TTL_MS = 10 * 60 * 1000;
const weekday = new Intl.DateTimeFormat('es-AR', { timeZone: TZ, weekday: 'short' });

const inRound = (round) => (round.teams === 2 ? 'en la final' : `en ${round.label.toLowerCase()}`);
const names = (teams) => teams.map((t) => t.name).join(' y ');
/** Con quién: el equipo o «el ganador de X y Y» (con más candidatos, nada: es demasiado lejos para nombrarlos). */
const versus = (side) => (side?.team ? side.team.name : side?.cands.length === 2 ? `el ganador de ${names(side.cands)}` : null);
const score = (a, b) => `${a.score ?? 0}-${b.score ?? 0}${a.pen != null && b.pen != null ? ` (penales ${a.pen}-${b.pen})` : ''}`;

function when(m) {
  const d = new Date(m.date);
  const day = `${weekday.format(d).replace('.', '')} ${fmt.day.format(d)} ${fmt.mon.format(d).replace('.', '')}`;
  return m.timeValid ? `${day} · ${fmt.time.format(d)}` : `${day} · hora a conf.`;
}

/** Frases del camino de Vélez en el cuadro (null si no lo juega). */
function velezLines(bracket, phase) {
  const p = teamPath(bracket, VELEZ_ID);
  if (!p) return null;
  const { state, round, tie, me, rival, next } = p;
  const m = tie.match;
  const label = round.teams === 2 ? 'Final' : round.label;
  if (state === 'champion') return [`¡Vélez campeón del ${phase}! Le ganó la final a ${rival.team.name} ${score(me, rival)}.`];
  if (state === 'out') return [`Quedó afuera ${inRound(round)}: perdió con ${rival.team.name} ${score(me, rival)}.`];
  if (state === 'through') return [`Le ganó a ${rival.team.name} ${score(me, rival)} y pasó de ronda.`];
  const out = [];
  const vs = versus(rival);
  if (state === 'live') out.push(`${label}: Vélez juega ahora con ${rival.team.name} (va ${score(me, rival)}).`);
  else if (m && vs) {
    const d = new Date(m.date);
    const verb = m.home.id === VELEZ_ID ? 'recibe a' : 'visita a';
    out.push(`${label}: Vélez ${verb} ${vs} el ${fmt.long.format(d).replace(',', '')}${m.timeValid ? ` a las ${fmt.time.format(d)}` : ''}${m.venue ? `, en el ${m.venue}` : ''}.`);
  } else out.push(vs ? `${label}: Vélez juega con ${vs}. Fecha a confirmar.` : `Vélez juega ${inRound(round)}. Fecha a confirmar.`);
  const other = versus(next?.other);
  if (other) out.push(`Si pasa, ${inRound(next.round)} juega con ${other}.`);
  return out;
}

function Side({ s, tie }) {
  const win = tie.winner != null && s.team?.id === tie.winner;
  const lose = tie.winner != null && !win;
  const live = tie.match?.status === 'in';
  const shown = tie.match && (tie.match.completed || live) && s.team;
  return (
    <div className={`bk-team${win ? ' is-win' : ''}${lose ? ' is-lose' : ''}`}>
      {s.team ? (
        <>
          <Crest url={s.team.logo} size={20} />
          <span className="bk-name" title={s.team.name}>{s.team.name}</span>
        </>
      ) : (
        <>
          <span className="bk-cands" aria-hidden="true">
            {s.cands.length === 2 ? s.cands.map((c) => <Crest key={c.id} url={c.logo} size={16} />) : <Crest size={20} />}
          </span>
          <span className="bk-name bk-tbd">A definir<span className="sr-only">{s.cands.length === 2 ? `: el ganador de ${names(s.cands)}` : ''}</span></span>
        </>
      )}
      {s.seed && <small className="bk-seed" title={`${s.seed.slice(1)}.º de la Zona ${s.seed[0]}`}>{s.seed[1]}{s.seed[0]}</small>}
      {shown && (
        <b className="bk-score num">
          {s.score ?? 0}
          {s.pen != null && <small> ({s.pen})</small>}
        </b>
      )}
      {win && <span className="sr-only"> (pasa)</span>}
    </div>
  );
}

function Meta({ m }) {
  if (!m) return <p className="bk-meta">Fecha a confirmar</p>;
  if (m.status === 'in') return <p className="bk-meta"><span className="live-pill">{m.clock ?? 'En vivo'}</span></p>;
  const off = offLabel(m);
  if (off) return <p className="bk-meta"><span className="tag tag-off">{off}</span></p>;
  if (m.completed) return <p className="bk-meta">{m.statusName === 'STATUS_FINAL_PEN' ? 'Final · por penales' : m.statusName === 'STATUS_FINAL_AET' ? 'Final · con alargue' : 'Final'}</p>;
  return <p className="bk-meta">{when(m)}</p>;
}

function Tie({ tie }) {
  const velez = tie.sides.some((s) => s.team?.id === VELEZ_ID);
  return (
    <div className={`bk-tie${velez ? ' is-velez' : ''}${tie.match?.status === 'in' ? ' is-live' : ''}`}>
      {tie.sides.map((s, i) => <Side key={s.team?.id ?? `tbd-${i}`} s={s} tie={tie} />)}
      <Meta m={tie.match} />
    </div>
  );
}

/**
 * `standings` = la tabla de la fase regular (zonas y rondas de playoffs), `base` = playoffs.json del deploy,
 * `live` = partidos de playoffs del scoreboard del día (de useLiveData), `now` y `refresh` = hora (useNow) y hora de
 * los datos en vivo (para volver a pedir un día atrasado).
 */
export function Cuadro({ standings, base, live, now, refresh }) {
  const scroller = useRef(null);
  const scrolled = useRef(false);
  const known = mergePlayoffEvents(base.events, live);
  // Partidos de días anteriores que el deploy todavía no tiene terminados: se pide ese día (casi nunca pasa).
  const stale = staleDays(known, now);
  const late = useCached(stale.length ? `po-${stale.join(',')}` : null, () => Promise.all(stale.map((d) => fetchPlayoffDay(d, standings))).then((x) => x.flat()), {
    ttl: STALE_TTL_MS, refresh, keep: true,
  });
  const events = mergePlayoffEvents(base.events, late ?? [], live);
  const bracket = buildBracket({ groups: standings.groups, rounds: standings.playoffRounds, events, seeds: rulesApply(standings.year) ? PLAYOFF_SEEDS : null });
  const current = currentRound(bracket);

  // En el celular el cuadro se desliza de costado: arranca en la ronda que se está jugando (una vez).
  useEffect(() => {
    const el = scroller.current;
    if (!el || scrolled.current || el.scrollWidth <= el.clientWidth) return;
    scrolled.current = true;
    const col = el.querySelectorAll('.bk-round')[current];
    if (col) el.scrollLeft = col.offsetLeft - el.firstElementChild.offsetLeft;
  }, [current]);

  const phase = `${(standings.phase ?? '').replace(/^Torneo /, '')} ${standings.year ?? ''}`.trim();
  const lines = velezLines(bracket, phase);
  return (
    <section className="block" id="playoffs" aria-labelledby="t-cuadro">
      <h2 className="h2" id="t-cuadro">Playoffs del {phase}</h2>
      {lines && (
        <div className="card po-summary">
          <p className="kicker">Vélez en el cuadro</p>
          <Lines items={lines} />
        </div>
      )}
      <div className="bk-scroll" ref={scroller} tabIndex={0} aria-label="Cuadro de los playoffs (se desliza de costado)">
        <ol className={`bk ${bracket.tree ? 'bk-tree' : 'bk-flat'}`} style={{ '--bk-cols': bracket.rounds.length }}>
          {bracket.rounds.map((r, ri) => {
            // En el cuadro, de a dos (los que se cruzan en la ronda siguiente); en el plano, todos juntos.
            const size = bracket.tree ? 2 : Math.max(r.ties.length, 1);
            const pairs = [];
            for (let i = 0; i < r.ties.length; i += size) pairs.push(r.ties.slice(i, i + size));
            return (
              <li key={r.id} className={`bk-round${ri === current ? ' is-current' : ''}`}>
                <h3 className="bk-title">{r.label}</h3>
                <div className="bk-ties">
                  {r.ties.length ? pairs.map((pair, pi) => (
                    <div key={pi} className="bk-pair">
                      {pair.map((t, ti) => <div key={t.match?.id ?? ti} className="bk-slot"><Tie tie={t} /></div>)}
                    </div>
                  )) : <p className="muted small">Todavía no hay cruces.</p>}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
      <p className="muted small">
        {bracket.tree
          ? 'Partido único. Los octavos cruzan a cada zona con la otra según la tabla (1.º A con 8.º B, 2.º A con 7.º B y así); el número junto a cada equipo es su puesto. '
          : 'Partido único. Se muestran los cruces que ya publicó ESPN. '}
        Los resultados se actualizan solos: cada 5 minutos y, mientras se juega un partido del cuadro, cada minuto.
      </p>
    </section>
  );
}

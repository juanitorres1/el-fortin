// Probables formaciones (en «La previa»): el último once titular de Vélez y del próximo rival, dibujado en una cancha.
// Sale del detalle del último partido de cada uno en ESPN, pedido en el navegador. No es la formación confirmada.
import { useState } from 'react';
import { VELEZ_ID, fetchSummary, fetchTeamSchedule, lineupFromSummary } from '../lib/espn.js';
import { fmt } from '../lib/core.js';
import { useCached } from '../hooks/data.js';
import { Segmented } from '../components/ui.jsx';

const TTL_MS = 30 * 60 * 1000;
const memo = new Map();
/** Calendario de un equipo, compartido entre las tarjetas de la previa (se pide una vez cada 30 min). */
export function scheduleOf(teamId) {
  const c = memo.get(teamId);
  if (c && Date.now() - c.at < TTL_MS) return c.promise;
  const promise = fetchTeamSchedule(teamId);
  promise.catch(() => memo.delete(teamId));
  memo.set(teamId, { at: Date.now(), promise });
  return promise;
}

async function lineupOf(match, teamId) {
  const lu = lineupFromSummary(await fetchSummary(match), teamId);
  if (!lu) return null;
  const home = String(match.home.id) === String(teamId);
  return { ...lu, vs: (home ? match.away : match.home).name, date: match.date };
}

function Pitch({ lu, velez }) {
  if (!lu.rows) {
    return <ol className="fm-list">{lu.players.map((p) => <li key={p.id}>{p.jersey && <b className="num">{p.jersey}</b>} {p.name}</li>)}</ol>;
  }
  return (
    <div className={`fm-pitch${velez ? ' is-velez' : ''}`} role="img" aria-label={`Formación ${lu.formation ?? ''}: ${lu.rows.map((r) => r.map((p) => p.name).join(', ')).join('; ')}`}>
      {[...lu.rows].reverse().map((row) => (
        <div key={row.map((p) => p.id).join()} className="fm-row">
          {row.map((p) => (
            <span key={p.id} className="fm-player">
              <b className="fm-dot num">{p.jersey ?? ''}</b>
              <span className="fm-name">{p.short}</span>
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

/** `last` = último partido terminado de Vélez; `rival` = el próximo rival ({ id, name }). */
export function Formaciones({ last, rival }) {
  const velez = useCached(last ? `once-${last.id}` : null, () => lineupOf(last, VELEZ_ID));
  const other = useCached(rival ? `once-rival-${rival.id}` : null, async () => {
    const m = (await scheduleOf(rival.id)).filter((x) => x.completed).at(-1);
    return m ? lineupOf(m, rival.id) : null;
  });
  const [pick, setPick] = useState('velez');
  const teams = [velez && { key: 'velez', name: 'Vélez', lu: velez }, other && { key: 'rival', name: rival.name, lu: other }].filter(Boolean);
  if (!teams.length) return null;
  const active = teams.find((t) => t.key === pick) ?? teams[0];
  return (
    <article className="card previa-card fm" aria-labelledby="t-formaciones">
      <h3 className="kicker" id="t-formaciones">Probables formaciones</h3>
      {teams.length > 1 && (
        <div className="fm-switch"><Segmented label="Equipo" options={teams.map((t) => ({ value: t.key, label: t.name }))} value={active.key} onChange={setPick} /></div>
      )}
      <div className="fm-teams">
        {teams.map((t) => (
          <div key={t.key} className={`fm-team${t.key === active.key ? ' is-active' : ''}`}>
            <p className="fm-head"><strong>{t.name}</strong>{t.lu.formation && <span className="num"> · {t.lu.formation}</span>}</p>
            <Pitch lu={t.lu} velez={t.key === 'velez'} />
            <p className="muted small">Último once: vs {t.lu.vs}, {fmt.day.format(new Date(t.lu.date))} {fmt.mon.format(new Date(t.lu.date)).replace('.', '')}</p>
          </div>
        ))}
      </div>
      <p className="muted small">Son los titulares del último partido de cada uno, según ESPN: no es la formación confirmada.</p>
    </article>
  );
}

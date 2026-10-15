// Goleadores del torneo en curso (top 10 de ESPN), con Vélez resaltado.
import { VELEZ_ID, fetchScorers } from '../lib/espn.js';
import { plural } from '../lib/core.js';
import { useCached } from '../hooks/data.js';
import { Crest } from '../components/ui.jsx';

const TTL_MS = 15 * 60 * 1000;

/** `players` = players.json (para nombrar al goleador de Vélez si no está en el top 10). */
export function Goleadores({ standings, players, refresh }) {
  const scorers = useCached(standings?.phaseKey ?? null, () => fetchScorers(standings), { ttl: TTL_MS, refresh });
  if (!scorers?.length) return null;
  const phase = (standings.phase ?? '').replace('Torneo ', '');
  const year = standings.year ?? new Date().getFullYear();
  const own = players?.tournaments?.find((t) => t.label === `${phase} ${year}`)?.players?.[0];
  const ownNote = !scorers.some((s) => s.team?.id === VELEZ_ID) && own?.g ? `El goleador de Vélez en el ${phase} es ${own.name}, con ${plural(own.g, 'gol', 'goles')}. ` : '';
  return (
    <section className="block" id="goleadores" aria-labelledby="t-goleadores">
      <h2 className="h2" id="t-goleadores">{phase ? `Goleadores del ${phase}` : 'Goleadores'}</h2>
      <ol className="scorers-list">
        {scorers.map((s, i) => (
          <li key={s.id || s.name} className={`scorer${s.team?.id === VELEZ_ID ? ' is-velez' : ''}`}>
            {/* Empatados comparten puesto: solo el primero lleva el número. */}
            <span className="scorer-pos num">{i > 0 && scorers[i - 1].goals === s.goals ? '' : i + 1}</span>
            <div className="scorer-main">
              <strong>{s.name}</strong>
              <small>{s.team && <><Crest url={s.team.logo} size={18} />{s.team.name}</>}{s.pj ? ` · ${s.pj} PJ` : ''}</small>
            </div>
            <b className="num scorer-goals">{s.goals}<small>goles</small></b>
          </li>
        ))}
      </ol>
      <p className="muted small">{ownNote}Los 10 primeros según ESPN; el equipo es el actual del jugador.</p>
    </section>
  );
}

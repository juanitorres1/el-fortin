// Fila de partido (fixture, resultados, copas, historial) y lista de partidos.
import { velezView } from '../lib/espn.js';
import { fmt } from '../lib/core.js';
import { offLabel } from '../lib/alerts.js';
import { isNeutral } from '../lib/facts.js';
import { Crest, Empty, ResultBadge, Skeletons } from './ui.jsx';

// Las copas anteriores a 2001 (copas-historicas.json) traen la ronda, la cancha neutral explícita y a veces no se
// sabe quién fue local; el resto dice local o visitante, como siempre. También pueden traer `title` (el partido que le
// dio la copa a Vélez: etiqueta «Campeón») y `note` (aclaración breve, abajo). Los de ESPN no tienen ninguno de los dos.
// Un partido de ESPN en cancha neutral (Copa Argentina, finales) también viene con «local»: se deduce (isNeutral).
// ESPN no siempre manda el resultado de la definición: si no está, igual se aclara que se definió por penales (el
// 0-0 con Boca dice «Perdió» y sin esto parecía un error).
export const byPenalties = (m, velez, rival) => m.completed && velez.score != null && velez.score === rival.score && velez.winner !== rival.winner;
const where = (m, velezHome, velez, rival) => [
  m.season && m.round,
  m.venueUnknown ? null : isNeutral(m) ? 'Cancha neutral' : velezHome ? 'Local' : 'Visitante',
  velez.pen != null && rival.pen != null ? `Penales ${velez.pen}-${rival.pen}` : byPenalties(m, velez, rival) && `${velez.winner ? 'Ganó' : 'Perdió'} por penales`,
].filter(Boolean).join(' · ');

export function MatchRow({ m, showYear = false }) {
  const d = new Date(m.date);
  const { velezHome, velez, rival, result } = velezView(m);
  const off = offLabel(m); // «Postergado», «Suspendido» o «Cancelado»: va en lugar de la hora, que ya no vale
  return (
    <li className="match">
      <div className="match-date">
        {m.date ? (
          <>
            <b>{fmt.day.format(d)}</b>
            <span>{fmt.mon.format(d).replace('.', '')}{showYear ? ` ${fmt.year.format(d)}` : ''}</span>
          </>
        ) : <b className="is-year">{m.year}</b>}
      </div>
      <div className="match-main">
        <div className="match-rival"><Crest url={rival.logo} size={24} /><span>{rival.name}</span></div>
        <div className="match-sub">
          {m.title && <span className="tag tag-title"><span aria-hidden="true">★ </span>Campeón</span>}
          <span className="tag">{m.season ?? m.comp}</span>{where(m, velezHome, velez, rival)}{m.venue ? ` · ${m.venue}` : ''}
        </div>
        {m.note && <p className="match-note">{m.note}</p>}
      </div>
      <div className="match-score">
        {m.completed ? (
          // En las listas el marcador va siempre con Vélez primero (la fila es «el partido de Vélez contra…»); el Inicio y el
          // modo cancha lo muestran local-visitante, con los dos escudos. Para que no se lea al revés, se aclara.
          <><span className="score" title={`Vélez ${velez.score}, ${rival.name} ${rival.score}`}><span className="sr-only">Vélez </span>{velez.score}-{rival.score}</span><ResultBadge result={result} /></>
        ) : m.status === 'in' ? (
          <><span className="live-pill">{m.clock ?? 'En vivo'}</span><span className="score">{velez.score ?? 0}-{rival.score ?? 0}</span></>
        ) : off ? (
          <span className="tag tag-off">{off}</span>
        ) : (
          <span className="match-time">{m.timeValid ? fmt.time.format(d) : 'A conf.'}</span>
        )}
      </div>
    </li>
  );
}

/** Lista de partidos. `matches` undefined = cargando (esqueletos). */
export function MatchList({ matches, empty = 'Sin partidos.', showYear = false }) {
  return (
    <ol className="match-list">
      {matches === undefined ? <Skeletons n={4} as="li" />
        : matches.length ? matches.map((m) => <MatchRow key={m.id} m={m} showYear={showYear} />)
        : <Empty as="li">{empty}</Empty>}
    </ol>
  );
}

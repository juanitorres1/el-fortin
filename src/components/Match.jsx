// Fila de partido (fixture, resultados, copas, historial) y lista de partidos.
import { velezView } from '../lib/espn.js';
import { fmt } from '../lib/core.js';
import { Crest, Empty, ResultBadge, Skeletons } from './ui.jsx';

export function MatchRow({ m, showYear = false }) {
  const d = new Date(m.date);
  const { velezHome, velez, rival, result } = velezView(m);
  return (
    <li className="match">
      <div className="match-date">
        {m.date ? (
          <>
            <b>{fmt.day.format(d)}</b>
            <span>{fmt.mon.format(d).replace('.', '')}{showYear ? ` ${fmt.year.format(d).slice(2)}` : ''}</span>
          </>
        ) : <b className="is-year">{m.year}</b>}
      </div>
      <div className="match-main">
        <div className="match-rival"><Crest url={rival.logo} size={24} /><span>{rival.name}</span></div>
        <div className="match-sub">
          <span className="tag">{m.season ?? m.comp}</span>{velezHome ? 'Local' : 'Visitante'}{m.venue ? ` · ${m.venue}` : ''}
        </div>
      </div>
      <div className="match-score">
        {m.completed ? (
          <><span className="score">{velez.score}-{rival.score}</span><ResultBadge result={result} /></>
        ) : m.status === 'in' ? (
          <><span className="live-pill">{m.clock ?? 'En vivo'}</span><span className="score">{velez.score ?? 0}-{rival.score ?? 0}</span></>
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

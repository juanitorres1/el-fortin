// «Así terminó»: el resumen del último partido en el Inicio, durante unos días después de jugarse. Goles con sus
// minutos, expulsados, cambios, las estadísticas de los dos equipos y la figura estadística de Vélez. Todo sale del
// detalle del partido de ESPN, que se pide en el navegador; si no responde, la sección no se muestra.
import { fetchSummary, keyEvents, matchFigure, playersFromSummary, teamStats, velezView } from '../lib/espn.js';
import { capitalize, fmt } from '../lib/core.js';
import { useCached, useNow } from '../hooks/data.js';
import { Crest, ResultBadge } from '../components/ui.jsx';

const SHOW_DAYS = 4; // después, el resumen ya no es noticia: queda el último resultado en «Juega Vélez»
const HEADLINE = { G: 'Ganó Vélez', E: 'Empate', P: 'Perdió Vélez' };

/** Barra de una estadística: la parte de cada equipo sobre el total. */
function StatRow({ s, velezHome }) {
  const total = s.home + s.away || 1;
  const pct = (n) => `${(n / total) * 100}%`;
  const fmtN = (n) => `${Number.isInteger(n) ? n : n.toFixed(1)}${s.unit}`;
  return (
    <li className="rs-stat">
      <span className={`num${velezHome ? ' is-velez' : ''}`}>{fmtN(s.home)}</span>
      <span className="rs-stat-label">{s.label}</span>
      <span className={`num${velezHome ? '' : ' is-velez'}`}>{fmtN(s.away)}</span>
      <span className="rs-bar" aria-hidden="true">
        <i className={velezHome ? 'is-velez' : undefined} style={{ width: pct(s.home) }} />
        <i className={velezHome ? undefined : 'is-velez'} style={{ width: pct(s.away) }} />
      </span>
    </li>
  );
}

/** `match` = el último partido terminado de Vélez. */
export function Resumen({ match }) {
  const now = useNow();
  const recent = match && now - Date.parse(match.date) < SHOW_DAYS * 864e5;
  const detail = useCached(recent ? `resumen-${match.id}` : null, async () => {
    const summary = await fetchSummary(match);
    return { events: keyEvents(summary).reverse(), stats: teamStats(summary, match), figure: matchFigure(playersFromSummary(summary)) };
  });
  if (!recent || !detail) return null;

  const { velezHome, result } = velezView(match);
  const goals = detail.events.filter((e) => e.kind === 'gol' && !/^Penales:/.test(e.text));
  const reds = detail.events.filter((e) => e.kind === 'roja');
  const subs = detail.events.filter((e) => e.kind === 'cambio');
  const d = new Date(match.date);
  return (
    <section className="band band-gray" aria-labelledby="t-resumen">
      <div className="wrap">
        <div className="section-head">
          <h2 className="display previa-title" id="t-resumen">Así terminó</h2>
          <p className="muted small">{capitalize(fmt.long.format(d))} · {match.comp}{match.round ? ` · ${match.round.replace('Torneo ', '')}` : ''}</p>
        </div>
        <div className="rs-grid">
          <article className="card rs-score">
            <p className="kicker"><ResultBadge result={result} /> {HEADLINE[result] ?? 'Final'}</p>
            <div className="rs-teams">
              <span className="rs-team"><Crest url={match.home.logo} size={48} />{match.home.name}</span>
              <b className="num rs-result">{match.home.score}-{match.away.score}</b>
              <span className="rs-team"><Crest url={match.away.logo} size={48} />{match.away.name}</span>
            </div>
            {match.home.pen != null && <p className="muted small">Penales: {match.home.pen}-{match.away.pen}</p>}
            {goals.length > 0 && (
              <ul className="rs-events">
                {goals.map((e) => <li key={e.id} className={e.velez ? 'is-velez' : undefined}><b className="num">{e.minute}</b> {e.text}{e.team && <small> · {e.team}</small>}</li>)}
              </ul>
            )}
            {reds.length > 0 && (
              <ul className="rs-events">
                {reds.map((e) => <li key={e.id}><b className="num">{e.minute}</b> <span className="pl-mark pl-r" aria-hidden="true" /> {e.text}{e.team && <small> · {e.team}</small>}</li>)}
              </ul>
            )}
            {subs.length > 0 && (
              <details className="rs-subs">
                <summary>Cambios ({subs.length})</summary>
                <ul className="rs-events">{subs.map((e) => <li key={e.id}><b className="num">{e.minute}</b> {e.text}{e.team && <small> · {e.team}</small>}</li>)}</ul>
              </details>
            )}
          </article>
          {(detail.stats.length > 0 || detail.figure) && (
            <article className="card rs-side">
              {detail.figure && (
                <div className="rs-figure">
                  <p className="kicker">Figura de Vélez (por los números)</p>
                  <p><a href={`jugador.html?id=${encodeURIComponent(detail.figure.id)}`}><strong>{detail.figure.name}</strong></a>{detail.figure.line && <span className="muted"> · {detail.figure.line}</span>}</p>
                </div>
              )}
              {detail.stats.length > 0 && (
                <>
                  <p className="kicker">Estadísticas</p>
                  <ul className="rs-stats" aria-label={`Estadísticas: ${match.home.name} a la izquierda, ${match.away.name} a la derecha`}>
                    {detail.stats.map((s) => <StatRow key={s.key} s={s} velezHome={velezHome} />)}
                  </ul>
                </>
              )}
              <p className="muted small">Datos de ESPN. La figura es una cuenta con goles, asistencias, remates al arco y atajadas.</p>
            </article>
          )}
        </div>
      </div>
    </section>
  );
}


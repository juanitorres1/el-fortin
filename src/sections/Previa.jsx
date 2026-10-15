// «La previa»: rachas, historial con el próximo rival y un día como hoy. Sale de facts.json (lo genera el deploy)
// más los resultados en vivo, para que un partido que terminó hace minutos ya cuente en la racha.
import { VELEZ_ID } from '../lib/espn.js';
import { monthDay, streakLines } from '../lib/facts.js';
import { useNow } from '../hooks/data.js';
import { Lines } from '../components/ui.jsx';

function RivalCard({ rf }) {
  const items = [
    rf.last && `Último partido: ${rf.last.score} (${rf.last.year})`,
    // Si el último partido fue triunfo, «último triunfo» repetiría lo mismo.
    rf.last?.result === 'G' ? null : rf.lastWin ? `Último triunfo: ${rf.lastWin.score} en ${rf.lastWin.year}` : 'No le ganó en ningún partido oficial registrado',
    rf.streak,
  ].filter(Boolean);
  return (
    <article className="card previa-card">
      <h3 className="kicker">Historial con {rf.name}</h3>
      <dl className="previa-h2h">
        <div><dt>Ganó</dt><dd className="num">{rf.g}</dd></div>
        <div><dt>Empató</dt><dd className="num">{rf.e}</dd></div>
        <div><dt>Perdió</dt><dd className="num">{rf.p}</dd></div>
      </dl>
      <Lines items={items} />
      <a href={`historial.html?rival=${encodeURIComponent(rf.id)}`}>Ver los {rf.pj} partidos</a>
    </article>
  );
}

/** `facts` = facts.json; `data` = datos en vivo. No muestra nada si no hay tarjetas. */
export function Previa({ facts, data }) {
  const now = useNow();
  if (!facts || !data) return null;
  const byId = new Map(facts.recent.map((m) => [m.id, m]));
  for (const m of data.results) byId.set(m.id, m);
  const streaks = streakLines([...byId.values()]);

  const next = data.fixture.find((m) => !m.completed);
  const rival = next && (next.home.id === VELEZ_ID ? next.away : next.home);
  const rf = rival && facts.rivals[rival.id];
  const today = facts.days[monthDay(new Date(now))] ?? [];
  if (!streaks.length && !rf && !today.length) return null;

  return (
    <section className="band" aria-labelledby="t-previa">
      <div className="wrap">
        <h2 className="display previa-title" id="t-previa">La previa</h2>
        <div className="previa-grid">
          {streaks.length > 0 && <article className="card previa-card"><h3 className="kicker">Racha</h3><Lines items={streaks} /></article>}
          {rf && <RivalCard rf={rf} />}
          {today.length > 0 && (
            <article className="card previa-card">
              <h3 className="kicker">Un día como hoy</h3>
              <ul className="previa-days">
                {today.map((d) => (
                  <li key={`${d.year}-${d.text}`}>
                    <b className="num">{d.year}</b>
                    <span>{d.kind === 'momento' ? <a href="club.html#momentos">{d.text}</a> : d.text}</span>
                  </li>
                ))}
              </ul>
            </article>
          )}
        </div>
      </div>
    </section>
  );
}

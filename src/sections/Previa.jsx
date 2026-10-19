// «La previa»: rachas, historial con el próximo rival, cómo llega el rival y un día como hoy. Sale de facts.json (lo
// genera el deploy) más los resultados en vivo, para que un partido que terminó hace minutos ya cuente en la racha.
// Cómo llega el rival (sus últimos partidos y goleadores) se pide a ESPN en el navegador.
import { VELEZ_ID, fetchScorers, fetchTeamSchedule } from '../lib/espn.js';
import { monthDay, streakLines, teamForm } from '../lib/facts.js';
import { useCached, useNow } from '../hooks/data.js';
import { Lines, ResultBadge } from '../components/ui.jsx';

const FORM_TTL_MS = 30 * 60 * 1000;
const rec = (r) => `${r.g} G · ${r.e} E · ${r.p} P`;

/** Cómo llega el rival: últimos 5 resultados, posición, cómo le va de local o visitante, goles y su goleador. */
function RivalForm({ rival, velezHome, standings }) {
  const form = useCached(`forma-${rival.id}`, async () => teamForm(await fetchTeamSchedule(rival.id), rival.id), { ttl: FORM_TTL_MS });
  const scorers = useCached(standings?.phaseKey ? `goleadores-${standings.phaseKey}` : null, () => fetchScorers(standings), { ttl: FORM_TTL_MS });
  if (!form) return null; // cargando o ESPN no respondió: mejor no mostrar una tarjeta vacía
  const zone = standings?.groups.find((g) => g.rows.some((r) => r.id === rival.id));
  const row = zone?.rows.find((r) => r.id === rival.id);
  const scorer = scorers?.find((x) => x.team?.id === rival.id);
  const items = [
    row && `${row.rank}.º en la ${zone.name} con ${row.pts} puntos`,
    // Si Vélez es local, al rival le importa cómo le va de visitante (y al revés).
    velezHome ? `De visitante: ${rec(form.away)}` : `De local: ${rec(form.home)}`,
    `${form.gf} goles a favor y ${form.gc} en contra en ${form.pj} partidos`,
    scorer && `Su goleador: ${scorer.name} (${scorer.goals} ${scorer.goals === 1 ? 'gol' : 'goles'})`,
  ].filter(Boolean);
  return (
    <article className="card previa-card">
      <h3 className="kicker">Cómo llega {rival.name}</h3>
      <ol className="form-strip previa-form" aria-label={`Últimos ${form.last.length} resultados de ${rival.name}, del más viejo al más reciente`}>
        {[...form.last].reverse().map((m) => (
          <li key={m.id} title={`${m.score} vs ${m.rival}`}>
            <ResultBadge result={m.result} />
            <small>{m.score}<span className="sr-only"> contra {m.rival}{m.home ? ', de local' : ', de visitante'}</span></small>
          </li>
        ))}
      </ol>
      <Lines items={items} />
    </article>
  );
}

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
  if (!streaks.length && !rf && !rival && !today.length) return null;

  return (
    <section className="band" aria-labelledby="t-previa">
      <div className="wrap">
        <h2 className="display previa-title" id="t-previa">La previa</h2>
        <div className="previa-grid">
          {streaks.length > 0 && <article className="card previa-card"><h3 className="kicker">Racha</h3><Lines items={streaks} /></article>}
          {rf && <RivalCard rf={rf} />}
          {rival && <RivalForm rival={rival} velezHome={next.home.id === VELEZ_ID} standings={data.standings} />}
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

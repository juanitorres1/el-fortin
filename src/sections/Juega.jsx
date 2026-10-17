// «Juega Vélez»: próximo partido (o el que se está jugando), cuenta regresiva, minuto a minuto, pronóstico,
// último resultado y posición. Va en la banda azul del Inicio.
import { VELEZ_ID, fetchSummary, keyEvents, velezView } from '../lib/espn.js';
import { fetchForecast, wantsForecast } from '../lib/weather.js';
import { capitalize, fmt, withTimeout } from '../lib/core.js';
import { streakLines } from '../lib/facts.js';
import { previaCard, resultCard, scorersLine } from '../lib/card.js';
import { useCached, useNow } from '../hooks/data.js';
import { Crest, ResultBadge, Skeletons } from '../components/ui.jsx';
import { ShareCardButton } from '../components/ShareCard.jsx';

const WEATHER_TTL_MS = 60 * 60 * 1000; // el Inicio se refresca cada 5 min; el pronóstico alcanza con pedirlo cada hora
const KIND_LABEL = { gol: 'Gol', amarilla: 'Amarilla', roja: 'Roja', cambio: 'Cambio', penal: 'Penal' };

export function Countdown({ date }) {
  // Cada 30 s alcanza: la cuenta muestra minutos (sin segundos que obliguen a redibujar cada segundo).
  const now = useNow(30_000);
  const diff = Math.max(0, date - now);
  const parts = [[Math.floor(diff / 864e5), 'días'], [Math.floor(diff / 36e5) % 24, 'horas'], [Math.floor(diff / 6e4) % 60, 'min']];
  return (
    <div className="countdown" role="timer" aria-label="Falta para el partido">
      {parts.map(([n, l]) => <div key={l}><b className="num">{String(n).padStart(2, '0')}</b><span>{l}</span></div>)}
    </div>
  );
}

/** Minuto a minuto: el detalle del partido se pide en cada refresco (cada 1 min mientras se juega). */
export function LiveEvents({ match, refresh }) {
  const events = useCached(`${match.id}-${refresh}`, async () => keyEvents(await fetchSummary(match)));
  if (!events?.length) return null;
  return (
    <div className="live-events">
      <h3 className="live-events-title">Minuto a minuto</h3>
      <ol className="live-list">
        {events.map((e) => (e.kind === 'pausa' ? (
          <li key={e.id} className="ev-pausa"><span className="ev-min num">{e.minute}</span><span>{e.text}</span></li>
        ) : (
          <li key={e.id} className={`ev-${e.kind}`}>
            <span className="ev-min num">{e.minute}</span>
            <span><b className="ev-tag">{KIND_LABEL[e.kind]}</b> {e.text}{e.team && <span className="ev-team"> · {e.team}</span>}</span>
          </li>
        )))}
      </ol>
      <p className="ev-note">Fuente: ESPN. Puede llegar con un par de minutos de atraso.</p>
    </div>
  );
}

function Weather({ match, refresh }) {
  const w = useCached(wantsForecast(match) ? match.id : null, () => fetchForecast(match), { ttl: WEATHER_TTL_MS, refresh });
  if (!w) return null;
  return (
    <div>
      <dt>Pronóstico a la hora del partido</dt>
      <dd><b className="num">{w.temp}°</b> {w.text}{w.rain != null && ` · ${w.rain}% de lluvia`}</dd>
    </div>
  );
}

function Facts({ last, zone, row, children }) {
  let lastFact = null;
  if (last) {
    const { velezHome, velez, rival, result } = velezView(last);
    const [h, a] = velezHome ? [velez, rival] : [rival, velez];
    lastFact = <div><dt>Último resultado</dt><dd><ResultBadge result={result} /> {h.name} {h.score}-{a.score} {a.name}</dd></div>;
  }
  return (
    <dl className="juega-facts">
      {lastFact}
      {row && <div><dt>Posición</dt><dd><b className="num">{row.rank}°</b> en la {zone.name} · {row.pts} pts</dd></div>}
      {children}
    </dl>
  );
}

// El escudo de Vélez en ESPN tiene la estrella arriba y es angosto: dibuja un 39 % de la imagen contra ~50 % de la
// mayoría de los rivales, y al mismo tamaño se ve más chico. Se agranda ~20 % (ver .juega-team.is-velez).
function Team({ t }) {
  const isVelez = t.id === VELEZ_ID;
  return <div className={`juega-team${isVelez ? ' is-velez' : ''}`}><Crest url={t.logo} size={isVelez ? 78 : 64} /><span>{t.name}</span></div>;
}

/** Compartir el último resultado y la previa del próximo partido como imagen. */
function Share({ last, next, results, facts, zone, row }) {
  const streak = streakLines(results)[0];
  const rival = next && (next.home.id === VELEZ_ID ? next.away : next.home);
  const lastCard = async () => {
    // Los goleadores salen del detalle del partido (ESPN); si no responde, la tarjeta va sin ellos.
    const events = await withTimeout(fetchSummary(last), 5000).then(keyEvents).catch(() => null);
    const position = row && zone ? `${row.rank}.º en la ${zone.name} con ${row.pts} puntos` : null;
    return resultCard(last, { scorers: scorersLine(events), streak, position });
  };
  return (
    <div className="juega-share">
      {last && <ShareCardButton className="btn btn-ghost" label="Compartir el resultado" file="velez-resultado.png" getCard={lastCard} />}
      {next && next.status !== 'in' && (
        <ShareCardButton className="btn btn-ghost" label="Compartir la previa" file="velez-previa.png" getCard={() => previaCard(next, { rf: facts?.rivals?.[rival.id], streak })} />
      )}
    </div>
  );
}

/** `state` = useLiveData(); `results` = resultados oficiales en orden; `facts` = facts.json (para la previa). */
export function Juega({ state, results, facts }) {
  const now = useNow(60_000);
  if (state.status === 'loading') return <Skeletons className="sk-juega" />;
  if (state.status === 'error') {
    return <><h2 className="juega-title">Juega Vélez</h2><p className="juega-empty">No pudimos cargar los partidos. Probá en un rato.</p></>;
  }
  const { data } = state;
  const next = data.fixture.find((m) => m.status === 'in') ?? data.fixture.find((m) => !m.completed);
  const zone = data.standings.groups.find((g) => g.rows.some((r) => r.id === VELEZ_ID));
  const row = zone?.rows.find((r) => r.id === VELEZ_ID);
  const info = { last: results.at(-1), zone, row };

  if (!next) {
    return <><h2 className="juega-title">Juega Vélez</h2><p className="juega-empty">Todavía no hay partidos programados.</p><Facts {...info} /><Share {...info} results={results} facts={facts} /></>;
  }
  const d = new Date(next.date);
  const isLive = next.status === 'in';
  // Dos columnas en escritorio (el partido | cuenta regresiva y datos); una en celular.
  return (
    <>
      <div className="juega-main">
        <h2 className="juega-title">{isLive ? <span className="live-pill">En vivo</span> : 'Juega Vélez'}</h2>
        <p className="juega-comp">{next.comp}{next.round && ` · ${next.round.replace('Torneo ', '')}`}</p>
        <div className="juega-teams">
          <Team t={next.home} />
          {isLive ? <span className="juega-score num">{next.home.score ?? 0}-{next.away.score ?? 0}</span> : <span className="juega-vs">vs</span>}
          <Team t={next.away} />
        </div>
        <p className="juega-when">
          {capitalize(fmt.long.format(d))}{next.timeValid ? ` · ${fmt.time.format(d)} h` : ' · hora a confirmar'}{next.venue && ` · ${next.venue}`}
        </p>
      </div>
      <div className="juega-side">
        {isLive ? <LiveEvents match={next} refresh={data.updatedAt} /> : <Countdown date={d} />}
        <Facts {...info}>{!isLive && <Weather match={next} refresh={data.updatedAt} />}</Facts>
        <a className="btn btn-on-accent" href="partidos.html">Fixture y tablas</a>
        <div className="juega-links">
          <a className="juega-link" href="partidos.html#agendar">Agendar los partidos</a>
          {next.home.id === VELEZ_ID && <a className="juega-link" href="club.html#como-llegar">Cómo llegar a la cancha</a>}
          {(isLive || d - now < 6 * 36e5) && <a className="juega-link" href="vivo.html">Modo cancha</a>}
        </div>
        <Share {...info} next={next} results={results} facts={facts} />
      </div>
    </>
  );
}

// Modo cancha: el partido de Vélez en grande, el minuto a minuto, los otros partidos de la fecha y la tabla de la
// zona como quedaría si todo terminara así. Pensado para el celular en la tribuna: letra grande, poco para leer,
// se refresca solo (cada 1 min mientras se juega) y puede dejar la pantalla prendida.
import { useEffect, useRef, useState } from 'react';
import { mount } from '../main.jsx';
import { VELEZ_ID, fetchScoreboard } from '../lib/espn.js';
import { capitalize, espnDay, fmt, liveStandings, sourceNote } from '../lib/core.js';
import { useCached, useLiveData } from '../hooks/data.js';
import { useLiveTitle } from '../hooks/page.js';
import { Layout } from '../components/Layout.jsx';
import { Crest, Empty, Skeletons } from '../components/ui.jsx';
import { Countdown, LiveEvents } from '../sections/Juega.jsx';

/** «Mantener la pantalla prendida» (Wake Lock): solo si el navegador lo permite. */
function WakeLock() {
  const [supported, setSupported] = useState(false);
  const [on, setOn] = useState(false);
  const lock = useRef(null);
  useEffect(() => {
    setSupported('wakeLock' in navigator);
    // Al volver a la pestaña el navegador suelta el bloqueo: se pide de nuevo si estaba prendido.
    const again = async () => {
      if (document.visibilityState === 'visible' && lock.current?.released) lock.current = await navigator.wakeLock.request('screen').catch(() => null);
    };
    document.addEventListener('visibilitychange', again);
    return () => {
      document.removeEventListener('visibilitychange', again);
      lock.current?.release();
    };
  }, []);
  if (!supported) return null;
  const toggle = async () => {
    if (on) {
      await lock.current?.release();
      lock.current = null;
      setOn(false);
    } else {
      lock.current = await navigator.wakeLock.request('screen').catch(() => null);
      setOn(Boolean(lock.current));
    }
  };
  return <button type="button" className="btn btn-ghost" aria-pressed={on} onClick={toggle}>{on ? 'Pantalla prendida ✓' : 'Mantener la pantalla prendida'}</button>;
}

function Other({ m }) {
  const live = m.status === 'in';
  return (
    <li className={m.home.id === VELEZ_ID || m.away.id === VELEZ_ID ? 'is-velez' : undefined}>
      <span className="vivo-o-team"><Crest url={m.home.logo} size={20} />{m.home.name}</span>
      <span className="vivo-o-score num">
        {m.status === 'pre' ? (m.timeValid ? fmt.time.format(new Date(m.date)) : '—') : `${m.home.score ?? 0}-${m.away.score ?? 0}`}
      </span>
      <span className="vivo-o-team is-away">{m.away.name}<Crest url={m.away.logo} size={20} /></span>
      <span className={`vivo-o-state${live ? ' is-live' : ''}`}>{live ? m.clock ?? 'En vivo' : m.completed ? 'Final' : ''}</span>
    </li>
  );
}

function Vivo() {
  const state = useLiveData();
  const data = state.data;
  useLiveTitle(data?.fixture);
  const match = data && (data.fixture.find((m) => m.status === 'in') ?? data.fixture.find((m) => !m.completed));
  const day = match ? espnDay(new Date(match.date)) : null;
  const leagueMatch = match?.compSlug === 'arg.1';
  // Los otros partidos de la fecha: se piden con cada refresco de los datos en vivo.
  const others = useCached(leagueMatch ? `${day}-${data.updatedAt}` : null, () => fetchScoreboard(day));
  const zone = data?.standings.groups.find((g) => g.rows.some((r) => r.id === VELEZ_ID));
  const table = zone && others ? liveStandings(zone.rows, others) : null;
  const anyLive = others?.some((m) => m.status === 'in');

  const isLive = match?.status === 'in';
  return (
    <Layout page="vivo" mainClass="vivo">
      <section className="vivo-band" aria-label="El partido de Vélez">
        <div className="wrap">
          {state.status === 'loading' ? <Skeletons className="sk-juega" />
            : !match ? <p className="juega-empty">No hay partidos de Vélez programados.</p>
            : (
              <>
                <p className="vivo-comp">{isLive ? <span className="live-pill">{match.clock ?? 'En vivo'}</span> : `${capitalize(fmt.long.format(new Date(match.date)))}${match.timeValid ? ` · ${fmt.time.format(new Date(match.date))} h` : ''}`}{` · ${match.comp}`}</p>
                <div className="vivo-score">
                  <div className="vivo-team"><Crest url={match.home.logo} size={72} /><span>{match.home.name}</span></div>
                  <b className={`num${isLive ? '' : ' is-vs'}`}>{isLive ? `${match.home.score ?? 0}-${match.away.score ?? 0}` : 'vs'}</b>
                  <div className="vivo-team"><Crest url={match.away.logo} size={72} /><span>{match.away.name}</span></div>
                </div>
                {!isLive && <Countdown date={new Date(match.date)} />}
                {isLive && <div className="vivo-events"><LiveEvents match={match} refresh={data.updatedAt} /></div>}
                <div className="vivo-tools">
                  <WakeLock />
                  <a className="btn btn-ghost" href="./">Volver al inicio</a>
                </div>
              </>
            )}
        </div>
      </section>
      <div className="wrap page">
        {leagueMatch && (
          <div className="two-col">
            <section className="block" aria-labelledby="t-fecha">
              <h2 className="h2" id="t-fecha">La fecha</h2>
              {others === undefined ? <Skeletons n={4} className="sk-row" />
                : others?.length ? <ol className="vivo-others">{others.map((m) => <Other key={m.id} m={m} />)}</ol>
                : <Empty>No pudimos cargar los otros partidos del día.</Empty>}
            </section>
            {table && (
              <section className="block" aria-labelledby="t-tabla-vivo">
                <h2 className="h2" id="t-tabla-vivo">{anyLive ? 'Tabla en vivo' : 'Tabla'} · {zone.name}</h2>
                <ol className="sim-table">
                  {table.map((r) => (
                    <li key={r.id} className={r.id === VELEZ_ID ? 'is-velez' : undefined}>
                      <span className="po-pos num">{r.rank}</span>
                      <span className="sim-team"><Crest url={r.logo} size={20} />{r.name}{r.live && <span className="vivo-dot" title="Jugando ahora"><span className="sr-only">(jugando ahora)</span></span>}</span>
                      <span className="sim-move muted small">{r.before > r.rank ? `▲${r.before - r.rank}` : r.before < r.rank ? `▼${r.rank - r.before}` : ''}</span>
                      <b className="num">{r.pts}</b>
                    </li>
                  ))}
                </ol>
                <p className="muted small">{anyLive ? 'Como quedaría si los partidos terminaran así. ' : ''}{data && sourceNote(state.live, data.updatedAt)}</p>
              </section>
            )}
          </div>
        )}
        {!leagueMatch && match && <p className="muted">Los otros resultados y la tabla en vivo aparecen cuando Vélez juega por la Liga.</p>}
      </div>
    </Layout>
  );
}

export default Vivo;
mount(Vivo);

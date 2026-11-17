// Juegos. Del día (los mismos para todos, salen de la fecha): Trivia, Mano a Mano, El Tapado, Trayectoria V, Grilla
// del Fortín y El Once de Liniers (semanal). Del partido: Prode y «Adiviná el once». Y el modo Carrera, que se carga
// aparte (sections/juegos/carrera/) solo al abrir su pestaña. Se ve un juego por vez (pestañas,
// con el #hash en la URL). Lo que elige cada hincha queda en su navegador (lib/storage.js): no hay cuentas ni
// servidor. Se lee en efectos, después de hidratar.
import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { mount } from '../main.jsx';
import { DATA, TZ } from '../lib/core.js';
import { GAMES, gameStreak, markPlayed, nextGame } from '../lib/daily.js';
import { dayNumber } from '../lib/trivia.js';
import { useJson, useLiveData, useNow, useRoster } from '../hooks/data.js';
import { useScrollToHash } from '../hooks/page.js';
import { Layout, PageBand } from '../components/Layout.jsx';
import { Skeletons } from '../components/ui.jsx';
import { useStored } from '../sections/juegos/shared.jsx';
import { Trivia } from '../sections/juegos/Trivia.jsx';
import { ManoAMano } from '../sections/juegos/ManoAMano.jsx';
import { Tapado } from '../sections/juegos/Tapado.jsx';
import { Trayectoria } from '../sections/juegos/Trayectoria.jsx';
import { Grilla } from '../sections/juegos/Grilla.jsx';
import { Liniers } from '../sections/juegos/Liniers.jsx';
import { Prode } from '../sections/juegos/Prode.jsx';
import { Once } from '../sections/juegos/Once.jsx';

const Carrera = lazy(() => import('../sections/juegos/carrera/Carrera.jsx'));

const DAY_MONTH = new Intl.DateTimeFormat('es-AR', { timeZone: TZ, day: '2-digit', month: '2-digit' });

const ABOUT = {
  trivia: ['Trivia del día', 'Cinco preguntas de la historia del club.'],
  duelo: ['Mano a Mano', 'Diez duelos: ¿a quién le ganó más veces Vélez?'],
  tapado: ['El Tapado', 'Adiviná el jugador por sus datos.'],
  trayectoria: ['Trayectoria V', 'Adiviná el jugador por los clubes de su carrera.'],
  grilla: ['Grilla del Fortín', 'Nueve casillas, nueve jugadores que pasaron por Vélez.'],
  liniers: ['El Once de Liniers', 'Los once titulares de un partido para el recuerdo.'],
  prode: ['Prode', 'Tu pronóstico del próximo partido.'],
  once: ['Adiviná el once', 'Los titulares del próximo partido.'],
  carrera: ['Carrera', 'Salís de las inferiores: entrená, ganate el puesto y jugá las jugadas clave de cada partido.'],
};
const isGame = (key) => GAMES.some((g) => g.key === key);

function Juegos() {
  const state = useLiveData();
  const club = useJson('data/club.json');
  const games = useJson(`${DATA}games.json`);
  const roster = useRoster();
  const now = useNow(60_000);
  const day = dayNumber(new Date(now));
  const label = DAY_MONTH.format(new Date(now));
  // El juego elegido sigue al #hash (los links compartidos abren directo en su juego). Se lee al montar: el HTML del
  // deploy es el mismo para todos.
  const [tab, setTab] = useState('trivia');
  useEffect(() => {
    const read = () => {
      const key = location.hash.slice(1);
      if (isGame(key)) setTab(key);
    };
    read();
    addEventListener('hashchange', read);
    return () => removeEventListener('hashchange', read);
  }, []);
  const pick = (key) => {
    setTab(key);
    history.replaceState(null, '', `#${key}`);
  };
  // Racha: días seguidos con al menos un juego del día terminado (los de la trivia de antes también cuentan).
  const [log, setLog] = useStored('jugados', {});
  const [triviaDays] = useStored('trivia-history', {});
  const onDone = (game) => setLog((l) => markPlayed(l, day, game));
  const streak = gameStreak(log, day, Object.keys(triviaDays).map(Number));
  const doneToday = new Set(log[day] ?? []);
  useScrollToHash(club !== undefined && state.status !== 'loading');
  // En el celular las pestañas son una fila que se desliza: la elegida tiene que quedar a la vista.
  const tabsRef = useRef(null);
  useEffect(() => {
    const row = tabsRef.current;
    const on = row?.querySelector('[aria-pressed="true"]');
    if (on) row.scrollTo({ left: on.offsetLeft - (row.clientWidth - on.offsetWidth) / 2 });
  }, [tab]);
  const [title, about] = ABOUT[tab];
  // Al terminar un juego del día, el próximo sin jugar: cambia la pestaña y sube al título del juego nuevo.
  const sectionRef = useRef(null);
  const upNext = doneToday.has(tab) ? nextGame(doneToday, tab) : null;
  const goNext = (key) => {
    pick(key);
    requestAnimationFrame(() => {
      const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
      sectionRef.current?.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' });
      document.getElementById('t-game')?.focus({ preventScroll: true });
    });
  };
  return (
    <Layout page="juegos" band={<PageBand title="Juegos"><p className="lead">Seis juegos del día, el prode, el once y una carrera en Vélez. Para jugar con la V en el pecho.</p></PageBand>}>
      <nav className="games-tabs" aria-label="Elegir juego" ref={tabsRef}>
        {GAMES.map((g) => (
          <button key={g.key} type="button" className="seg" aria-pressed={g.key === tab} onClick={() => pick(g.key)}>
            {g.label}{doneToday.has(g.key) && <><span aria-hidden="true"> ✓</span><span className="sr-only"> (jugado hoy)</span></>}
          </button>
        ))}
      </nav>
      {streak > 0 && (
        <p className="games-streak" role="status" key={doneToday.size}>
          <span className="games-flame" aria-hidden="true">🔥</span><b className="num">{streak}</b> {streak === 1 ? 'día' : 'días seguidos'} jugando{doneToday.size ? '.' : ': jugá hoy para no cortar la racha.'}
        </p>
      )}
      <section className="block game-in" id={tab} key={tab} aria-labelledby="t-game" ref={sectionRef}>
        <div className="section-head"><h2 className="h2" id="t-game" tabIndex={-1}>{title}</h2></div>
        <p className="muted games-about">{about}</p>
        {tab === 'trivia' && <Trivia club={club} onDone={onDone} streak={streak} />}
        {tab === 'duelo' && <ManoAMano day={day} label={label} onDone={onDone} streak={streak} />}
        {tab === 'tapado' && <Tapado day={day} label={label} roster={roster} onDone={onDone} streak={streak} />}
        {tab === 'trayectoria' && <Trayectoria day={day} label={label} onDone={onDone} streak={streak} />}
        {tab === 'grilla' && <Grilla day={day} label={label} onDone={onDone} streak={streak} />}
        {tab === 'liniers' && <Liniers day={day} onDone={onDone} streak={streak} />}
        {tab === 'prode' && <Prode data={state.data} now={now} />}
        {tab === 'once' && <Once data={state.data} roster={roster} games={games} now={now} />}
        {tab === 'carrera' && (
          <Suspense fallback={<Skeletons className="sk-card" />}>
            <Carrera standings={state.data?.standings ?? (state.status === 'loading' ? undefined : null)} roster={roster} />
          </Suspense>
        )}
        {upNext && (
          <div className="card games-next">
            <p><span className="kicker">Seguí con</span><b>{ABOUT[upNext.key][0]}</b><span className="muted small">{ABOUT[upNext.key][1]}</span></p>
            <button type="button" className="btn btn-solid" onClick={() => goNext(upNext.key)}>Jugar {upNext.label} →</button>
          </div>
        )}
        {doneToday.has(tab) && !upNext && GAMES.find((g) => g.key === tab)?.daily && (
          <p className="card games-next muted">Jugaste los seis juegos de hoy. Mañana hay nuevos; mientras, ¿el <button type="button" className="link-btn" onClick={() => goNext('prode')}>prode</button>?</p>
        )}
      </section>
    </Layout>
  );
}

export default Juegos;
mount(Juegos);

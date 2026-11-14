// Hooks de datos. Convención en todo el sitio: `undefined` = cargando, `null` = falló o no hay, otro valor = listo.
// Si la página viene renderizada del deploy, arrancan con los mismos datos que el HTML (src/initial.js): así React
// hidrata sin redibujar y después actualiza en vivo.
import { useEffect, useRef, useState } from 'react';
import { DATA, REFRESH_LIVE_MS, REFRESH_MS, getJson, isLive, keepNewest, loadLive, loadLiveFast, withTimeout } from '../lib/core.js';
import { fetchRoster } from '../lib/espn.js';
import { getInitial } from '../initial.js';
import { load, save } from '../lib/storage.js';

const LIVE_KEY = 'live'; // los últimos datos en vivo (fixture, resultados, tablas): ~40 KB en localStorage

const WAKE_MIN_MS = 15_000; // al volver a la pestaña no se vuelve a pedir si el último pedido fue hace menos que esto

// Un mismo JSON se pide una sola vez por página aunque lo usen varios componentes (players.json, por ejemplo).
const jsonCache = new Map();
export const loadJson = (url) => {
  const embedded = getInitial().json?.[url];
  if (!jsonCache.has(url)) jsonCache.set(url, embedded !== undefined ? Promise.resolve(embedded) : getJson(url).catch(() => null));
  return jsonCache.get(url);
};

/** Un JSON estático (lo que genera el deploy o data/club.json). */
export function useJson(url) {
  const [data, setData] = useState(() => getInitial().json?.[url]);
  useEffect(() => {
    let on = true;
    loadJson(url).then((d) => on && setData(d));
    return () => {
      on = false;
    };
  }, [url]);
  return data;
}

/**
 * Datos en vivo de ESPN (o el snapshot si no responde), refrescados cada 5 min y cada 1 min si Vélez u otro partido
 * de la liga se está jugando (la tabla en vivo).
 * Devuelve { status: 'loading' | 'ok' | 'error', data, live }.
 */
export function useLiveData() {
  // Con prerender: el snapshot del deploy (como si ESPN no hubiera respondido) hasta que llegan los datos en vivo.
  const [state, setState] = useState(() => (getInitial().live ? { status: 'ok', data: getInitial().live, live: false } : { status: 'loading' }));
  useEffect(() => {
    let on = true;
    let timer;
    let running = false;
    let last = getInitial().live ?? null; // lo último bueno en pantalla
    // Lo último que este navegador recibió en vivo, si es más nuevo que lo que trae la página: se abre al instante
    // con eso (sin conexión en la cancha, o en la app instalada con el HTML guardado hace días) y después se refresca.
    // Va acá y no en el estado inicial: el HTML del deploy no sabe qué hay guardado (hidratación).
    const saved = load(LIVE_KEY);
    if (saved?.updatedAt && saved.fixture && saved.results && saved.standings && !(Date.parse(saved.updatedAt) <= Date.parse(last?.updatedAt))) {
      last = saved;
      setState({ status: 'ok', data: saved, live: false });
    }
    let fullAt = 0; // cuándo llegó el último refresco completo en vivo
    let tickedAt = 0;
    // Con la página oculta no se pide nada (datos y batería en la cancha): al volver se refresca enseguida.
    const schedule = (ms) => {
      clearTimeout(timer);
      if (document.visibilityState === 'visible') timer = setTimeout(tick, ms);
    };
    const tick = async () => {
      if (running) return;
      running = true;
      tickedAt = Date.now();
      try {
        // Mientras se juega, entre un refresco completo y el siguiente (5 min) alcanza con el scoreboard.
        let r = last && fullAt && isLive(last) && Date.now() - fullAt < REFRESH_MS ? await loadLiveFast(last) : null;
        if (!r) {
          r = await loadLive(last);
          if (r.live) fullAt = Date.now();
        }
        if (!on) return;
        r = keepNewest(last, r);
        last = r.data;
        if (r.live) save(LIVE_KEY, r.data);
        setState({ status: 'ok', ...r });
        schedule(isLive(r.data) ? REFRESH_LIVE_MS : REFRESH_MS);
      } catch (err) {
        console.error(err);
        if (!on) return;
        setState((s) => (s.status === 'ok' ? s : { status: 'error' })); // si ya había datos, se quedan
        schedule(REFRESH_MS);
      } finally {
        running = false;
      }
    };
    // Al volver a la pestaña o a la app (el celular congela los timers con la pantalla apagada) y al recuperar la
    // conexión: refrescar ya, salvo que se haya pedido hace instantes.
    const wake = () => {
      if (document.visibilityState !== 'visible') {
        clearTimeout(timer);
        return;
      }
      const wait = WAKE_MIN_MS - (Date.now() - tickedAt);
      if (wait > 0) schedule(wait);
      else {
        clearTimeout(timer);
        tick();
      }
    };
    document.addEventListener('visibilitychange', wake);
    addEventListener('online', wake);
    tick();
    return () => {
      on = false;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', wake);
      removeEventListener('online', wake);
    };
  }, []);
  return state;
}

/**
 * Resultado de `fn` (una promesa) para `key`, guardado `ttl` ms: el pronóstico, el minuto a minuto, los goleadores…
 * Se vuelve a pedir si cambia `key` o si venció y cambió `refresh` (por ejemplo, la hora de los datos en vivo).
 * Con `key` null no pide nada. Si falla o tarda más de 8 s, devuelve null. `initial` = valor mientras tanto.
 * Con `keep`, si un pedido falla queda el último valor bueno (lo que se refresca seguido: minuto a minuto, la fecha).
 */
export function useCached(key, fn, { ttl = Infinity, refresh, initial, keep = false } = {}) {
  const [value, setValue] = useState(initial);
  const cache = useRef(null);
  useEffect(() => {
    if (key == null) {
      setValue(null);
      return undefined;
    }
    const c = cache.current;
    if (!c || c.key !== key || Date.now() - c.at > ttl) {
      cache.current = { key, at: Date.now(), promise: withTimeout(fn()).catch(() => null) };
    }
    let on = true;
    cache.current.promise.then((v) => on && setValue((prev) => (keep && v == null && prev != null ? prev : v)));
    return () => {
      on = false;
    };
    // `fn` cambia en cada render y a propósito no está en las dependencias: lo que define si hay que volver a pedir
    // es `key` (y `refresh` para el vencimiento).
  }, [key, refresh]);
  return value;
}

/**
 * La hora actual (ms), actualizada cada `ms` si se pasa (cuenta regresiva). Todo lo que dependa de la hora al dibujar
 * («hace 2 días», un día como hoy) tiene que usar esto y no `new Date()`: en la página prerenderizada, el primer
 * render usa la hora del deploy (igual que el HTML) y enseguida pasa a la hora real.
 */
export function useNow(ms) {
  const [now, setNow] = useState(() => getInitial().renderedAt ?? Date.now());
  useEffect(() => {
    setNow(Date.now());
    if (!ms) return undefined;
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

// El plantel en vivo de ESPN; si no responde en 6 s, el que guardó el deploy.
const loadRoster = () => withTimeout(fetchRoster(), 6000).catch(async () => (await getJson(`${DATA}snapshot.json`).catch(() => ({}))).roster ?? null);

/** El plantel (Plantel, Juegos, Jugador). Prerenderizada, arranca con el del deploy y lo actualiza con el de ESPN. */
export function useRoster() {
  return useCached('roster', loadRoster, { initial: getInitial().extra?.roster });
}

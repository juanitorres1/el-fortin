// Hooks de datos. Convención en todo el sitio: `undefined` = cargando, `null` = falló o no hay, otro valor = listo.
// Si la página viene renderizada del deploy, arrancan con los mismos datos que el HTML (src/initial.js): así React
// hidrata sin redibujar y después actualiza en vivo.
import { useEffect, useRef, useState } from 'react';
import { REFRESH_LIVE_MS, REFRESH_MS, getJson, loadLive, withTimeout } from '../lib/core.js';
import { getInitial } from '../initial.js';

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
 * Datos en vivo de ESPN (o el snapshot si no responde), refrescados cada 5 min y cada 1 min si Vélez está jugando.
 * Devuelve { status: 'loading' | 'ok' | 'error', data, live }.
 */
export function useLiveData() {
  // Con prerender: el snapshot del deploy (como si ESPN no hubiera respondido) hasta que llegan los datos en vivo.
  const [state, setState] = useState(() => (getInitial().live ? { status: 'ok', data: getInitial().live, live: false } : { status: 'loading' }));
  useEffect(() => {
    let on = true;
    let timer;
    const tick = async () => {
      try {
        const r = await loadLive();
        if (!on) return;
        setState({ status: 'ok', ...r });
        timer = setTimeout(tick, r.data.fixture.some((m) => m.status === 'in') ? REFRESH_LIVE_MS : REFRESH_MS);
      } catch (err) {
        console.error(err);
        if (!on) return;
        setState((s) => (s.status === 'ok' ? s : { status: 'error' })); // si ya había datos, se quedan
        timer = setTimeout(tick, REFRESH_MS);
      }
    };
    tick();
    return () => {
      on = false;
      clearTimeout(timer);
    };
  }, []);
  return state;
}

/**
 * Resultado de `fn` (una promesa) para `key`, guardado `ttl` ms: el pronóstico, el minuto a minuto, los goleadores…
 * Se vuelve a pedir si cambia `key` o si venció y cambió `refresh` (por ejemplo, la hora de los datos en vivo).
 * Con `key` null no pide nada. Si falla o tarda más de 8 s, devuelve null. `initial` = valor mientras tanto.
 */
export function useCached(key, fn, { ttl = Infinity, refresh, initial } = {}) {
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
    cache.current.promise.then((v) => on && setValue(v));
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

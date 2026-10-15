// Hooks de datos. Convención en todo el sitio: `undefined` = cargando, `null` = falló o no hay, otro valor = listo.
import { useEffect, useRef, useState } from 'react';
import { REFRESH_LIVE_MS, REFRESH_MS, getJson, loadLive, withTimeout } from '../lib/core.js';

// Un mismo JSON se pide una sola vez por página aunque lo usen varios componentes (players.json, por ejemplo).
const jsonCache = new Map();
export const loadJson = (url) => {
  if (!jsonCache.has(url)) jsonCache.set(url, getJson(url).catch(() => null));
  return jsonCache.get(url);
};

/** Un JSON estático (lo que genera el deploy o data/club.json). */
export function useJson(url) {
  const [data, setData] = useState(undefined);
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
  const [state, setState] = useState({ status: 'loading' });
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
 * Con `key` null no pide nada. Si falla o tarda más de 8 s, devuelve null.
 */
export function useCached(key, fn, { ttl = Infinity, refresh } = {}) {
  const [value, setValue] = useState(undefined);
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

/** La hora actual, actualizada cada `ms` (para la cuenta regresiva). */
export function useNow(ms) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

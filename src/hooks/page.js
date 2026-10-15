// Hooks que tocan la página: título en vivo con alerta de gol, salto a #sección y la sección que se está leyendo.
import { useEffect, useRef, useState } from 'react';
import { VELEZ_ID } from '../lib/espn.js';
import { goalBy, scoreTitle } from '../lib/core.js';

const GOAL_ALERT_MS = 30_000;

/**
 * Mientras Vélez juega, el título de la pestaña muestra el marcador; si hay gol, parpadea con «¡GOL DE VÉLEZ!»
 * durante 30 s (o hasta que se vuelve a la pestaña). Sirve a quien tiene el sitio abierto en otra pestaña.
 */
export function useLiveTitle(fixture) {
  const baseTitle = useRef(null);
  const lastScore = useRef(null);
  const blink = useRef(null);
  useEffect(() => {
    if (!fixture) return;
    baseTitle.current ??= document.title;
    clearInterval(blink.current);
    const m = fixture.find((x) => x.status === 'in');
    if (!m) {
      lastScore.current = null;
      document.title = baseTitle.current;
      return;
    }
    const base = `● ${scoreTitle(m)} · El Fortín`;
    const who = goalBy(lastScore.current, m);
    lastScore.current = { id: m.id, home: m.home.score ?? 0, away: m.away.score ?? 0 };
    document.title = base;
    if (!who) return;
    const rival = m.home.id === VELEZ_ID ? m.away.name : m.home.name;
    const alert = who === 'velez' ? `⚽ ¡GOL DE VÉLEZ! ${m.home.score}-${m.away.score}` : `Gol de ${rival} · ${m.home.score}-${m.away.score}`;
    const until = Date.now() + GOAL_ALERT_MS;
    let on = true;
    document.title = alert;
    blink.current = setInterval(() => {
      if (Date.now() > until || (document.visibilityState === 'visible' && document.hasFocus())) {
        clearInterval(blink.current);
        document.title = base;
        return;
      }
      on = !on;
      document.title = on ? alert : base;
    }, 1000);
  }, [fixture]);
  useEffect(() => () => clearInterval(blink.current), []);
}

/**
 * Si se entró con #ancla, salta cuando la página ya está armada (`ready`): el salto del navegador ocurre con la página
 * vacía, y además hay que esperar las tipografías (Montserrat es más ancha que la de respaldo y empuja el contenido).
 */
export function useScrollToHash(ready) {
  const done = useRef(false);
  useEffect(() => {
    if (!ready || done.current) return;
    done.current = true;
    const id = decodeURIComponent(location.hash.slice(1));
    if (!id) return;
    document.fonts.ready.then(() => document.getElementById(id)?.scrollIntoView({ behavior: 'instant', block: 'start' }));
  }, [ready]);
}

/**
 * La sección que se está leyendo: la última cuya parte de arriba ya pasó debajo de `navRef` (un menú fijo).
 * Devuelve su id. `ids` en el orden de la página.
 */
export function useCurrentSection(ids, navRef) {
  const [current, setCurrent] = useState(ids[0]);
  useEffect(() => {
    let queued = false;
    const update = () => {
      queued = false;
      const line = (navRef.current?.getBoundingClientRect().bottom ?? 0) + 24;
      const i = ids.findLastIndex((id) => (document.getElementById(id)?.getBoundingClientRect().top ?? Infinity) <= line);
      setCurrent(ids[Math.max(0, i)]);
    };
    const onScroll = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(update);
    };
    addEventListener('scroll', onScroll, { passive: true });
    update();
    return () => removeEventListener('scroll', onScroll);
  }, [ids, navRef]);
  return current;
}

// Hooks que tocan la página: título en vivo con alerta de gol, aviso de gol en pantalla, cambios de horario, salto a
// #sección y la sección que se está leyendo.
import { useEffect, useRef, useState } from 'react';
import { scoreTitle } from '../lib/core.js';
import { goalAlert, scoreOf, trackKickoffs } from '../lib/alerts.js';
import { load, save } from '../lib/storage.js';

const GOAL_ALERT_MS = 30_000;
const GOAL_VIBRATION = [180, 90, 180]; // dos toques cortos

/**
 * El partido de Vélez en juego y, si el marcador subió desde el refresco anterior, el gol (ver `goalAlert`).
 * `last` = ref con el marcador anterior: lo comparten el título de la pestaña y el aviso en pantalla, cada uno con
 * el suyo. La primera vez que hay datos no hay marcador anterior: no es un gol.
 */
function trackGoal(last, fixture) {
  const m = fixture.find((x) => x.status === 'in');
  if (!m) {
    last.current = null;
    return { m: null, goal: null };
  }
  const goal = goalAlert(last.current, m);
  last.current = scoreOf(m);
  return { m, goal };
}

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
    const { m, goal } = trackGoal(lastScore, fixture);
    if (!m) {
      document.title = baseTitle.current;
      return;
    }
    const base = `● ${scoreTitle(m)} · El Fortín`;
    document.title = base;
    if (!goal) return;
    const alert = goal.who === 'velez' ? `⚽ ¡GOL DE VÉLEZ! ${goal.score}` : `Gol de ${goal.rival} · ${goal.score}`;
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
 * El gol para avisar en pantalla (en la app instalada el título de la pestaña no se ve): { who: 'velez' | 'rival',
 * score: '2-1', rival } durante 30 s después de un gol, y null el resto del tiempo. Si es de Vélez y la página está a
 * la vista, el teléfono vibra (donde se puede; sin sonido). Usa la misma detección que `useLiveTitle`.
 */
export function useGoalAlert(fixture) {
  const [alert, setAlert] = useState(null);
  const lastScore = useRef(null);
  const timer = useRef(null);
  useEffect(() => {
    if (!fixture) return;
    const { goal } = trackGoal(lastScore, fixture);
    if (!goal) return; // el aviso anterior sigue hasta que venza, aunque el partido haya terminado
    clearTimeout(timer.current);
    setAlert(goal);
    timer.current = setTimeout(() => setAlert(null), GOAL_ALERT_MS);
    // Chrome solo deja vibrar si ya se tocó la página (si no, lo bloquea y ensucia la consola).
    if (goal.who === 'velez' && document.visibilityState === 'visible' && navigator.userActivation?.hasBeenActive !== false) {
      try {
        navigator.vibrate?.(GOAL_VIBRATION);
      } catch { /* algunos navegadores lo bloquean si todavía no se tocó la página */ }
    }
  }, [fixture]);
  useEffect(() => () => clearTimeout(timer.current), []);
  return alert;
}

/**
 * Los horarios que este navegador vio en visitas anteriores, puestos al día con el fixture: lo que espera
 * `kickoffChange` para avisar «cambió el horario». undefined hasta leerlos (en un efecto: el HTML del deploy no sabe
 * qué hay guardado). Solo se compara y se guarda con datos en vivo (`live`): la copia del deploy puede traer un
 * horario viejo, y al llegar el de ESPN parecería una reprogramación.
 */
export function useKickoffs(fixture, live) {
  const [kickoffs, setKickoffs] = useState(undefined);
  useEffect(() => {
    if (!fixture) return;
    const stored = load('kickoffs', {});
    if (!live) {
      setKickoffs(stored);
      return;
    }
    const next = trackKickoffs(stored, fixture, Date.now());
    if (JSON.stringify(next) !== JSON.stringify(stored)) save('kickoffs', next);
    setKickoffs(next);
  }, [fixture, live]);
  return kickoffs;
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

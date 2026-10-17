// Lo que comparten todas las páginas sin tocar el DOM: constantes, formato, carga de datos y el marcador en vivo.
// Lo de React (componentes, hooks) está en src/components y src/hooks.
import { VELEZ_ID, fetchLive } from './espn.js';

export const TZ = 'America/Argentina/Buenos_Aires';
export const LIVE_TIMEOUT_MS = 8000;
export const REFRESH_MS = 5 * 60 * 1000;
export const REFRESH_LIVE_MS = 60 * 1000;
export const RESULT_LABEL = { G: 'Ganó', E: 'Empató', P: 'Perdió' };
/** Archivos que genera el deploy (scripts/update-data.mjs), servidos junto al sitio. */
export const DATA = 'data/generated/';

// Los escudos de ESPN vienen en 500×500 (~34 KB) y se muestran a 16–64 px: se piden achicados (×2 para pantallas
// de alta densidad) a su servicio de redimensionado, ~2 KB cada uno.
export const sized = (url, size) => {
  const m = url?.match(/^https:\/\/a\.espncdn\.com(\/i\/teamlogos\/[\w/.-]+\.png)$/);
  return m ? `https://a.espncdn.com/combiner/i?img=${m[1]}&w=${size * 2}&h=${size * 2}` : url;
};

export const fmt = {
  day: new Intl.DateTimeFormat('es-AR', { timeZone: TZ, day: '2-digit' }),
  mon: new Intl.DateTimeFormat('es-AR', { timeZone: TZ, month: 'short' }),
  long: new Intl.DateTimeFormat('es-AR', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' }),
  time: new Intl.DateTimeFormat('es-AR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }),
  year: new Intl.DateTimeFormat('es-AR', { timeZone: TZ, year: 'numeric' }),
  stamp: new Intl.DateTimeFormat('es-AR', { timeZone: TZ, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }),
};
export const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export async function getJson(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

export function withTimeout(promise, ms = LIVE_TIMEOUT_MS) {
  return Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
}

/** Datos en vivo de ESPN; si no responde, la copia que guarda el deploy cada hora. */
export async function loadLive() {
  try {
    return { data: await withTimeout(fetchLive()), live: true };
  } catch (err) {
    console.warn('ESPN no respondió, uso la copia guardada:', err);
    return { data: await getJson(`${DATA}snapshot.json`), live: false };
  }
}

export function mergeResults(history, recent) {
  const byId = new Map(history.map((m) => [m.id, m]));
  for (const m of recent) byId.set(m.id, m);
  return [...byId.values()].filter((m) => m.completed && m.comp !== 'Amistoso').sort((a, b) => new Date(a.date) - new Date(b.date));
}

/** Texto para el pie de una sección con datos: en vivo o desde la copia guardada. */
export function sourceNote(live, updatedAt) {
  return live ? `En vivo desde ESPN · ${fmt.stamp.format(new Date())}` : `Datos guardados del ${fmt.stamp.format(new Date(updatedAt))}`;
}

/** Texto del título con el marcador: «2-1 Vélez vs Boca (67')». */
export function scoreTitle(m) {
  return `${m.home.score ?? 0}-${m.away.score ?? 0} ${m.home.name} vs ${m.away.name}${m.clock ? ` (${m.clock})` : ''}`;
}

/** ¿Quién hizo un gol desde el marcador anterior? 'velez', 'rival' o null. */
export function goalBy(prev, m) {
  if (!prev || prev.id !== m.id) return null;
  const velezHome = m.home.id === VELEZ_ID;
  const [v, r] = velezHome ? [m.home.score ?? 0, m.away.score ?? 0] : [m.away.score ?? 0, m.home.score ?? 0];
  const [pv, pr] = velezHome ? [prev.home, prev.away] : [prev.away, prev.home];
  if (v > pv) return 'velez';
  if (r > pr) return 'rival';
  return null;
}

/**
 * Tabla «en vivo»: las filas de una zona con los partidos que se están jugando sumados como si terminaran así.
 * `rows` = filas ({ id, pts, pj, gf, gc, dg, rank }); `events` = partidos del día (solo cuentan los que están en juego).
 * Devuelve las filas reordenadas (puntos, diferencia, goles) con `rank`, `before` (puesto antes) y `live` (juega ahora).
 */
export function liveStandings(rows, events) {
  const byId = new Map(rows.map((r) => [r.id, { ...r, before: r.rank, live: false }]));
  for (const m of events) {
    if (m.status !== 'in') continue;
    const h = m.home.score ?? 0;
    const a = m.away.score ?? 0;
    for (const [id, gf, gc] of [[m.home.id, h, a], [m.away.id, a, h]]) {
      const r = byId.get(id);
      if (!r) continue;
      r.live = true;
      r.pj += 1;
      r.gf = (r.gf ?? 0) + gf;
      r.gc = (r.gc ?? 0) + gc;
      r.dg = (r.dg ?? 0) + gf - gc;
      r.pts += gf > gc ? 3 : gf === gc ? 1 : 0;
    }
  }
  return [...byId.values()]
    .sort((x, y) => y.pts - x.pts || (y.dg ?? 0) - (x.dg ?? 0) || (y.gf ?? 0) - (x.gf ?? 0) || x.before - y.before)
    .map((r, i) => ({ ...r, rank: i + 1 }));
}

/** «20261019»: el día en la Argentina, como lo pide el scoreboard de ESPN. */
export const espnDay = (date) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(date).replaceAll('-', '');

// Lo que comparten todas las páginas: formato, escape de HTML, escudos, carga de datos y la fila de partido.
import { fetchLive, velezView } from './espn.js';

export const TZ = 'America/Argentina/Buenos_Aires';
export const LIVE_TIMEOUT_MS = 8000;
export const REFRESH_MS = 5 * 60 * 1000;
export const REFRESH_LIVE_MS = 60 * 1000;
export const RESULT_LABEL = { G: 'Ganó', E: 'Empató', P: 'Perdió' };

export const $ = (sel) => document.querySelector(sel);
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Los escudos de ESPN vienen en 500×500 (~34 KB) y se muestran a 16–64 px: se piden achicados (×2 para pantallas
// de alta densidad) a su servicio de redimensionado, ~2 KB cada uno.
export const sized = (url, size) => {
  const m = url?.match(/^https:\/\/a\.espncdn\.com(\/i\/teamlogos\/[\w/.-]+\.png)$/);
  return m ? `https://a.espncdn.com/combiner/i?img=${m[1]}&w=${size * 2}&h=${size * 2}` : url;
};
// onerror: ESPN no tiene escudo para todos los equipos chicos; se oculta la imagen rota.
export const logo = (url, size = 24) =>
  url ? `<img class="crest" src="${esc(sized(url, size))}" alt="" width="${size}" height="${size}" loading="lazy" decoding="async" onerror="this.style.visibility='hidden'">` : '';

export const fmt = {
  day: new Intl.DateTimeFormat('es-AR', { timeZone: TZ, day: '2-digit' }),
  mon: new Intl.DateTimeFormat('es-AR', { timeZone: TZ, month: 'short' }),
  long: new Intl.DateTimeFormat('es-AR', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' }),
  time: new Intl.DateTimeFormat('es-AR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }),
  year: new Intl.DateTimeFormat('es-AR', { timeZone: TZ, year: 'numeric' }),
  stamp: new Intl.DateTimeFormat('es-AR', { timeZone: TZ, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }),
};
export const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export async function getJson(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

export function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
}

/** Datos en vivo de ESPN; si no responde, la copia que guarda el deploy cada hora. */
export async function loadLive() {
  try {
    return { data: await withTimeout(fetchLive(), LIVE_TIMEOUT_MS), live: true };
  } catch (err) {
    console.warn('ESPN no respondió, uso la copia guardada:', err);
    return { data: await getJson('data/generated/snapshot.json'), live: false };
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

/** Fila de partido (fixture, resultados, copas, historial). */
export function matchItem(m, { showYear = false } = {}) {
  const d = new Date(m.date);
  const dateBox = m.date
    ? `<b>${fmt.day.format(d)}</b><span>${fmt.mon.format(d).replace('.', '')}${showYear ? ` ${fmt.year.format(d).slice(2)}` : ''}</span>`
    : `<b class="is-year">${m.year}</b>`;
  const { velezHome, velez, rival, result } = velezView(m);
  const right = m.completed
    ? `<span class="score">${velez.score}-${rival.score}</span>${result ? `<span class="res res-${result}" title="${RESULT_LABEL[result]}"><span class="sr-only">${RESULT_LABEL[result]}</span><span aria-hidden="true">${result}</span></span>` : ''}`
    : m.status === 'in'
      ? `<span class="live-pill">${esc(m.clock ?? 'En vivo')}</span><span class="score">${velez.score ?? 0}-${rival.score ?? 0}</span>`
      : `<span class="match-time">${m.timeValid ? fmt.time.format(d) : 'A conf.'}</span>`;
  return `<li class="match">
    <div class="match-date">${dateBox}</div>
    <div class="match-main">
      <div class="match-rival">${logo(rival.logo, 24)}<span>${esc(rival.name)}</span></div>
      <div class="match-sub"><span class="tag">${esc(m.season ?? m.comp)}</span>${velezHome ? 'Local' : 'Visitante'}${m.venue ? ` · ${esc(m.venue)}` : ''}</div>
    </div>
    <div class="match-score">${right}</div>
  </li>`;
}

/** Placeholders con la forma del contenido mientras cargan los datos (`loading.md`: mostrar algo enseguida). */
export const skeletonRows = (n, cls = 'sk-row') => Array.from({ length: n }, () => `<li class="skeleton ${cls}" aria-hidden="true"></li>`).join('');

/** Si se entró con #ancla, se repite el salto cuando la página ya está armada (el inicial ocurre con la página vacía). */
export function scrollToHash() {
  const id = location.hash.slice(1);
  const target = id ? document.getElementById(id) : null;
  target?.scrollIntoView({ behavior: 'instant', block: 'start' });
}

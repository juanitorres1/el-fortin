// Datos con los que se generó el HTML de la página en el deploy (scripts/prerender.mjs). El navegador los lee de
// <script id="initial-data"> para que el primer render de React sea idéntico al HTML (hidratación) y después
// actualiza en vivo como siempre. Sin prerender (en `npm run dev`) no hay datos iniciales y todo carga como antes.
//
// Forma: { renderedAt, live: snapshot sin plantel | undefined, json: { [url]: datos }, extra: { roster } }

let initial = null;

/** Lo usa el prerender antes de renderizar cada página en Node. */
export function setInitial(data) {
  initial = data;
}

export function getInitial() {
  if (initial) return initial;
  const el = typeof document !== 'undefined' ? document.getElementById('initial-data') : null;
  initial = el ? JSON.parse(el.textContent) : {};
  return initial;
}

/** ¿Esta página viene renderizada del deploy? (entonces React hidrata en vez de dibujar de cero). */
export const isPrerendered = () => typeof document !== 'undefined' && Boolean(document.getElementById('initial-data'));

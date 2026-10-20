// Arranque común de cada página: estilos y React montado en #root. Si la página viene renderizada del deploy
// (scripts/prerender.mjs), React hidrata ese HTML en vez de dibujar de cero. En el build para Node no hace nada.
// En producción registra el service worker (public/sw.js): app instalable y última versión guardada sin conexión.
// En el sitio publicado suma el contador de visitas (GoatCounter).
import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { isPrerendered } from './initial.js';
import './styles.css';

export function mount(Page) {
  if (import.meta.env.SSR) return;
  const root = document.getElementById('root');
  const app = <StrictMode><Page /></StrictMode>;
  if (isPrerendered()) hydrateRoot(root, app);
  else createRoot(root).render(app);
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch((err) => console.warn('Sin service worker:', err)));
  }
  countVisit();
}

/**
 * Contador de visitas (GoatCounter: sin cookies ni datos personales, solo cifras agregadas). Solo en el sitio
 * publicado: las pruebas en localhost o con `npm run preview` no cuentan. Panel: juanignaciotorres.goatcounter.com
 */
function countVisit() {
  if (!import.meta.env.PROD || !location.hostname.endsWith('github.io')) return;
  const s = document.createElement('script');
  s.async = true;
  s.src = 'https://gc.zgo.at/count.js';
  s.dataset.goatcounter = 'https://juanignaciotorres.goatcounter.com/count';
  document.head.append(s);
}

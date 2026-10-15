// Arranque común de cada página: estilos y React montado en #root. Si la página viene renderizada del deploy
// (scripts/prerender.mjs), React hidrata ese HTML en vez de dibujar de cero. En el build para Node no hace nada.
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
}

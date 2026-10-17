// Entrada del build para Node (vite build --ssr): dibuja cada página a HTML con los datos que se le pasen.
// La usa scripts/prerender.mjs después de `vite build`.
import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import { setInitial } from './initial.js';
import Inicio from './pages/inicio.jsx';
import Partidos from './pages/partidos.jsx';
import Plantel from './pages/plantel.jsx';
import Historial from './pages/historial.jsx';
import Club from './pages/club.jsx';
import Juegos from './pages/juegos.jsx';
import Jugador from './pages/jugador.jsx';
import Vivo from './pages/vivo.jsx';

const PAGES = { inicio: Inicio, partidos: Partidos, plantel: Plantel, historial: Historial, club: Club, juegos: Juegos, jugador: Jugador, vivo: Vivo };

/** HTML del contenido de #root para la página `key`, con `initial` = { renderedAt, live, json, extra }. */
export function renderPage(key, initial) {
  const Page = PAGES[key];
  if (!Page) throw new Error(`No hay página «${key}» para prerenderizar`);
  setInitial(initial);
  return renderToString(<StrictMode><Page /></StrictMode>);
}

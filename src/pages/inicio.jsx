// Inicio: «Juega Vélez», la previa, noticias y una frase de Don Pepe.
import { mount } from '../main.jsx';
import { DATA, mergeResults } from '../lib/core.js';
import { useJson, useLiveData } from '../hooks/data.js';
import { useLiveTitle } from '../hooks/page.js';
import { Layout } from '../components/Layout.jsx';
import { Juega } from '../sections/Juega.jsx';
import { Previa } from '../sections/Previa.jsx';
import { Noticias } from '../sections/Noticias.jsx';

// Antes todo estaba en una sola página: los links viejos con #ancla llevan a la página nueva.
const LEGACY = {
  partidos: 'partidos.html', tablas: 'partidos.html#tablas', plantel: 'plantel.html', historial: 'historial.html',
  historia: 'club.html#historia', estadio: 'club.html#estadio', amalfitani: 'club.html#don-pepe', momentos: 'club.html#momentos',
  palmares: 'club.html#palmares', records: 'club.html#records',
};
if (!import.meta.env.SSR) {
  const legacy = LEGACY[location.hash.slice(1)];
  if (legacy) location.replace(legacy);
}

function Inicio() {
  const state = useLiveData();
  const facts = useJson(`${DATA}facts.json`);
  const news = useJson(`${DATA}news.json`);
  const summary = useJson(`${DATA}resumen.json`);
  const results = state.data ? mergeResults([], state.data.results) : [];
  useLiveTitle(state.data?.fixture);
  return (
    <Layout page="inicio" mainClass="">
      <h1 className="sr-only">El Fortín: noticias y partidos de Vélez Sarsfield</h1>
      <section className="match-band" aria-label="Próximo partido de Vélez">
        <div className="wrap juega"><Juega state={state} results={results} /></div>
      </section>
      <Previa facts={facts} data={state.data} />
      <Noticias news={news} summary={summary} />
      <a className="band band-blue home-quote" href="club.html#don-pepe">
        <span className="wrap">
          <blockquote>«Yo no he venido al funeral de Vélez Sarsfield.»</blockquote>
          <span className="home-quote-by">José Amalfitani, 1940 · Conocé la historia del club →</span>
        </span>
      </a>
    </Layout>
  );
}

export default Inicio;
mount(Inicio);

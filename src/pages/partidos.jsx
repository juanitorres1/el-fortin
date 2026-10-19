// Partidos: lo que viene (con el calendario para suscribirse), resultados, Vélez en cifras, tablas, goleadores, camino a los playoffs
// y copas. Todo de ESPN en vivo; los promedios suman las temporadas que guarda el deploy.
import { useEffect, useRef } from 'react';
import { mount } from '../main.jsx';
import { velezView } from '../lib/espn.js';
import { DATA, mergeResults, sourceNote } from '../lib/core.js';
import { useJson, useLiveData, useNow } from '../hooks/data.js';
import { useLiveTitle, useScrollToHash } from '../hooks/page.js';
import { Layout, PageBand } from '../components/Layout.jsx';
import { MatchList } from '../components/Match.jsx';
import { ResultBadge } from '../components/ui.jsx';
import { Tablas, buildTables } from '../sections/Tablas.jsx';
import { Goleadores } from '../sections/Goleadores.jsx';
import { Playoffs } from '../sections/Playoffs.jsx';
import { Cifras } from '../sections/Cifras.jsx';

const ICS = 'juanitorres1.github.io/el-fortin/data/generated/velez.ics';

function Agendar() {
  const ref = useRef(null);
  // Desde el Inicio se llega con #agendar: se abre (en un efecto: el HTML prerenderizado no sabe del #).
  useEffect(() => {
    if (location.hash === '#agendar') ref.current.open = true;
  }, []);
  return (
    <details className="cal" id="agendar" ref={ref}>
      <summary>Agendar los partidos en tu calendario</summary>
      <p className="muted small">Te suscribís una vez y, si cambia un horario, se actualiza solo. Incluye los resultados del año.</p>
      <div className="cal-links">
        <a className="btn btn-outline" href={`https://calendar.google.com/calendar/render?cid=${encodeURIComponent(`webcal://${ICS}`)}`} target="_blank" rel="noopener">Google Calendar</a>
        <a className="btn btn-outline" href={`webcal://${ICS}`}>iPhone, Mac u Outlook</a>
        <a className="btn btn-outline" href={`${DATA}velez.ics`} download="velez.ics">Bajar el archivo .ics</a>
      </div>
      <p className="muted small">Google Calendar puede tardar varias horas en reflejar un cambio de horario.</p>
    </details>
  );
}

function Copas({ fixture, results }) {
  const season = new Date(useNow()).getFullYear();
  const byComp = new Map();
  for (const m of [...results, ...fixture.filter((x) => !x.completed)]) {
    if (m.comp === 'Liga Profesional' || m.comp === 'Amistoso' || new Date(m.date).getFullYear() !== season) continue;
    byComp.set(m.comp, [...(byComp.get(m.comp) ?? []), m]);
  }
  if (!byComp.size) return null;
  return (
    <section className="block" aria-labelledby="t-copas">
      <h2 className="h2" id="t-copas">Copas</h2>
      <div className="cups">
        {[...byComp].map(([comp, ms]) => <div key={comp}><h3 className="h3">{comp} {season}</h3><MatchList matches={ms} /></div>)}
      </div>
    </section>
  );
}

function Partidos() {
  const state = useLiveData();
  const promedios = useJson(`${DATA}promedios.json`);
  const players = useJson(`${DATA}players.json`);
  const games = useJson(`${DATA}games.json`);
  const data = state.data;
  const results = data ? mergeResults([], data.results) : undefined;
  const source = data ? sourceNote(state.live, data.updatedAt) : '';
  useLiveTitle(data?.fixture);
  useScrollToHash(Boolean(data) && promedios !== undefined);
  const failed = state.status === 'error';

  return (
    <Layout page="partidos" band={<PageBand title="Partidos"><p className="muted small">{source}</p></PageBand>}>
      <div className="two-col">
        <section className="block" aria-labelledby="t-proximos">
          <h2 className="h2" id="t-proximos">Lo que viene</h2>
          <MatchList
            matches={failed ? [] : data?.fixture.filter((m) => !m.completed).slice(0, 8)}
            empty={failed ? 'No pudimos cargar los partidos. Probá en un rato.' : 'Todavía no hay partidos programados.'}
          />
          <Agendar />
        </section>
        <section className="block" aria-labelledby="t-resultados">
          <div className="section-head">
            <h2 className="h2" id="t-resultados">Resultados</h2>
            <div className="form-wrap">
              <span className="muted small">Últimos 5</span>
              <ol className="form-strip" aria-label="Últimos cinco resultados">
                {(results ?? []).slice(-5).map((m) => <ResultBadge key={m.id} as="li" result={velezView(m).result} />)}
              </ol>
            </div>
          </div>
          <MatchList matches={failed ? [] : results?.slice(-8).reverse()} showYear empty="Sin resultados." />
        </section>
      </div>
      <Cifras games={games?.games} />
      <Tablas tables={data && promedios !== undefined ? buildTables(data.standings, promedios) : failed ? [] : undefined} source={source} />
      <Goleadores standings={data?.standings} players={players} refresh={data?.updatedAt} />
      <Playoffs standings={data?.standings} refresh={data?.updatedAt} />
      {data && <Copas fixture={data.fixture} results={results} />}
    </Layout>
  );
}

export default Partidos;
mount(Partidos);

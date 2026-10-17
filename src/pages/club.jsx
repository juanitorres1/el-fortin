// El club: historia, estadio y cómo llegar, Don Pepe, momentos, palmarés, ídolos y récords (data/club.json, a mano).
import { useRef } from 'react';
import { mount } from '../main.jsx';
import { useJson } from '../hooks/data.js';
import { useCurrentSection, useScrollToHash } from '../hooks/page.js';
import { Layout, PageBand } from '../components/Layout.jsx';
import { ExtLink, Skeletons } from '../components/ui.jsx';
import { Estadio3D } from '../sections/Estadio3D.jsx';

const SECTIONS = [
  ['historia', 'Historia'], ['estadio', 'Estadio'], ['tribunas', 'Tribunas'], ['como-llegar', 'Cómo llegar'], ['don-pepe', 'Don Pepe'],
  ['momentos', 'Momentos'], ['palmares', 'Palmarés'], ['idolos', 'Ídolos'], ['records', 'Récords'],
];
const SECTION_IDS = SECTIONS.map(([id]) => id);

/** Submenú fijo: marca la sección que se está leyendo y, en celular, la deja a la vista. */
function SubNav() {
  const nav = useRef(null);
  const current = useCurrentSection(SECTION_IDS, nav);
  return (
    <nav className="subnav" aria-label="Secciones del club" ref={nav}>
      {SECTIONS.map(([id, label]) => (
        <a
          key={id} href={`#${id}`} aria-current={id === current ? 'true' : undefined}
          ref={(a) => {
            if (a && id === current && nav.current) nav.current.scrollTo({ left: a.offsetLeft - nav.current.clientWidth / 2 + a.offsetWidth / 2, behavior: 'instant' });
          }}
        >
          {label}
        </a>
      ))}
    </nav>
  );
}

/** Sección con título; `tone` = 'gray' | 'blue' para bandas a todo el ancho. */
function Section({ id, title, tone, head, children }) {
  return (
    <section className={`block${tone ? ` bleed bleed-${tone}` : ''}`} id={id} aria-labelledby={`t-${id}`}>
      {head ?? <h2 className="h2" id={`t-${id}`}>{title}</h2>}
      {children}
    </section>
  );
}

function Stadium({ e }) {
  const c = e.comoLlegar;
  return (
    <Section id="estadio" title="El estadio" tone="gray">
      <p className="lead">{e.intro}</p>
      <dl className="stadium-stats">{e.datos.map((d) => <div key={d.etiqueta}><dt>{d.etiqueta}</dt><dd className="num">{d.valor}</dd></div>)}</dl>
      <ol className="stadium-hitos">{e.hitos.map((h) => <li key={h.fecha}><b>{h.fecha}</b><span>{h.texto}</span></li>)}</ol>
      {e.tribunas && (
        <div className="arrive" id="tribunas">
          <h3 className="h3">Las tribunas</h3>
          <Estadio3D tribunas={e.tribunas} epocas={e.epocas} />
        </div>
      )}
      <div className="arrive" id="como-llegar">
        <h3 className="h3">Cómo llegar</h3>
        <p className="arrive-address">{c.direccion}</p>
        <ul className="arrive-list">{c.opciones.map((o) => <li key={o.titulo}><strong>{o.titulo}</strong><p>{o.texto}</p></li>)}</ul>
        <p className="muted small">{c.consejos}</p>
        <div className="cal-links">
          <ExtLink className="btn btn-outline" href={c.mapa}>Cómo llegar en Google Maps</ExtLink>
          <ExtLink className="btn btn-outline" href={c.comoLlegoUrl}>BA Cómo Llego</ExtLink>
        </div>
      </div>
    </Section>
  );
}

function RankList({ rows, valueKey, unit }) {
  const max = rows[0][valueKey];
  return (
    <ol className="rank">
      {rows.map((r, i) => (
        <li key={r.nombre}>
          <span className="rank-n num">{i + 1}</span>
          <div className="rank-main"><strong>{r.nombre}</strong><small className="muted">{r.periodo}</small><i style={{ width: `${(r[valueKey] / max) * 100}%` }} /></div>
          <b className="num">{r[valueKey]}</b><small className="rank-unit muted">{unit}</small>
        </li>
      ))}
    </ol>
  );
}

function Records({ rec }) {
  if (!rec) return null;
  return (
    <Section id="records" title="Récords">
      <div className="records">
        <article className="card"><h3 className="h3">Máximos goleadores</h3><RankList rows={rec.goleadores} valueKey="goles" unit="goles" /></article>
        <article className="card"><h3 className="h3">Más partidos</h3><RankList rows={rec.presencias} valueKey="partidos" unit="PJ" /></article>
        <article className="card">
          <h3 className="h3">Más títulos ganados</h3>
          {rec.titulos.map((g) => <div key={g.titulos} className="titles-row"><b className="num">{g.titulos}</b><p>{g.jugadores.join(' · ')}</p></div>)}
          <p className="muted small">{rec.tecnicos}</p>
        </article>
        <article className="card">
          <h3 className="h3">Goleadores de torneo</h3>
          <ul className="scorers">{rec.goleadoresTorneo.map((g) => <li key={g.nombre + g.torneo}><strong>{g.nombre}</strong><span className="muted">{g.torneo}</span><b className="num">{g.goles}</b></li>)}</ul>
        </article>
      </div>
      <p className="muted small">{rec.fuente}</p>
    </Section>
  );
}

function Club() {
  const club = useJson('data/club.json');
  useScrollToHash(Boolean(club));
  const band = <PageBand title="El club"><p className="lead">Club Atlético Vélez Sarsfield · Liniers · desde 1910</p></PageBand>;
  if (!club) {
    return <Layout page="club" band={band}>{club === undefined ? <Skeletons n={3} className="sk-card" /> : <p className="empty">No pudimos cargar la historia del club.</p>}</Layout>;
  }
  const [first, ...rest] = club.frases;
  const cats = Object.entries(club.palmares);
  return (
    <Layout page="club" band={band}>
      <SubNav />
      <Section id="historia" title="Historia">
        <figure className="fortin"><figcaption className="h3">¿Por qué «Fortín»?</figcaption><p>{club.fortin}</p></figure>
        <ol className="timeline">
          {club.historia.map((h) => <li key={`${h.anio}-${h.titulo}`}><p className="t-year num">{h.anio}</p><div className="t-body"><h3 className="h3">{h.titulo}</h3><p>{h.texto}</p></div></li>)}
        </ol>
      </Section>
      <Stadium e={club.estadio} />
      <Section id="don-pepe" title="Don Pepe" tone="blue">
        <p className="muted">José Amalfitani (1894–1969), presidente en 1923–25 y de 1941 a 1969.</p>
        <div className="quotes">
          {first && <figure className="quote quote-main"><blockquote>{first.texto}</blockquote><figcaption>{first.contexto}</figcaption></figure>}
          {rest.map((f) => <figure key={f.texto} className="quote"><blockquote>{f.texto}</blockquote><figcaption>{f.contexto}</figcaption></figure>)}
        </div>
      </Section>
      <Section id="momentos" title="Momentos">
        <div className="cards-grid">
          {club.momentos.map((m) => (
            <article key={m.titulo} className="card moment">
              {m.marcador && <p className="moment-score num">{m.marcador}</p>}
              <h3 className="h3">{m.titulo}</h3><p className="muted small">{m.fecha} · {m.lugar}</p><p>{m.texto}</p>
            </article>
          ))}
        </div>
      </Section>
      <Section
        id="palmares" tone="gray"
        head={<div className="section-head"><h2 className="h2" id="t-palmares">Palmarés</h2><p className="muted">{cats.reduce((n, [, list]) => n + list.length, 0)} títulos oficiales</p></div>}
      >
        <div className="cards-grid">
          {cats.map(([cat, list]) => (
            <article key={cat} className="card trophy-col"><h3 className="h3">{cat} <b className="num">{list.length}</b></h3><ul>{list.map((t) => <li key={t}>{t}</li>)}</ul></article>
          ))}
        </div>
      </Section>
      <Section id="idolos" title="Ídolos">
        <div className="cards-grid">
          {club.idolos.map((i) => <article key={i.nombre} className="card idol"><h3 className="h3">{i.nombre}</h3><p className="idol-role">{i.rol}</p><p>{i.texto}</p></article>)}
        </div>
      </Section>
      <Records rec={club.records} />
    </Layout>
  );
}

export default Club;
mount(Club);

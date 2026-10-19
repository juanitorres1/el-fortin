// Historial contra cada rival: Primera División 1931–2000 (dataset público) + todas las competiciones desde 2001 (ESPN).
// La URL lleva el rival (?rival=id): se puede compartir y abre directo en ese rival.
import { useEffect, useMemo, useRef, useState } from 'react';
import { mount } from '../main.jsx';
import { headToHead, teamLogo } from '../lib/espn.js';
import { rivalDetail, rivalFacts, rivalRanking } from '../lib/facts.js';
import { DATA, mergeResults } from '../lib/core.js';
import { useJson } from '../hooks/data.js';
import { Layout, PageBand } from '../components/Layout.jsx';
import { MatchList } from '../components/Match.jsx';
import { Crest, Empty, Skeletons } from '../components/ui.jsx';
import { Efemerides, HistoryRecords } from '../sections/Records.jsx';

const COPAS = new Set(['Copa Argentina', 'Supercopa Argentina', 'Supercopa Internacional', 'Trofeo de Campeones']);
const INTERNACIONAL = new Set(['Copa Libertadores', 'Copa Sudamericana', 'Recopa Sudamericana']);
const COMP_FILTERS = {
  todas: ['Todas', () => true],
  liga: ['Torneos locales', (m) => !COPAS.has(m.comp) && !INTERNACIONAL.has(m.comp)],
  copas: ['Copas', (m) => COPAS.has(m.comp)],
  internacional: ['Internacional', (m) => INTERNACIONAL.has(m.comp)],
};
const ERA_FILTERS = { todas: ['Desde 1931', () => true], historico: ['1931–2000', (m) => !m.date], espn: ['Desde 2001', (m) => Boolean(m.date)] };
const WHERE = { local: 'de local', visitante: 'de visitante', neutral: 'en cancha neutral' };

// historico.json viene en formato compacto (ver scripts/import-historico.mjs).
function hydrateHistoric(m) {
  const withLogo = (t) => ({ ...t, logo: /^\d+$/.test(t.id) ? teamLogo(t.id) : null });
  return { ...m, date: null, comp: 'Primera División', status: 'post', completed: true, home: withLogo(m.home), away: withLogo(m.away) };
}

function Select({ label, value, onChange, options, selectRef }) {
  return (
    <label>
      <span>{label}</span>
      <select ref={selectRef} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}

function ShareButton() {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: document.title, url: location.href });
      else {
        await navigator.clipboard.writeText(location.href);
        setCopied(true);
      }
    } catch {
      /* el usuario canceló */
    }
  };
  return <button type="button" className="btn btn-outline" onClick={share}>{copied ? 'Link copiado' : 'Compartir este historial'}</button>;
}

/** De local, de visitante y neutral, racha, mayor goleada, peor derrota y últimos triunfos. */
function Detail({ row, filtered }) {
  const d = rivalDetail(row.matches);
  const streak = rivalFacts(filtered, row.id)?.streak;
  const rec = (x) => `${x.g} G · ${x.e} E · ${x.p} P`;
  const match = (x) => (x ? <><b className="num">{x.score}</b> en {x.year}<small> · {x.comp}, {WHERE[x.where]}</small></> : <span className="muted">No hay</span>);
  const items = [
    ['De local', rec(d.home)],
    ['De visitante', rec(d.away)],
    d.neutral.g + d.neutral.e + d.neutral.p > 0 && ['En cancha neutral', rec(d.neutral)],
    streak && ['Racha', streak],
    ['Mayor goleada', match(d.biggestWin)],
    ['Peor derrota', match(d.worstLoss)],
    ['Último triunfo de local', match(d.lastHomeWin)],
    ['Último triunfo de visitante', match(d.lastAwayWin)],
  ].filter(Boolean);
  return (
    <div className="card h2h-detail">
      <dl>{items.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      <ShareButton />
    </div>
  );
}

function H2HCard({ r }) {
  const pct = (n) => ((n / r.pj) * 100).toFixed(1);
  return (
    <article className="h2h-card">
      <header className="h2h-head"><Crest url={r.logo} size={48} /><h2 className="h2">Vélez vs. {r.name}</h2></header>
      <dl className="h2h-stats">
        <div className="is-g"><dt>Ganados</dt><dd className="num">{r.g}</dd></div>
        <div className="is-e"><dt>Empates</dt><dd className="num">{r.e}</dd></div>
        <div className="is-p"><dt>Perdidos</dt><dd className="num">{r.p}</dd></div>
      </dl>
      <div className="bar" role="img" aria-label={`${pct(r.g)}% ganados, ${pct(r.e)}% empatados, ${pct(r.p)}% perdidos`}>
        <i className="is-g" style={{ width: `${pct(r.g)}%` }} /><i className="is-e" style={{ width: `${pct(r.e)}%` }} /><i className="is-p" style={{ width: `${pct(r.p)}%` }} />
      </div>
      <p className="h2h-foot"><span>{r.pj} partidos</span><span>Goles {r.gf}-{r.gc}</span></p>
    </article>
  );
}

/** Contra quién le va mejor y peor (efectividad), con los filtros de arriba. Tocar un rival abre su historial. */
function RivalRanking({ rows, onPick }) {
  const r = rivalRanking(rows);
  if (!r) return null;
  const List = ({ title, list, tone }) => (
    <article className="card rk-card">
      <h3 className="h3">{title}</h3>
      <ol className="rk">
        {list.map((x) => (
          <li key={x.id}>
            <span className="rk-crest"><Crest url={x.logo} size={22} /></span>
            <span className="rk-main">
              <button type="button" className="link-btn" onClick={() => onPick(x.id)}>{x.name}</button>
              <small className="muted">{x.pj} PJ · {x.g} G · {x.e} E · {x.p} P</small>
              <i className={tone} style={{ width: `${x.eff}%` }} />
            </span>
            <b className="num">{x.eff.toLocaleString('es-AR')}%</b>
          </li>
        ))}
      </ol>
    </article>
  );
  return (
    <section className="block" aria-labelledby="t-ranking">
      <h2 className="h2" id="t-ranking">Mejores y peores rivales</h2>
      <div className="records">
        <List title="Le va mejor contra" list={r.best} tone="is-g" />
        <List title="Le cuesta más contra" list={r.worst} tone="is-p" />
      </div>
      <p className="muted small">Efectividad: porcentaje de los puntos posibles, con 3 por triunfo (también en los años en que el triunfo daba 2). Rivales con al menos {r.minPj} partidos, con la época y la competición elegidas arriba.</p>
    </section>
  );
}

function Historial() {
  const espn = useJson(`${DATA}matches.json`);
  const old = useJson('data/historico.json');
  const club = useJson('data/club.json');
  const matches = useMemo(
    () => (espn === undefined || old === undefined ? undefined : [...(old?.matches ?? []).map(hydrateHistoric), ...mergeResults(espn?.matches ?? [], [])]),
    [espn, old],
  );
  const [rival, setRival] = useState(null);
  // El rival de la URL se lee al montar (el HTML prerenderizado es el mismo para todos los ?rival=).
  useEffect(() => setRival(new URLSearchParams(location.search).get('rival')), []);
  const [comp, setComp] = useState('todas');
  const [era, setEra] = useState('todas');
  const rivalRef = useRef(null);

  const allRivals = useMemo(() => (matches ? headToHead(matches) : []), [matches]);
  const filtered = useMemo(() => (matches ?? []).filter((m) => COMP_FILTERS[comp][1](m) && ERA_FILTERS[era][1](m)), [matches, comp, era]);
  const rows = useMemo(() => headToHead(filtered), [filtered]);
  const rivalId = rival ?? allRivals.find((r) => r.name === 'River Plate')?.id ?? allRivals[0]?.id;
  const r = rows.find((x) => x.id === rivalId);
  const rivalName = allRivals.find((x) => x.id === rivalId)?.name;

  // URL y título siguen al rival elegido (si se eligió uno o se entró con ?rival=).
  useEffect(() => {
    if (!rival || !rivalName) return;
    const url = new URL(location.href);
    url.searchParams.set('rival', rival);
    history.replaceState(null, '', url);
    document.title = `Vélez vs. ${rivalName} · Historial · El Fortín`;
  }, [rival, rivalName]);

  const pickFromTable = (id) => {
    setRival(id);
    rivalRef.current?.scrollIntoView({ block: 'center' });
    rivalRef.current?.focus();
  };
  const note = !matches ? 'Cargando historial…'
    : matches.some((m) => !m.date)
      ? `${matches.length.toLocaleString('es-AR')} partidos oficiales: Primera División 1931–2000 (dataset público) y todas las competiciones desde 2001 (ESPN).`
      : `${matches.length.toLocaleString('es-AR')} partidos oficiales registrados por ESPN desde 2001.`;

  return (
    <Layout page="historial" band={<PageBand title="Historial"><p className="muted small">{note}</p></PageBand>}>
      <div className="h2h-controls">
        <Select
          label="Rival" value={rivalId ?? ''} onChange={setRival} selectRef={rivalRef}
          options={[...allRivals].sort((a, b) => a.name.localeCompare(b.name, 'es')).map((x) => [x.id, `${x.name} (${x.pj})`])}
        />
        <Select label="Época" value={era} onChange={setEra} options={Object.entries(ERA_FILTERS).map(([v, [l]]) => [v, l])} />
        <Select label="Competición" value={comp} onChange={setComp} options={Object.entries(COMP_FILTERS).map(([v, [l]]) => [v, l])} />
      </div>
      <div className="h2h">
        {!matches ? <Skeletons className="sk-h2h" />
          : !r ? <Empty>No hay partidos contra este rival con esos filtros.</Empty>
          : (
            <>
              <div className="h2h-side"><H2HCard r={r} /><Detail row={r} filtered={filtered} /></div>
              <div><h3 className="h3">Últimos cruces</h3><MatchList matches={r.matches.slice(0, 8)} showYear /></div>
            </>
          )}
      </div>
      <section className="block bleed bleed-gray" aria-labelledby="t-enfrentados">
        <h2 className="h2" id="t-enfrentados">Los más enfrentados</h2>
        <div className="table-scroll">
          {matches && (
            <table>
              <caption className="sr-only">Rivales con más partidos</caption>
              <thead>
                <tr>{['Rival', 'PJ', 'G', 'E', 'P', 'GF', 'GC', '% G'].map((h, i) => <th key={h} scope="col" className={i === 0 ? 'team' : undefined}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {rows.slice(0, 12).map((x) => (
                  <tr key={x.id}>
                    <td className="team"><Crest url={x.logo} size={22} /><button type="button" className="link-btn" onClick={() => pickFromTable(x.id)}>{x.name}</button></td>
                    <td>{x.pj}</td><td>{x.g}</td><td>{x.e}</td><td>{x.p}</td><td>{x.gf}</td><td>{x.gc}</td><td>{Math.round((x.g / x.pj) * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
      {matches && <RivalRanking rows={rows} onPick={pickFromTable} />}
      {matches && <HistoryRecords matches={matches} />}
      {matches && club !== undefined && <Efemerides matches={matches} club={club} />}
    </Layout>
  );
}

export default Historial;
mount(Historial);

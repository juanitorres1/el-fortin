// Jugador: ficha, números por torneo y partido por partido del año (games.json). El jugador sale de ?id= (el HTML
// prerenderizado es el mismo para todos: el id se lee al montar). Se llega desde el Plantel.
import { useEffect, useMemo, useState } from 'react';
import { mount } from '../main.jsx';
import { DATA, fmt } from '../lib/core.js';
import { keeperRecord } from '../lib/espn.js';
import { useJson, useRoster } from '../hooks/data.js';
import { Layout, PageBand } from '../components/Layout.jsx';
import { Empty, ResultBadge, Skeletons } from '../components/ui.jsx';

const POS = { G: 'Arquero', D: 'Defensor', M: 'Mediocampista', F: 'Delantero' };
const COLS = [['pj', 'PJ'], ['tit', 'Tit'], ['g', 'Goles'], ['a', 'Asist'], ['am', 'Amar'], ['r', 'Rojas']];
const KEEPER_COLS = [['pj', 'PJ'], ['tit', 'Tit'], ['ataj', 'Ataj'], ['gc', 'Recib'], ['am', 'Amar'], ['r', 'Rojas']];

/** Los cuatro números grandes de un arquero (sin atajadas si ESPN no las informó). */
const keeperLeaders = (k) => [['Partidos', k.pj], ['Vallas invictas', k.vi], k.ataj > 0 ? ['Atajadas', k.ataj] : null, ['Goles recibidos', k.gc]].filter(Boolean);

/** Lo que hizo el jugador en cada partido del año, del más nuevo al más viejo. */
function playerGames(games, id) {
  return (games ?? []).flatMap((g) => {
    const p = g.players.find((x) => x.id === id);
    return p ? [{ ...g, me: p }] : [];
  }).reverse();
}

function Facts({ log }) {
  const lastGoal = log.find((g) => g.me.g > 0);
  const scoringRun = log.findIndex((g) => !(g.me.g > 0));
  const wins = log.filter((g) => g.result === 'G').length;
  const items = [
    lastGoal && ['Último gol', `${lastGoal.me.g > 1 ? `${lastGoal.me.g} goles` : 'Gol'} a ${lastGoal.rival.name} (${fmt.day.format(new Date(lastGoal.date))} ${fmt.mon.format(new Date(lastGoal.date)).replace('.', '')})`],
    scoringRun > 1 && ['Racha', `Hizo goles en los últimos ${scoringRun} partidos que jugó`],
    log.length > 0 && ['Con él en cancha', `${wins} triunfos en ${log.length} partidos (${Math.round((wins / log.length) * 100)}%)`],
  ].filter(Boolean);
  if (!items.length) return null;
  return <dl className="h2h-detail player-facts card">{items.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>;
}

function Jugador() {
  const roster = useRoster();
  const players = useJson(`${DATA}players.json`);
  const games = useJson(`${DATA}games.json`);
  const [id, setId] = useState(null);
  useEffect(() => setId(new URLSearchParams(location.search).get('id')), []);

  const list = useMemo(() => [...(roster?.players ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'es')), [roster]);
  const p = list.find((x) => x.id === id);
  const stats = (players?.tournaments ?? []).map((t) => ({ t, s: t.players.find((x) => x.id === id) })).filter((x) => x.s);
  const log = useMemo(() => playerGames(games?.games, id), [games, id]);
  const name = p?.name ?? stats[0]?.s.name ?? log[0]?.me.name;
  // Arqueros: vallas invictas, atajadas y goles recibidos en vez de goles y asistencias.
  const keeper = p?.pos === 'G' ? keeperRecord(games?.games, id) : null;
  const cols = keeper ? KEEPER_COLS : COLS;

  useEffect(() => {
    if (!id) return;
    const url = new URL(location.href);
    url.searchParams.set('id', id);
    history.replaceState(null, '', url);
    if (name) document.title = `${name} · Vélez · El Fortín`;
  }, [id, name]);

  const loading = roster === undefined || players === undefined || games === undefined;
  return (
    <Layout page="jugador" band={<PageBand title={name ?? 'Jugador'}>{p && <p className="lead">{[p.jersey && `#${p.jersey}`, POS[p.pos], p.age && `${p.age} años`, p.nat].filter(Boolean).join(' · ')}</p>}</PageBand>}>
      <div className="h2h-controls player-pick">
        <label>
          <span>Elegí un jugador</span>
          <select value={id ?? ''} onChange={(e) => setId(e.target.value)}>
            <option value="" disabled>Jugadores del plantel</option>
            {list.map((x) => <option key={x.id} value={x.id}>{x.name}{x.jersey ? ` (${x.jersey})` : ''}</option>)}
          </select>
        </label>
        <a className="btn btn-outline" href="plantel.html">Volver al plantel</a>
      </div>
      {loading ? <Skeletons n={2} className="sk-card" />
        : !id ? <Empty>Elegí un jugador para ver sus números del año, partido por partido.</Empty>
        : !name ? <Empty>No encontramos a ese jugador en el plantel actual.</Empty>
        : (
          <>
            <section className="block" aria-labelledby="t-numeros">
              <h2 className="h2" id="t-numeros">Sus números</h2>
              {stats.length ? (
                <>
                  <div className="leaders">
                    {(keeper ? keeperLeaders(keeper) : [['g', 'Goles'], ['a', 'Asistencias'], ['pj', 'Partidos'], ['tit', 'Titular']].map(([k, label]) => [label, stats.reduce((n, x) => n + (x.s[k] ?? 0), 0)])).map(([label, n]) => (
                      <div key={label} className="leader"><span className="leader-label">{label}</span><strong>En el año</strong><b className="num">{n}</b></div>
                    ))}
                  </div>
                  <div className="table-scroll">
                    <table>
                      <caption className="sr-only">Estadísticas de {name} por torneo</caption>
                      <thead><tr><th scope="col" className="team">Torneo</th>{cols.map(([, l]) => <th key={l} scope="col">{l}</th>)}</tr></thead>
                      <tbody>{stats.map(({ t, s }) => <tr key={t.key}><td className="team">{t.label}</td>{cols.map(([k]) => <td key={k}>{s[k] ?? 0}</td>)}</tr>)}</tbody>
                    </table>
                  </div>
                </>
              ) : <Empty>Todavía no jugó partidos oficiales este año.</Empty>}
              <Facts log={log} />
            </section>
            {log.length > 0 && (
              <section className="block bleed bleed-gray" aria-labelledby="t-partidos">
                <h2 className="h2" id="t-partidos">Partido por partido</h2>
                <ol className="pl-log">
                  {log.map((g) => (
                    <li key={g.id}>
                      <span className="pl-date num">{fmt.day.format(new Date(g.date))} {fmt.mon.format(new Date(g.date)).replace('.', '')}</span>
                      <span className="pl-main">
                        <strong>{g.home ? 'vs' : 'en cancha de'} {g.rival.name}</strong>
                        <small className="muted">{g.label} · {g.me.s ? 'Titular' : 'Entró'}</small>
                      </span>
                      <span className="pl-marks" role="img" aria-label={[keeper && g.me.s === 1 && g.score.endsWith('-0') && 'valla invicta', keeper && g.me.ataj > 0 && `${g.me.ataj} atajadas`, g.me.g && `${g.me.g} goles`, g.me.a && `${g.me.a} asistencias`, g.me.am && 'amarilla', g.me.r && 'roja'].filter(Boolean).join(', ') || 'Sin goles ni tarjetas'}>
                        {keeper && g.me.s === 1 && g.score.endsWith('-0') && <span className="pl-mark pl-vi" aria-hidden="true">Valla invicta</span>}
                        {keeper && g.me.ataj > 0 && <span className="pl-mark pl-a" aria-hidden="true">{g.me.ataj} ataj.</span>}
                        {g.me.g > 0 && <span className="pl-mark pl-g" aria-hidden="true">{'⚽'.repeat(Math.min(g.me.g, 3))}</span>}
                        {g.me.a > 0 && <span className="pl-mark pl-a" aria-hidden="true">A{g.me.a > 1 ? `×${g.me.a}` : ''}</span>}
                        {g.me.am > 0 && <span className="pl-mark pl-y" aria-hidden="true" />}
                        {g.me.r > 0 && <span className="pl-mark pl-r" aria-hidden="true" />}
                      </span>
                      <span className="pl-score"><span className="score">{g.score}</span><ResultBadge result={g.result} /></span>
                    </li>
                  ))}
                </ol>
                <p className="muted small">Partidos oficiales del año. Datos de ESPN{games?.updatedAt ? `, actualizados el ${fmt.stamp.format(new Date(games.updatedAt))}` : ''}.</p>
              </section>
            )}
          </>
        )}
    </Layout>
  );
}

export default Jugador;
mount(Jugador);

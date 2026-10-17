// Plantel: sanciones estimadas, jugadores por puesto y estadísticas por torneo. Todo de ESPN.
// No se muestran lesionados ni DT: ESPN no informa lesiones del fútbol argentino y su DT está desactualizado.
import { useState } from 'react';
import { mount } from '../main.jsx';
import { DATA, fmt, sized } from '../lib/core.js';
import { keeperRecord } from '../lib/espn.js';
import { useJson, useRoster } from '../hooks/data.js';
import { useScrollToHash } from '../hooks/page.js';
import { Layout, PageBand } from '../components/Layout.jsx';
import { Empty, Segmented, Skeletons } from '../components/ui.jsx';

const POS_ORDER = ['G', 'D', 'M', 'F'];
const POS_GROUP = { G: 'Arqueros', D: 'Defensores', M: 'Mediocampistas', F: 'Delanteros' };
const STAT_COLS = [
  ['pj', 'PJ', 'Partidos jugados'], ['tit', 'Tit', 'Titular'], ['g', 'Goles', 'Goles'], ['a', 'Asist', 'Asistencias'],
  ['rem', 'Rem', 'Remates'], ['arco', 'Arco', 'Remates al arco'], ['am', 'Amar', 'Amarillas'], ['r', 'Rojas', 'Rojas'],
  ['fc', 'Faltas', 'Faltas cometidas'], ['ataj', 'Ataj', 'Atajadas (arqueros)'], ['gc', 'GR', 'Goles recibidos (arqueros)'],
];

function Alert({ title, cls, items }) {
  return (
    <article className={`alert ${cls}`}>
      <h3 className="alert-title">{title}<b className="num">{items.length}</b></h3>
      {items.length ? <ul>{items.map((d) => <li key={d.id + d.tournament}><strong>{d.name}</strong> · {d.text} ({d.tournament})</li>)}</ul> : <p className="muted">Ninguno.</p>}
    </article>
  );
}

/** Lo que se muestra en la tarjeta: goles y asistencias, o vallas invictas y atajadas si es arquero. */
function cardStats(stats, keeper, saves) {
  if (keeper) {
    return [['PJ', keeper.pj, 'Partidos jugados'], ['Vallas', keeper.vi, 'Vallas invictas'], saves ? ['Ataj.', keeper.ataj, 'Atajadas'] : ['Recib.', keeper.gc, 'Goles recibidos']];
  }
  return [['PJ', stats?.pj ?? 0, 'Partidos jugados'], ['Goles', stats?.g ?? 0, 'Goles'], ['Asist.', stats?.a ?? 0, 'Asistencias']];
}

function PlayerCard({ p, stats, keeper, saves, sanction, label }) {
  return (
    <article className="player">
      <div className="player-num num" aria-label={`Número ${p.jersey ?? ''}`}>{p.jersey ?? '–'}</div>
      <div className="player-main">
        <h4 className="player-name"><a href={`jugador.html?id=${encodeURIComponent(p.id)}`}>{p.name}</a></h4>
        <p className="muted">
          {p.flag && <img src={sized(p.flag, 16)} alt="" width="16" height="16" loading="lazy" decoding="async" onError={(e) => e.currentTarget.remove()} />}
          {p.nat ?? ''}{p.age ? ` · ${p.age} años` : ''}
        </p>
        {sanction && (sanction.kind === 'limite'
          ? <span className="chip chip-yellow">{sanction.yellows} amarillas</span>
          : <span className="chip chip-red">Suspendido</span>)}
      </div>
      <dl className="player-stats" aria-label={label}>
        {cardStats(stats, keeper, saves).map(([dt, n, title]) => <div key={dt} title={title}><dt>{dt}</dt><dd className="num">{n}</dd></div>)}
      </dl>
    </article>
  );
}

function Squad({ roster, players, games }) {
  if (roster === undefined) return <div className="squad-grid"><Skeletons n={6} className="sk-player" /></div>;
  if (!roster?.players?.length) return <Empty>El plantel no está disponible ahora.</Empty>;
  const current = players?.tournaments?.[0];
  const statsById = new Map((current?.players ?? []).map((p) => [p.id, p]));
  const sanctions = players?.discipline ?? [];
  // Arqueros: vallas invictas (fue titular y Vélez no recibió goles) y atajadas del torneo, desde games.json.
  // Si ESPN no informa atajadas de ningún arquero, se muestran los goles recibidos.
  const keepers = new Map(roster.players.filter((p) => p.pos === 'G').map((p) => [p.id, keeperRecord(games?.games, p.id, current?.label)]));
  const saves = [...keepers.values()].some((k) => k.ataj > 0);
  const byPos = new Map();
  for (const p of roster.players) byPos.set(p.pos, [...(byPos.get(p.pos) ?? []), p]);
  const order = [...POS_ORDER, ...[...byPos.keys()].filter((k) => !POS_ORDER.includes(k))];
  return order.filter((pos) => byPos.get(pos)?.length).map((pos) => (
    <section key={pos} className="squad-group">
      <h3 className="h3">{POS_GROUP[pos] ?? 'Otros'}</h3>
      <div className="squad-grid">
        {[...byPos.get(pos)].sort((a, b) => Number(a.jersey ?? 99) - Number(b.jersey ?? 99)).map((p) => (
          <PlayerCard key={p.id} p={p} stats={statsById.get(p.id)} keeper={keepers.get(p.id)} saves={saves} sanction={sanctions.find((d) => d.id === p.id)} label={current?.label ?? 'Torneo actual'} />
        ))}
      </div>
    </section>
  ));
}

function Leader({ t, label, k, unit }) {
  const p = [...t.players].sort((a, b) => b[k] - a[k] || a.pj - b.pj)[0];
  if (!p || !(p[k] > 0)) return null;
  return <div className="leader"><span className="leader-label">{label}</span><strong>{p.name}</strong><b className="num">{p[k]}</b><small>{unit}</small></div>;
}

function Stats({ players }) {
  const [key, setKey] = useState(null);
  const [sort, setSort] = useState('g');
  const tournaments = players?.tournaments ?? [];
  if (players === undefined) return <div className="table-scroll"><Skeletons className="sk-table" /></div>;
  if (!tournaments.length) return <Empty>Todavía no hay estadísticas de jugadores para este año.</Empty>;
  const t = tournaments.find((x) => x.key === key) ?? tournaments[0];
  // Las columnas de arquero y tarjetas aparecen solo si alguien tiene datos.
  const cols = STAT_COLS.filter(([k]) => ['pj', 'g', 'a'].includes(k) || t.players.some((p) => p[k] > 0));
  const sorted = [...t.players].sort((a, b) => (b[sort] ?? 0) - (a[sort] ?? 0) || b.pj - a.pj);
  return (
    <>
      <Segmented label="Elegir torneo" options={tournaments.map((x) => ({ value: x.key, label: x.label }))} value={t.key} onChange={setKey} />
      <div className="leaders">
        <Leader t={t} label="Goleador" k="g" unit="goles" />
        <Leader t={t} label="Asistidor" k="a" unit="asistencias" />
        <Leader t={t} label="Más partidos" k="pj" unit="partidos" />
        <Leader t={t} label="Más amarillas" k="am" unit="amarillas" />
      </div>
      <div className="table-scroll">
        <table className="stats-table">
          <caption className="sr-only">Estadísticas del {t.label}, ordenadas por {STAT_COLS.find(([k]) => k === sort)[2]}</caption>
          <thead>
            <tr>
              <th scope="col" className="team">Jugador</th>
              {cols.map(([k, l, title]) => (
                <th key={k} scope="col" aria-sort={k === sort ? 'descending' : 'none'}>
                  <button type="button" title={`Ordenar por ${title}`} onClick={() => setSort(k)}>{l}</button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => (
              <tr key={p.id}><td className="team"><a href={`jugador.html?id=${encodeURIComponent(p.id)}`}>{p.name}</a></td>{cols.map(([k]) => <td key={k} className={k === sort ? 'is-sorted' : undefined}>{p[k] ?? 0}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small">{t.matches} partidos del {t.label}. Datos de ESPN, actualizados el {fmt.stamp.format(new Date(players.updatedAt))}. Tocá una columna para ordenar.</p>
    </>
  );
}

function Plantel() {
  const players = useJson(`${DATA}players.json`);
  const games = useJson(`${DATA}games.json`);
  const roster = useRoster();
  const sanctions = players?.discipline ?? [];
  useScrollToHash(players !== undefined && roster !== undefined);
  return (
    <Layout page="plantel" band={<PageBand title="Plantel" />}>
      <section className="block" aria-labelledby="t-disponibilidad">
        <h2 className="h2" id="t-disponibilidad">Disponibilidad</h2>
        <div className="alerts">
          {players === undefined ? <Skeletons n={2} className="sk-alert" /> : (
            <>
              <Alert title="Suspendidos próximo partido" cls="alert-red" items={sanctions.filter((d) => d.kind !== 'limite')} />
              <Alert title="Al límite de amarillas" cls="alert-yellow" items={sanctions.filter((d) => d.kind === 'limite')} />
            </>
          )}
        </div>
        <p className="muted small">Estimación con las tarjetas de cada partido: 5 amarillas en un mismo torneo o una roja en el último partido. La sanción oficial la define el Tribunal de Disciplina.</p>
      </section>
      <section className="block" aria-labelledby="t-plantel">
        <div className="section-head">
          <h2 className="h2" id="t-plantel">Jugadores</h2>
          <p className="muted small">{players?.tournaments?.[0] ? `Partidos, goles y asistencias del ${players.tournaments[0].label} (arqueros: vallas invictas).` : ''}</p>
        </div>
        <Squad roster={roster} players={players} games={games} />
      </section>
      <section className="block bleed bleed-gray" id="estadisticas" aria-labelledby="t-estadisticas">
        <h2 className="h2" id="t-estadisticas">Estadísticas</h2>
        <Stats players={players} />
      </section>
    </Layout>
  );
}

export default Plantel;
mount(Plantel);

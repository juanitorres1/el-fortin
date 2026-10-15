// Tablas: zonas del torneo en curso, anual (calculada) y promedios, con la zona de descenso marcada.
import { useState } from 'react';
import { VELEZ_ID, averagesTable, relegation } from '../lib/espn.js';
import { RELEGATION_NOTE, rulesApply } from '../lib/rules.js';
import { Crest, Segmented, Skeletons } from '../components/ui.jsx';

const DESC = 'Hoy descendería';
const COLS = [
  { key: 'pts', title: 'Pts', bold: true }, { key: 'pj', title: 'PJ' }, { key: 'goles', title: 'Goles' },
  { key: 'dg', title: 'Dif' }, { key: 'g', title: 'G' }, { key: 'e', title: 'E' }, { key: 'p', title: 'P' },
];

// Promedios: las fases guardadas por el deploy, con la fase en curso reemplazada por la tabla en vivo.
function averagesFrom(promedios, standings) {
  if (!promedios?.parts?.length) return null;
  const parts = promedios.parts.filter((p) => p.key !== standings.phaseKey);
  if (standings.phaseKey) parts.push({ key: standings.phaseKey, season: standings.year, groups: standings.groups });
  const currentIds = new Set(standings.groups.flatMap((g) => g.rows).map((r) => r.id));
  return currentIds.size ? averagesTable(parts, currentIds) : null;
}

/** Todas las tablas para mostrar: [{ name, columns, rows: [{ pos, id, name, logo, mark, values }], note }]. */
export function buildTables(standings, promedios) {
  const toRow = (r) => ({ pos: r.rank, id: r.id, name: r.name, logo: r.logo, values: { ...r, goles: `${r.gf}:${r.gc}` } });
  const phase = (standings.phase ?? '').replace('Torneo ', '');
  const tables = standings.groups
    .filter((g) => g.rows.length)
    .map((g) => ({ name: `${g.name}${phase ? ` · ${phase}` : ''}`, columns: COLS, rows: g.rows.map(toRow) }));
  const avg = averagesFrom(promedios, standings);
  // La regla de descenso está revisada para RULES_YEAR: en una temporada nueva, sin revisar, no se marca a nadie.
  const rel = avg && standings.annual?.rows.length && rulesApply(standings.year) ? relegation(avg.rows, standings.annual.rows) : {};
  if (standings.annual?.rows.length) {
    tables.push({
      name: 'Tabla anual', columns: COLS,
      rows: standings.annual.rows.map((r) => ({ ...toRow(r), mark: r.id === rel.anual ? DESC : null })),
      note: 'Suma de las fases regulares (Apertura + Clausura); desempate por diferencia de gol y goles a favor.',
    });
  }
  if (avg?.rows.length) {
    tables.push({
      name: 'Promedios',
      columns: [{ key: 'prom', title: 'Prom', bold: true }, ...avg.seasons.map((y) => ({ key: `t${y}`, title: String(y) })), { key: 'pts', title: 'Pts' }, { key: 'pj', title: 'PJ' }],
      rows: avg.rows.map((r) => ({
        pos: r.rank, id: r.id, name: r.name, logo: r.logo, mark: r.id === rel.promedios ? DESC : null,
        values: { prom: r.prom.toFixed(3), pts: r.pts, pj: r.pj, ...Object.fromEntries(avg.seasons.map((y) => [`t${y}`, r.bySeason[y] ?? '–'])) },
      })),
      note: `Puntos ÷ partidos de las temporadas ${avg.seasons.join(', ')}, sin playoffs; los ascendidos cuentan desde que llegaron a Primera. ${rulesApply(standings.year) ? RELEGATION_NOTE : `Reglamento de descensos de ${standings.year} todavía sin revisar: no se marca quién desciende.`}`,
    });
  }
  return tables;
}

const cell = (c, v) => (c.key === 'dg' ? `${Number(v) > 0 ? '+' : ''}${v ?? ''}` : v ?? '');

/** Una tabla de posiciones con Vélez resaltado. */
export function StandingsTable({ table }) {
  return (
    <table>
      <caption className="sr-only">{table.name}</caption>
      <thead>
        <tr><th scope="col">#</th><th scope="col" className="team">Equipo</th>{table.columns.map((c) => <th key={c.key} scope="col">{c.title}</th>)}</tr>
      </thead>
      <tbody>
        {table.rows.map((r) => {
          const isVelez = r.id === VELEZ_ID;
          return (
            <tr key={r.id} className={isVelez ? 'is-velez' : r.mark ? 'is-desc' : undefined} aria-current={isVelez ? 'true' : undefined}>
              <td className="pos">{r.pos}</td>
              <td className="team"><Crest url={r.logo} size={22} />{r.name}{r.mark && <span className="tag tag-desc">{r.mark}</span>}</td>
              {table.columns.map((c) => <td key={c.key} className={c.bold ? 'pts' : undefined}>{cell(c, r.values[c.key])}</td>)}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** Sección de tablas con selector. `tables` undefined = cargando. Por defecto, la zona de Vélez. */
export function Tablas({ tables, source }) {
  const [selected, setSelected] = useState(null);
  const table = tables && (tables.find((t) => t.name === selected) ?? tables.find((t) => t.rows.some((r) => r.id === VELEZ_ID)) ?? tables[0]);
  return (
    <section className="block bleed bleed-gray" id="tablas" aria-labelledby="t-tablas">
      <h2 className="h2" id="t-tablas">Tablas</h2>
      {tables === undefined ? <div className="table-scroll"><Skeletons className="sk-table" /></div>
        : !table ? <p className="empty">La tabla no está disponible ahora.</p>
        : (
          <>
            <Segmented label="Elegir tabla" options={tables.map((t) => ({ value: t.name, label: t.name }))} value={table.name} onChange={setSelected} />
            <div className="table-scroll"><StandingsTable table={table} /></div>
            <p className="muted small">{[table.note, source].filter(Boolean).join(' · ')}</p>
          </>
        )}
    </section>
  );
}

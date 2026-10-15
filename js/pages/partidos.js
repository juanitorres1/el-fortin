// Partidos: lo que viene, resultados, racha, tablas (zonas + anual) y copas. Todo de ESPN en vivo.
import { VELEZ_ID, averagesTable, relegation, velezView } from '../espn.js';
import { $, REFRESH_LIVE_MS, REFRESH_MS, RESULT_LABEL, esc, getJson, loadLive, logo, matchItem, mergeResults, scrollToHash, sourceNote } from '../core.js';

function renderLists(fixture, results) {
  const upcoming = fixture.filter((m) => !m.completed);
  $('[data-fixture]').innerHTML = upcoming.length
    ? upcoming.slice(0, 8).map((m) => matchItem(m)).join('')
    : '<li class="empty">Todavía no hay partidos programados.</li>';
  $('[data-results]').innerHTML = results.slice(-8).reverse().map((m) => matchItem(m, { showYear: true })).join('') || '<li class="empty">Sin resultados.</li>';
  const form = results.slice(-5).map((m) => velezView(m).result).filter(Boolean);
  $('[data-form]').innerHTML = form
    .map((r) => `<li class="res res-${r}" title="${RESULT_LABEL[r]}"><span class="sr-only">${RESULT_LABEL[r]}</span><span aria-hidden="true">${r}</span></li>`)
    .join('');
}

// ---------- Tablas: zonas del torneo en curso + anual calculada ----------

const isVelezRow = (r) => r.id === VELEZ_ID;

// Promedios: las fases guardadas por el deploy, con la fase en curso reemplazada por la tabla en vivo.
function averagesFrom(promedios, standings) {
  if (!promedios?.parts?.length) return null;
  const parts = promedios.parts.filter((p) => p.key !== standings.phaseKey);
  if (standings.phaseKey) parts.push({ key: standings.phaseKey, season: standings.year, groups: standings.groups });
  const currentIds = new Set(standings.groups.flatMap((g) => g.rows).map((r) => r.id));
  return currentIds.size ? averagesTable(parts, currentIds) : null;
}

const DESC = 'Hoy descendería';

function espnToTables(standings, promedios) {
  const cols = [
    { key: 'pts', title: 'Pts', bold: true }, { key: 'pj', title: 'PJ' }, { key: 'goles', title: 'Goles' },
    { key: 'dg', title: 'Dif' }, { key: 'g', title: 'G' }, { key: 'e', title: 'E' }, { key: 'p', title: 'P' },
  ];
  const toRow = (r) => ({ pos: r.rank, id: r.id, name: r.name, logo: r.logo, values: { ...r, goles: `${r.gf}:${r.gc}` } });
  const phase = (standings.phase ?? '').replace('Torneo ', '');
  const tables = standings.groups
    .filter((g) => g.rows.length)
    .map((g) => ({ phase, name: `${g.name}${phase ? ` · ${phase}` : ''}`, columns: cols, rows: g.rows.map(toRow) }));
  const avg = averagesFrom(promedios, standings);
  const rel = avg && standings.annual?.rows.length ? relegation(avg.rows, standings.annual.rows) : {};
  if (standings.annual?.rows.length) {
    tables.push({
      phase: null, name: 'Tabla anual', columns: cols,
      rows: standings.annual.rows.map((r) => ({ ...toRow(r), mark: r.id === rel.anual ? DESC : null })),
      note: 'Suma de las fases regulares (Apertura + Clausura); desempate por diferencia de gol y goles a favor.',
    });
  }
  if (avg?.rows.length) {
    const seasonCols = avg.seasons.map((y) => ({ key: `t${y}`, title: String(y) }));
    tables.push({
      phase: null, name: 'Promedios',
      columns: [{ key: 'prom', title: 'Prom', bold: true }, ...seasonCols, { key: 'pts', title: 'Pts' }, { key: 'pj', title: 'PJ' }],
      rows: avg.rows.map((r) => ({
        pos: r.rank, id: r.id, name: r.name, logo: r.logo, mark: r.id === rel.promedios ? DESC : null,
        values: { prom: r.prom.toFixed(3), pts: r.pts, pj: r.pj, ...Object.fromEntries(avg.seasons.map((y) => [`t${y}`, r.bySeason[y] ?? '–'])) },
      })),
      note: `Puntos ÷ partidos de las temporadas ${avg.seasons.join(', ')}, sin playoffs; los ascendidos cuentan desde que llegaron a Primera. Descienden el último de los promedios y el último de la tabla anual (si es el mismo equipo, el anteúltimo de la anual). Empates en zona de descenso: partido de desempate.`,
    });
  }
  return tables;
}

let selectedTable = null;
function renderTables(tables, note) {
  if (!tables.length) {
    $('[data-standings]').innerHTML = '<p class="empty">La tabla no está disponible ahora.</p>';
    return;
  }
  // Por defecto, la zona de Vélez del torneo en curso.
  selectedTable = tables.some((t) => t.name === selectedTable) ? selectedTable : tables.find((t) => t.rows.some(isVelezRow))?.name ?? tables[0].name;
  const table = tables.find((t) => t.name === selectedTable);
  $('[data-standings-note]').textContent = [table.note, note].filter(Boolean).join(' · ');
  const tabs = $('[data-standings-tabs]');
  tabs.innerHTML = tables
    .map((t) => `<button class="seg" type="button" aria-pressed="${t.name === table.name}" data-table="${esc(t.name)}">${esc(t.name)}</button>`)
    .join('');
  tabs.onclick = (ev) => {
    const btn = ev.target.closest('[data-table]');
    if (!btn) return;
    selectedTable = btn.dataset.table;
    renderTables(tables, note);
  };
  const cell = (c, v) => (c.key === 'dg' ? `${Number(v) > 0 ? '+' : ''}${v ?? ''}` : esc(v ?? ''));
  $('[data-standings]').innerHTML = `<table>
    <caption class="sr-only">${esc(table.name)}</caption>
    <thead><tr><th scope="col">#</th><th scope="col" class="team">Equipo</th>${table.columns.map((c) => `<th scope="col">${esc(c.title)}</th>`).join('')}</tr></thead>
    <tbody>${table.rows
      .map((r) => `<tr${isVelezRow(r) ? ' class="is-velez" aria-current="true"' : r.mark ? ' class="is-desc"' : ''}>
        <td class="pos">${r.pos}</td><td class="team">${logo(r.logo, 22)}${esc(r.name)}${r.mark ? `<span class="tag tag-desc">${esc(r.mark)}</span>` : ''}</td>
        ${table.columns.map((c) => `<td${c.bold ? ' class="pts"' : ''}>${cell(c, r.values[c.key])}</td>`).join('')}
      </tr>`)
      .join('')}</tbody></table>`;
}

function renderCups(fixture, results) {
  const season = new Date().getFullYear();
  const byComp = new Map();
  for (const m of [...results, ...fixture.filter((x) => !x.completed)]) {
    if (m.comp === 'Liga Profesional' || m.comp === 'Amistoso' || new Date(m.date).getFullYear() !== season) continue;
    byComp.set(m.comp, [...(byComp.get(m.comp) ?? []), m]);
  }
  $('[data-cups-section]').hidden = !byComp.size;
  $('[data-cups]').innerHTML = [...byComp]
    .map(([comp, ms]) => `<div><h3 class="h3">${esc(comp)} ${season}</h3><ol class="match-list">${ms.map((m) => matchItem(m)).join('')}</ol></div>`)
    .join('');
}

let first = true;
async function refresh() {
  try {
    const { data, live } = await loadLive();
    const results = mergeResults([], data.results);
    renderLists(data.fixture, results);
    renderTables(espnToTables(data.standings, await promediosPromise), sourceNote(live, data.updatedAt));
    renderCups(data.fixture, results);
    $('[data-source]').textContent = sourceNote(live, data.updatedAt);
    if (first) scrollToHash();
    first = false;
    setTimeout(refresh, data.fixture.some((m) => m.status === 'in') ? REFRESH_LIVE_MS : REFRESH_MS);
  } catch (err) {
    console.error(err);
    $('[data-fixture]').innerHTML = '<li class="empty">No pudimos cargar los partidos. Probá en un rato.</li>';
  }
}

const promediosPromise = getJson('data/generated/promedios.json').catch(() => null);

// Desde el Inicio se llega con #agendar: abrir el desplegable.
if (location.hash === '#agendar') $('#agendar').open = true;
refresh();

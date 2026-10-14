// Partidos: lo que viene, resultados, racha, tablas (zonas + anual) y copas. Todo de ESPN en vivo.
import { VELEZ_ID, velezView } from '../espn.js';
import { $, REFRESH_LIVE_MS, REFRESH_MS, RESULT_LABEL, esc, loadLive, logo, matchItem, mergeResults, scrollToHash, sourceNote } from '../core.js';

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

function espnToTables(standings) {
  const cols = [
    { key: 'pts', title: 'Pts', bold: true }, { key: 'pj', title: 'PJ' }, { key: 'goles', title: 'Goles' },
    { key: 'dg', title: 'Dif' }, { key: 'g', title: 'G' }, { key: 'e', title: 'E' }, { key: 'p', title: 'P' },
  ];
  const toRow = (r) => ({ pos: r.rank, id: r.id, name: r.name, logo: r.logo, values: { ...r, goles: `${r.gf}:${r.gc}` } });
  const phase = (standings.phase ?? '').replace('Torneo ', '');
  const tables = standings.groups
    .filter((g) => g.rows.length)
    .map((g) => ({ phase, name: `${g.name}${phase ? ` · ${phase}` : ''}`, columns: cols, rows: g.rows.map(toRow) }));
  if (standings.annual?.rows.length) {
    tables.push({ phase: null, name: 'Tabla anual', columns: cols, rows: standings.annual.rows.map(toRow), note: 'Suma de las fases regulares (Apertura + Clausura); desempate por diferencia de gol y goles a favor.' });
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
      .map((r) => `<tr${isVelezRow(r) ? ' class="is-velez" aria-current="true"' : ''}>
        <td class="pos">${r.pos}</td><td class="team">${logo(r.logo, 22)}${esc(r.name)}</td>
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
    renderTables(espnToTables(data.standings), sourceNote(live, data.updatedAt));
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

refresh();

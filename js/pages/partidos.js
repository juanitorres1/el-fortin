// Partidos: lo que viene, resultados, racha, tablas (zonas + anual) y copas. Todo de ESPN en vivo.
import { VELEZ_ID, averagesTable, fetchPhaseRemaining, fetchScorers, relegation, velezView } from '../espn.js';
import { qualification, qualificationLines, remainingByTeam, spotsPerZone } from '../playoffs.js';
import { RELEGATION_NOTE, rulesApply } from '../rules.js';
import { $, LIVE_TIMEOUT_MS, REFRESH_LIVE_MS, REFRESH_MS, RESULT_LABEL, esc, getJson, loadLive, logo, matchItem, mergeResults, scrollToHash, sourceNote, updateLiveTitle, withTimeout } from '../core.js';

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
  // La regla de descenso está revisada para RULES_YEAR: en una temporada nueva, sin revisar, no se marca a nadie.
  const rel = avg && standings.annual?.rows.length && rulesApply(standings.year) ? relegation(avg.rows, standings.annual.rows) : {};
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
      note: `Puntos ÷ partidos de las temporadas ${avg.seasons.join(', ')}, sin playoffs; los ascendidos cuentan desde que llegaron a Primera. ${rulesApply(standings.year) ? RELEGATION_NOTE : `Reglamento de descensos de ${standings.year} todavía sin revisar: no se marca quién desciende.`}`,
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

// ---------- Goleadores del torneo ----------

let scorersCache = null; // { key, at, promise }
const playersPromise = getJson('data/generated/players.json').catch(() => null);
async function renderScorers(standings) {
  const section = $('[data-scorers-section]');
  if (scorersCache?.key !== standings.phaseKey || Date.now() - scorersCache.at > PO_TTL_MS) {
    scorersCache = { key: standings.phaseKey, at: Date.now(), promise: withTimeout(fetchScorers(standings), LIVE_TIMEOUT_MS).catch(() => []) };
  }
  const [scorers, players] = await Promise.all([scorersCache.promise, playersPromise]);
  if (!scorers.length) {
    section.hidden = true;
    return;
  }
  const phase = (standings.phase ?? '').replace('Torneo ', '');
  $('#t-goleadores').textContent = phase ? `Goleadores del ${phase}` : 'Goleadores';
  $('[data-scorers]').innerHTML = scorers
    .map((s, i) => {
      const isVelez = s.team?.id === VELEZ_ID;
      const pos = i > 0 && scorers[i - 1].goals === s.goals ? '' : i + 1; // empatados comparten puesto
      return `<li class="scorer${isVelez ? ' is-velez' : ''}">
        <span class="scorer-pos num">${pos}</span>
        <div class="scorer-main"><strong>${esc(s.name)}</strong><small>${s.team ? `${logo(s.team.logo, 18)}${esc(s.team.name)}` : ''}${s.pj ? ` · ${s.pj} PJ` : ''}</small></div>
        <b class="num scorer-goals">${s.goals}<small>goles</small></b>
      </li>`;
    })
    .join('');
  // Si no hay nadie de Vélez en el top 10, el goleador de Vélez en este torneo (de players.json).
  const year = standings.year ?? new Date().getFullYear();
  const own = players?.tournaments?.find((t) => t.label === `${phase} ${year}`)?.players?.[0];
  const note = !scorers.some((s) => s.team?.id === VELEZ_ID) && own?.g
    ? `El goleador de Vélez en el ${phase} es ${own.name}, con ${own.g} ${own.g === 1 ? 'gol' : 'goles'}. `
    : '';
  $('[data-scorers-note]').textContent = `${note}Los 10 primeros según ESPN; el equipo es el actual del jugador.`;
  section.hidden = false;
}

// ---------- Camino a los playoffs ----------

let poZone = null;
let poCache = null; // { key, at, promise }: los partidos que quedan se piden a lo sumo cada 15 min
const PO_TTL_MS = 15 * 60 * 1000;
async function renderPlayoffs(standings) {
  const section = $('[data-playoffs]');
  // Solo durante una fase regular con zonas (en playoffs no hay nada que calcular).
  // Hace falta saber cuántos pasan (ESPN lo declara con las fases de playoffs) y que la fase tenga zonas.
  const groups = standings.groups.filter((g) => g.rows.length);
  const spots = spotsPerZone(standings.playoffTeams, groups.length);
  if (!spots || !standings.phaseKey) {
    section.hidden = true;
    return;
  }
  if (poCache?.key !== standings.phaseKey || Date.now() - poCache.at > PO_TTL_MS) {
    poCache = { key: standings.phaseKey, at: Date.now(), promise: withTimeout(fetchPhaseRemaining(standings), LIVE_TIMEOUT_MS).catch(() => null) };
  }
  const events = await poCache.promise;
  if (!events) {
    section.hidden = true; // sin el fixture no se puede calcular: mejor no mostrar estados inventados
    return;
  }
  const remaining = remainingByTeam(events);
  const zones = groups.map((g) => ({ name: g.name, rows: qualification(g.rows, remaining, spots) }));
  const velezZone = zones.find((z) => z.rows.some((r) => r.id === VELEZ_ID));
  const velez = velezZone?.rows.find((r) => r.id === VELEZ_ID);
  poZone = zones.some((z) => z.name === poZone) ? poZone : velezZone?.name ?? zones[0].name;

  $('[data-po-summary]').innerHTML = velez
    ? `<p class="kicker">Vélez · ${esc(velezZone.name)}</p><ul class="previa-lines">${qualificationLines(velez, velezZone.rows, spots).map((l) => `<li>${esc(l)}</li>`).join('')}</ul>`
    : '';
  const tabs = $('[data-po-tabs]');
  tabs.innerHTML = zones.map((z) => `<button class="seg" type="button" aria-pressed="${z.name === poZone}" data-zone="${esc(z.name)}">${esc(z.name)}</button>`).join('');
  tabs.onclick = (ev) => {
    const btn = ev.target.closest('[data-zone]');
    if (!btn) return;
    poZone = btn.dataset.zone;
    renderPlayoffs(standings);
  };

  const zone = zones.find((z) => z.name === poZone);
  const status = (t) =>
    t.status === 'clasificado' ? '<span class="po-chip po-in">Clasificado</span>'
    : t.status === 'eliminado' ? '<span class="po-chip po-out">Eliminado</span>'
    : t.needed != null ? `<span class="po-chip">Asegura con ${t.needed} ${t.needed === 1 ? "pt" : "pts"}</span>`
    : '<span class="po-chip">Depende de otros</span>';
  const rivals = (t) => (t.opponents?.length
    ? `Le quedan: ${t.opponents.map((o) => `<span${o.rivalId === VELEZ_ID ? ' class="po-vs-velez"' : ''}>${esc(o.rival)} (${o.home ? 'L' : 'V'})</span>`).join(' · ')}`
    : t.left ? `Le quedan ${t.left} partidos` : 'Terminó la fase');
  $('[data-po-list]').innerHTML = [...zone.rows].sort((a, b) => a.rank - b.rank).map((t, i) => `
    ${i === spots ? '<li class="po-cut" aria-hidden="true"><span>Zona de clasificación arriba</span></li>' : ''}
    <li class="po-row${t.id === VELEZ_ID ? ' is-velez' : ''}">
      <span class="po-pos num">${t.rank}</span>
      <div class="po-main"><strong>${logo(t.logo, 22)}${esc(t.name)}</strong><small>${rivals(t)}</small></div>
      <div class="po-pts"><b class="num">${t.pts}</b><small>máx. ${t.max}</small></div>
      <div class="po-status">${status(t)}</div>
    </li>`).join('');
  $('[data-po-spots]').textContent = spots;
  section.hidden = false;
}

let first = true;
async function refresh() {
  try {
    const { data, live } = await loadLive();
    const results = mergeResults([], data.results);
    renderLists(data.fixture, results);
    renderTables(espnToTables(data.standings, await promediosPromise), sourceNote(live, data.updatedAt));
    renderCups(data.fixture, results);
    updateLiveTitle(data.fixture);
    renderPlayoffs(data.standings);
    renderScorers(data.standings);
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

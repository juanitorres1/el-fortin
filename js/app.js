import { VELEZ_ID, fetchLive, fetchRoster, headToHead, teamLogo, velezView } from './espn.js';
import { isOfficialImageUrl, isOfficialNoteUrl, matchFacts, relativeDay } from './news.js';

const TZ = 'America/Argentina/Buenos_Aires';
const LIVE_TIMEOUT_MS = 8000;
const REFRESH_MS = 5 * 60 * 1000;
const REFRESH_LIVE_MS = 60 * 1000;
const COPAS = new Set(['Copa Argentina', 'Supercopa Argentina', 'Supercopa Internacional', 'Trofeo de Campeones']);
const INTERNACIONAL = new Set(['Copa Libertadores', 'Copa Sudamericana', 'Recopa Sudamericana']);

const $ = (sel) => document.querySelector(sel);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// onerror: ESPN no tiene escudo para todos los equipos chicos; ocultamos la imagen rota.
const logo = (url, size = 24) => (url ? `<img src="${esc(url)}" alt="" width="${size}" height="${size}" loading="lazy" onerror="this.style.visibility='hidden'">` : '');

const fmt = {
  day: new Intl.DateTimeFormat('es-AR', { timeZone: TZ, day: '2-digit' }),
  mon: new Intl.DateTimeFormat('es-AR', { timeZone: TZ, month: 'short' }),
  long: new Intl.DateTimeFormat('es-AR', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' }),
  time: new Intl.DateTimeFormat('es-AR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }),
  year: new Intl.DateTimeFormat('es-AR', { timeZone: TZ, year: 'numeric' }),
  stamp: new Intl.DateTimeFormat('es-AR', { timeZone: TZ, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }),
};

async function getJson(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
}

// ---------- Partidos ----------

function matchItem(m, { showYear = false } = {}) {
  const d = new Date(m.date);
  const dateBox = m.date
    ? `<b>${fmt.day.format(d)}</b><span>${fmt.mon.format(d).replace('.', '')}${showYear ? ` ${fmt.year.format(d).slice(2)}` : ''}</span>`
    : `<b class="is-year">${m.year}</b>`;
  const { velezHome, velez, rival, result } = velezView(m);
  const right = m.completed
    ? `<span>${velez.score}-${rival.score}</span>${result ? `<span class="res res-${result}" title="${{ G: 'Ganó', E: 'Empató', P: 'Perdió' }[result]}">${result}</span>` : ''}`
    : m.status === 'in'
      ? `<span class="live-pill">${esc(m.clock ?? 'En vivo')}</span><span>${velez.score ?? 0}-${rival.score ?? 0}</span>`
      : `<span class="match-time">${m.timeValid ? fmt.time.format(d) : 'A conf.'}</span>`;
  return `<li class="match">
    <div class="match-date">${dateBox}</div>
    <div class="match-main">
      <div class="match-rival">${logo(rival.logo)}<span>${esc(rival.name)}</span></div>
      <div class="match-sub"><span class="tag">${esc(m.season ?? m.comp)}</span>${velezHome ? 'Local' : 'Visitante'}${m.venue ? ` · ${esc(m.venue)}` : ''}</div>
    </div>
    <div class="match-score">${right}</div>
  </li>`;
}

function renderLists(fixture, results) {
  const upcoming = fixture.filter((m) => !m.completed);
  $('[data-fixture]').innerHTML = upcoming.length
    ? upcoming.slice(1, 8).map((m) => matchItem(m)).join('') || '<li class="empty">No hay más partidos programados por ahora.</li>'
    : '<li class="empty">Todavía no hay partidos programados.</li>';
  const last = results.slice(-8).reverse();
  $('[data-results]').innerHTML = last.map((m) => matchItem(m, { showYear: true })).join('') || '<li class="empty">Sin resultados.</li>';
  $('[data-form]').innerHTML = results
    .slice(-5)
    .map((m) => velezView(m).result)
    .filter(Boolean)
    .map((r) => `<li class="res-${r}" title="${{ G: 'Ganó', E: 'Empató', P: 'Perdió' }[r]}">${r}</li>`)
    .join('');
}

let countdownTimer;
function renderNext(fixture) {
  const card = $('[data-next]');
  clearInterval(countdownTimer);
  const next = fixture.find((m) => m.status === 'in') ?? fixture.find((m) => !m.completed);
  if (!next) {
    card.innerHTML = '<p class="next-label">Próximo partido</p><p class="skeleton">No hay partidos programados todavía.</p>';
    return;
  }
  const d = new Date(next.date);
  const isLive = next.status === 'in';
  const side = (t) => `<div class="next-team">${logo(t.logo, 64)}<strong>${esc(t.name)}</strong></div>`;
  const center = isLive ? `${next.home.score ?? 0} - ${next.away.score ?? 0}` : 'vs';
  card.innerHTML = `
    <p class="next-label">${isLive ? '<span class="live-pill">En vivo</span>' : 'Próximo partido'}</p>
    <div class="next-teams">${side(next.home)}<span class="next-vs">${center}</span>${side(next.away)}</div>
    <ul class="next-meta">
      <li>${fmt.long.format(d)}${next.timeValid ? ` · ${fmt.time.format(d)} h` : ' · hora a confirmar'}</li>
      <li>${esc(next.comp)}${next.round ? ` · ${esc(next.round)}` : ''}</li>
      ${next.venue ? `<li>${esc(next.venue)}</li>` : ''}
    </ul>
    ${isLive ? '' : '<div class="countdown" data-countdown></div>'}`;
  if (isLive) return;
  const box = card.querySelector('[data-countdown]');
  const tick = () => {
    const diff = Math.max(0, d - Date.now());
    const parts = [
      [Math.floor(diff / 864e5), 'días'],
      [Math.floor(diff / 36e5) % 24, 'horas'],
      [Math.floor(diff / 6e4) % 60, 'min'],
      [Math.floor(diff / 1e3) % 60, 'seg'],
    ];
    box.innerHTML = parts.map(([n, l]) => `<div><b>${String(n).padStart(2, '0')}</b><span>${l}</span></div>`).join('');
  };
  tick();
  countdownTimer = setInterval(tick, 1000);
}

// ---------- Tablas ----------
// Tablas de ESPN (zonas del torneo en curso + anual calculada) en un formato genérico de columnas.

const isVelezRow = (r) => r.id === VELEZ_ID;

function espnToTables(standings) {
  const cols = [
    { key: 'pts', title: 'PTS', bold: true }, { key: 'pj', title: 'J' }, { key: 'goles', title: 'Gol' },
    { key: 'dg', title: '+/-' }, { key: 'g', title: 'G' }, { key: 'e', title: 'E' }, { key: 'p', title: 'P' },
  ];
  const toRow = (r) => ({ pos: r.rank, id: r.id, name: r.name, logo: r.logo, values: { ...r, goles: `${r.gf}:${r.gc}` } });
  const phase = (standings.phase ?? '').replace('Torneo ', '');
  const tables = standings.groups
    .filter((g) => g.rows.length)
    .map((g) => ({ phase, name: `${g.name}${phase ? ` · ${phase}` : ''}`, columns: cols, rows: g.rows.map(toRow) }));
  if (standings.annual?.rows.length) {
    tables.push({ phase: null, name: 'Tabla anual', columns: cols, rows: standings.annual.rows.map(toRow), note: 'Suma de las fases regulares (Apertura + Clausura); desempate por diferencia de gol y goles a favor' });
  }
  return tables;
}

let selectedTable = null;
function renderTables(tables, source) {
  if (!tables.length) {
    $('[data-standings]').innerHTML = '<p class="empty">La tabla no está disponible ahora.</p>';
    return;
  }
  // Por defecto, la zona de Vélez del torneo en curso (la primera que lo contiene).
  selectedTable = tables.some((t) => t.name === selectedTable) ? selectedTable : tables.find((t) => t.rows.some(isVelezRow))?.name ?? tables[0].name;
  const table = tables.find((t) => t.name === selectedTable);
  $('[data-standings-title]').textContent = `${table.note ? `${table.note} · ` : ''}Fuente: ${source}`;
  const tabs = $('[data-standings-tabs]');
  tabs.innerHTML = tables
    .map((t) => `<button class="tab" role="tab" aria-selected="${t.name === table.name}" data-table="${esc(t.name)}">${esc(t.name)}${t.phase && t.rows.some(isVelezRow) ? ' · V' : ''}</button>`)
    .join('');
  tabs.onclick = (ev) => {
    const btn = ev.target.closest('[data-table]');
    if (!btn) return;
    selectedTable = btn.dataset.table;
    renderTables(tables, source);
  };
  const cell = (c, v) => {
    if (c.key === 'dg' || c.key === 'Ratio') return `${Number(v) > 0 ? '+' : ''}${v ?? ''}`;
    return esc(v ?? '');
  };
  $('[data-standings]').innerHTML = `<table>
    <thead><tr><th>#</th><th class="team">Equipo</th>${table.columns.map((c) => `<th>${esc(c.title)}</th>`).join('')}</tr></thead>
    <tbody>${table.rows
      .map((r) => `<tr class="${isVelezRow(r) ? 'is-velez' : ''}">
        <td class="pos">${r.pos}</td><td class="team"><span>${logo(r.logo, 22)}${esc(r.name)}</span></td>
        ${table.columns.map((c) => `<td class="${c.bold ? 'pts' : ''}">${cell(c, r.values[c.key])}</td>`).join('')}
      </tr>`)
      .join('')}</tbody></table>`;
}

function renderCups(fixture, results) {
  const season = new Date().getFullYear();
  const all = [...results, ...fixture.filter((m) => !m.completed)].filter((m) => new Date(m.date).getFullYear() >= season - 1);
  const byComp = new Map();
  for (const m of all) {
    if (m.compSlug === 'arg.1' || m.comp === 'Liga Profesional' || m.comp === 'Amistoso') continue;
    if (new Date(m.date).getFullYear() !== season && m.completed) continue;
    byComp.set(m.comp, [...(byComp.get(m.comp) ?? []), m]);
  }
  $('[data-cups]').innerHTML = [...byComp]
    .map(([comp, ms]) => `<div><h3 class="col-title">${esc(comp)} ${season}</h3><ol class="match-list">${ms.map((m) => matchItem(m)).join('')}</ol></div>`)
    .join('');
}

// ---------- Historial ----------

const compFilters = {
  todas: () => true,
  liga: (m) => !COPAS.has(m.comp) && !INTERNACIONAL.has(m.comp),
  copas: (m) => COPAS.has(m.comp),
  internacional: (m) => INTERNACIONAL.has(m.comp),
};

const eraFilters = {
  todas: () => true,
  espn: (m) => Boolean(m.date),
  historico: (m) => !m.date,
};

function setupH2H(matches) {
  const rivalSel = $('[data-h2h-rival]');
  const compSel = $('[data-h2h-comp]');
  const eraSel = $('[data-h2h-era]');
  const historic = matches.filter((m) => !m.date).length;
  $('[data-h2h-note]').textContent = historic
    ? `${matches.length} partidos oficiales: Primera División 1931–2000 (dataset público) y todas las competiciones desde 2001 (ESPN).`
    : `${matches.length} partidos oficiales registrados por ESPN desde 2001.`;

  const allRivals = headToHead(matches);
  rivalSel.innerHTML = [...allRivals]
    .sort((a, b) => a.name.localeCompare(b.name, 'es'))
    .map((r) => `<option value="${esc(r.id)}">${esc(r.name)} (${r.pj})</option>`)
    .join('');
  const params = new URLSearchParams(location.hash.split('?')[1]);
  rivalSel.value = params.get('rival') ?? allRivals.find((r) => r.name === 'River Plate')?.id ?? allRivals[0]?.id;

  const render = () => {
    const rows = headToHead(matches.filter((m) => compFilters[compSel.value](m) && eraFilters[eraSel.value](m)));
    const r = rows.find((x) => x.id === rivalSel.value);
    const box = $('[data-h2h]');
    if (!r) {
      box.innerHTML = '<p class="empty">No hay partidos contra este rival con esos filtros.</p>';
    } else {
      const pct = (n) => ((n / r.pj) * 100).toFixed(1);
      box.innerHTML = `
        <article class="h2h-card">
          <header>${logo(r.logo, 52)}<h3>Vélez vs ${esc(r.name)}</h3></header>
          <div class="h2h-stats">
            <div style="background:var(--gana)"><b>${r.g}</b><span>Ganados</span></div>
            <div style="background:var(--empata)"><b>${r.e}</b><span>Empates</span></div>
            <div style="background:var(--pierde)"><b>${r.p}</b><span>Perdidos</span></div>
          </div>
          <div class="bar" role="img" aria-label="${pct(r.g)}% ganados, ${pct(r.e)}% empatados, ${pct(r.p)}% perdidos">
            <i style="width:${pct(r.g)}%;background:var(--gana)"></i><i style="width:${pct(r.e)}%;background:var(--empata)"></i><i style="width:${pct(r.p)}%;background:var(--pierde)"></i>
          </div>
          <div class="h2h-foot"><span>${r.pj} partidos</span><span>Goles ${r.gf} - ${r.gc}</span></div>
        </article>
        <div><h3 class="col-title">Últimos cruces</h3><ol class="match-list">${r.matches.slice(0, 8).map((m) => matchItem(m, { showYear: true })).join('')}</ol></div>`;
    }
    $('[data-h2h-top]').innerHTML = `<table>
      <thead><tr><th class="team">Rival</th><th>PJ</th><th>G</th><th>E</th><th>P</th><th>GF</th><th>GC</th><th>% G</th></tr></thead>
      <tbody>${rows
        .slice(0, 12)
        .map((x) => `<tr data-rival="${esc(x.id)}" style="cursor:pointer"><td class="team"><span>${logo(x.logo, 22)}${esc(x.name)}</span></td><td>${x.pj}</td><td>${x.g}</td><td>${x.e}</td><td>${x.p}</td><td>${x.gf}</td><td>${x.gc}</td><td>${Math.round((x.g / x.pj) * 100)}%</td></tr>`)
        .join('')}</tbody></table>`;
  };
  rivalSel.onchange = render;
  compSel.onchange = render;
  eraSel.onchange = render;
  $('[data-h2h-top]').onclick = (ev) => {
    const tr = ev.target.closest('[data-rival]');
    if (!tr) return;
    rivalSel.value = tr.dataset.rival;
    render();
    rivalSel.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
  render();
}

// ---------- Plantel y estadísticas ----------
// Todo de ESPN: plantel (roster), estadísticas (players.json) y suspensiones estimadas por tarjetas.
// No se muestran lesionados ni DT: ESPN no informa lesiones del fútbol argentino y su DT está desactualizado.

const POS_ORDER = ['G', 'D', 'M', 'F'];
const POS_GROUP = { G: 'Arqueros', D: 'Defensores', M: 'Mediocampistas', F: 'Delanteros' };

function renderSquad(roster, players) {
  const current = players?.tournaments?.[0];
  const statsById = new Map((current?.players ?? []).map((p) => [p.id, p]));
  const sanctions = players?.discipline ?? [];
  const suspended = sanctions.filter((d) => d.kind !== 'limite');
  const limit = sanctions.filter((d) => d.kind === 'limite');

  const alert = (title, cls, items) =>
    `<article class="alert ${cls}"><h4>${title} <b>${items.length}</b></h4>${items.length ? `<ul>${items.join('')}</ul>` : '<p>Ninguno.</p>'}</article>`;
  const item = (d) => `<li><strong>${esc(d.name)}</strong> · ${esc(d.text)} (${esc(d.tournament)})</li>`;
  $('[data-alerts]').innerHTML =
    alert('Suspendidos próximo partido', 'alert-red', suspended.map(item)) +
    alert('Al límite de amarillas', 'alert-yellow', limit.map(item)) +
    '<p class="fine parte-note">Estimación con las tarjetas de cada partido (5 amarillas en un mismo torneo = 1 fecha; roja en el último partido). La sanción oficial la define el Tribunal de Disciplina.</p>';

  const chips = (id) => {
    const s = sanctions.find((d) => d.id === id);
    if (!s) return '';
    return s.kind === 'limite'
      ? `<span class="chip chip-yellow" title="${esc(s.text)}">${s.yellows} am.</span>`
      : '<span class="chip chip-red" title="Suspendido">Susp.</span>';
  };
  const card = (p) => {
    const st = statsById.get(p.id);
    return `<article class="player">
      <div class="player-num">${esc(p.jersey ?? '–')}</div>
      <div class="player-main">
        <h4>${esc(p.name)}</h4>
        <p>${p.flag ? `<img src="${esc(p.flag)}" alt="" width="16" height="16" loading="lazy" onerror="this.remove()">` : ''}${esc(p.nat ?? '')}${p.age ? ` · ${p.age} años` : ''}</p>
        ${chips(p.id)}
      </div>
      <dl class="player-stats" title="${esc(current?.label ?? '')}"><div><dt>PJ</dt><dd>${st?.pj ?? 0}</dd></div><div><dt>G</dt><dd>${st?.g ?? 0}</dd></div><div><dt>A</dt><dd>${st?.a ?? 0}</dd></div></dl>
    </article>`;
  };
  const byPos = new Map();
  for (const p of roster.players) byPos.set(p.pos, [...(byPos.get(p.pos) ?? []), p]);
  const order = [...POS_ORDER, ...[...byPos.keys()].filter((k) => !POS_ORDER.includes(k))];
  $('[data-squad]').innerHTML =
    (current ? `<p class="fine">PJ, goles y asistencias del ${esc(current.label)}.</p>` : '') +
    order
      .filter((pos) => byPos.get(pos)?.length)
      .map((pos) => {
        const list = byPos.get(pos).sort((a, b) => Number(a.jersey ?? 99) - Number(b.jersey ?? 99));
        return `<div class="squad-group"><h3>${esc(POS_GROUP[pos] ?? 'Otros')}</h3><div class="squad-grid">${list.map(card).join('')}</div></div>`;
      })
      .join('');
}

const STAT_COLS = [
  ['pj', 'PJ', 'Partidos jugados'], ['tit', 'Tit', 'Titular'], ['g', 'G', 'Goles'], ['a', 'A', 'Asistencias'],
  ['rem', 'Rem', 'Remates'], ['arco', 'Arco', 'Remates al arco'], ['am', 'Am', 'Amarillas'], ['r', 'R', 'Rojas'],
  ['fc', 'FC', 'Faltas cometidas'], ['ataj', 'Ataj', 'Atajadas (arqueros)'], ['gc', 'GR', 'Goles recibidos (arqueros)'],
];
const statsState = { key: null, sort: 'g' };

function renderStats(players) {
  const tournaments = players?.tournaments ?? [];
  if (!tournaments.length) {
    $('[data-stats]').innerHTML = '<p class="empty">Todavía no hay estadísticas de jugadores para este año.</p>';
    return;
  }
  statsState.key ??= tournaments[0].key;
  const t = tournaments.find((x) => x.key === statsState.key) ?? tournaments[0];
  const tabs = $('[data-stats-tabs]');
  tabs.innerHTML = tournaments
    .map((x) => `<button class="tab" role="tab" aria-selected="${x.key === t.key}" data-key="${esc(x.key)}">${esc(x.label)}</button>`)
    .join('');
  tabs.onclick = (ev) => {
    const b = ev.target.closest('[data-key]');
    if (!b) return;
    statsState.key = b.dataset.key;
    renderStats(players);
  };

  const leader = (label, k, unit) => {
    const p = [...t.players].sort((a, b) => b[k] - a[k] || a.pj - b.pj)[0];
    return p && p[k] > 0 ? `<div class="leader"><span>${label}</span><strong>${esc(p.name)}</strong><b>${p[k]}</b><small>${unit}</small></div>` : '';
  };
  // Las columnas de arquero/tarjetas aparecen solo si alguien tiene datos.
  $('[data-leaders]').innerHTML = leader('Goleador', 'g', 'goles') + leader('Asistidor', 'a', 'asistencias') + leader('Más partidos', 'pj', 'PJ') + leader('Más amarillas', 'am', 'amarillas');
  const cols = STAT_COLS.filter(([k]) => ['pj', 'g', 'a'].includes(k) || t.players.some((p) => p[k] > 0));
  const sorted = [...t.players].sort((a, b) => (b[statsState.sort] ?? 0) - (a[statsState.sort] ?? 0) || b.pj - a.pj);
  $('[data-stats]').innerHTML = `<table class="stats-table">
    <thead><tr><th class="team">Jugador</th>${cols.map(([k, l, title]) => `<th><button data-sort="${k}" title="${title}" aria-pressed="${k === statsState.sort}">${l}</button></th>`).join('')}</tr></thead>
    <tbody>${sorted.map((p) => `<tr><td class="team">${esc(p.name)}</td>${cols.map(([k]) => `<td class="${k === statsState.sort ? 'is-sorted' : ''}">${p[k] ?? 0}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  $('[data-stats]').onclick = (ev) => {
    const b = ev.target.closest('[data-sort]');
    if (!b) return;
    statsState.sort = b.dataset.sort;
    renderStats(players);
  };
  $('[data-stats-note]').textContent = `${t.matches} partidos de ${t.label}. Datos de ESPN, actualizados el ${fmt.stamp.format(new Date(players.updatedAt))}. Tocá una columna para ordenar. Sanciones: estimadas por tarjetas (5 amarillas por torneo = 1 fecha); la oficial la define el Tribunal de Disciplina.`;
}

function renderRecords(rec) {
  if (!rec) return;
  const barList = (rows, val, unit) => {
    const max = rows[0][val];
    return `<ol class="rank">${rows
      .map((r, i) => `<li><span class="rank-n">${i + 1}</span><div class="rank-main"><strong>${esc(r.nombre)}</strong><small>${esc(r.periodo)}</small><i style="width:${(r[val] / max) * 100}%"></i></div><b>${r[val]}</b><small class="rank-unit">${unit}</small></li>`)
      .join('')}</ol>`;
  };
  $('[data-records]').innerHTML = `
    <article class="record-card"><h3>Máximos goleadores</h3>${barList(rec.goleadores, 'goles', 'goles')}</article>
    <article class="record-card"><h3>Más partidos</h3>${barList(rec.presencias, 'partidos', 'PJ')}</article>
    <article class="record-card"><h3>Más títulos ganados</h3>${rec.titulos
      .map((g) => `<div class="titles-row"><b>${g.titulos}</b><p>${g.jugadores.map(esc).join(' · ')}</p></div>`)
      .join('')}<p class="fine">${esc(rec.tecnicos)}</p></article>
    <article class="record-card"><h3>Goleadores de torneo</h3><ul class="scorers">${rec.goleadoresTorneo
      .map((g) => `<li><strong>${esc(g.nombre)}</strong><span>${esc(g.torneo)}</span><b>${g.goles}</b></li>`)
      .join('')}</ul></article>
    <p class="fine records-source">${esc(rec.fuente)}</p>`;
}

// ---------- Noticias ----------
// Arriba de todo, estilo Google Noticias: tarjetas con foto que llevan a la nota oficial (velez.com.ar).
// Chips con datos fijos (último resultado y próximo partido): ESPN en vivo, sin IA.
// Resumen de la semana: IA (Qwen), generado los lunes por news-weekly.yml, desplegable debajo de las tarjetas.

const SUMMARY_MAX_AGE_DAYS = 10; // si el workflow semanal falló, no mostrar un resumen viejo como si fuera de esta semana
const MAX_CARDS = 9;
const FEATURED_SECTIONS = ['futbol', 'columnadt', 'socios', 'club']; // la nota destacada sale de acá si hay
const SECTION_NAMES = {
  futbol: 'Fútbol', columnadt: 'Palabra del DT', socios: 'Socios', club: 'Club', reserva: 'Reserva', amateur: 'Juveniles',
  senior: 'Senior', entrenamiento: 'Entrenamiento', acreditaciones: 'Prensa', rrpp: 'Eventos', 'velez-social': 'Vélez Social',
  vmasculino: 'Vóley', vfemenino: 'Vóley', bmasculino: 'Básquet', bfemenino: 'Básquet', futbolfemenino: 'Fútbol femenino',
};
const sectionName = (s) => SECTION_NAMES[s] ?? s.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());
const shortDate = (iso) => iso.slice(5).split('-').reverse().join('/'); // «2026-10-13» → «13/10»

let newsData = { news: null, summary: null };

function newsCard(h, featured) {
  const img = isOfficialImageUrl(h.image) ? `<img class="nw-img" src="${esc(h.image)}" alt="" loading="${featured ? 'eager' : 'lazy'}" onerror="this.remove()">` : '';
  return `<a class="nw-card${featured ? ' nw-featured' : ''}" href="${esc(h.url)}" target="_blank" rel="noopener">
    ${featured ? img : ''}
    <div class="nw-body">
      <p class="nw-source"><img src="assets/v.svg" alt="" width="16" height="16">Vélez Sarsfield · ${esc(sectionName(h.section))}</p>
      <h3 class="nw-title">${esc(h.title)}</h3>
      ${featured && h.lead ? `<p class="nw-lead">${esc(h.lead)}</p>` : ''}
      <p class="nw-time">${esc(relativeDay(h.date))}</p>
    </div>
    ${featured ? '' : img}
  </a>`;
}

function renderNews(fixture, results) {
  const { news, summary } = newsData;
  $('[data-facts]').innerHTML = matchFacts(fixture, results)
    .map((f) => `<li class="fact fact-${f.tipo}"><span class="fact-tag">${f.tipo === 'resultado' ? 'Resultado' : 'Próximo'}</span>${esc(f.texto.replace(/^(Último resultado|Próximo partido): /, ''))}</li>`)
    .join('');

  const headlines = (news?.headlines ?? []).filter((h) => isOfficialNoteUrl(h.url));
  const featured = headlines.find((h) => FEATURED_SECTIONS.includes(h.section) && isOfficialImageUrl(h.image)) ?? headlines[0];
  const rest = headlines.filter((h) => h !== featured).slice(0, MAX_CARDS - 1);
  $('[data-headlines]').innerHTML = featured
    ? [newsCard(featured, true), ...rest.map((h) => newsCard(h, false))].join('')
    : '<p class="empty">No pudimos leer las notas del club. Mirá las novedades en <a href="https://velez.com.ar" target="_blank" rel="noopener">velez.com.ar</a>.</p>';

  const ageDays = summary ? (Date.now() - Date.parse(summary.generatedAt)) / 864e5 : Infinity;
  const points = (summary?.points ?? []).filter((p) => isOfficialNoteUrl(p.url));
  const box = $('[data-summary]');
  box.hidden = !(ageDays <= SUMMARY_MAX_AGE_DAYS && points.length);
  if (!box.hidden && !box.dataset.ready) {
    box.dataset.ready = '1'; // no re-renderizar en cada refresco: cerraría el desplegable si el usuario lo abrió
    box.innerHTML = `
      <summary><span class="ai-badge">IA</span> Resumen de la semana <span class="fine">del ${esc(shortDate(summary.period.from))} al ${esc(shortDate(summary.period.to))}</span></summary>
      <ul class="summary-points">${points
        .map((p) => `<li><p>${esc(p.texto)}</p><a href="${esc(p.url)}" target="_blank" rel="noopener">Ver la nota →</a></li>`)
        .join('')}</ul>
      <p class="ai-note"><strong>Generado automáticamente por IA (${esc(summary.model)})</strong> a partir de las notas oficiales.
        Puede contener errores u omisiones: verificá cada punto en su nota. Actualizado el ${esc(fmt.stamp.format(new Date(summary.generatedAt)))}.</p>`;
  }
}

// ---------- Contenido del club ----------

function renderClub(club) {
  $('[data-frase]').textContent = club.frase;
  $('[data-fortin]').textContent = club.fortin;
  $('[data-timeline]').innerHTML = club.historia
    .map((h) => `<li><div class="t-year">${esc(h.anio)}</div><div class="t-body"><h3>${esc(h.titulo)}</h3><p>${esc(h.texto)}</p></div></li>`)
    .join('');

  renderRecords(club.records);
  const e = club.estadio;
  $('[data-stadium-apodo]').textContent = e.apodo;
  $('[data-stadium-intro]').textContent = e.intro;
  $('[data-stadium-stats]').innerHTML = e.datos.map((d) => `<div><dt>${esc(d.etiqueta)}</dt><dd>${esc(d.valor)}</dd></div>`).join('');
  $('[data-stadium-hitos]').innerHTML = e.hitos.map((h) => `<li><b>${esc(h.fecha)}</b><span>${esc(h.texto)}</span></li>`).join('');

  $('[data-quotes]').innerHTML = club.frases
    .map((f) => `<figure class="quote"><p>${esc(f.texto)}</p><figcaption>${esc(f.contexto)}</figcaption></figure>`)
    .join('');

  $('[data-moments]').innerHTML = club.momentos
    .map((m) => `<article class="moment">${m.marcador ? `<div class="moment-score">${esc(m.marcador)}</div>` : ''}<h3>${esc(m.titulo)}</h3><div class="moment-meta">${esc(m.fecha)} · ${esc(m.lugar)}</div><p>${esc(m.texto)}</p></article>`)
    .join('');

  const cats = Object.entries(club.palmares);
  const total = cats.reduce((n, [, list]) => n + list.length, 0);
  $('[data-palmares-total]').textContent = `${total} títulos oficiales`;
  $('[data-palmares]').innerHTML = cats
    .map(([cat, list]) => `<div class="trophy-col"><h3>${esc(cat)} <b>${list.length}</b></h3><ul>${list.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>`)
    .join('');
  $('[data-idols]').innerHTML = club.idolos
    .map((i) => `<article class="idol"><h4>${esc(i.nombre)}</h4><small>${esc(i.rol)}</small><p>${esc(i.texto)}</p></article>`)
    .join('');
}

// ---------- Arranque ----------

function mergeResults(history, recent) {
  const byId = new Map(history.map((m) => [m.id, m]));
  for (const m of recent) byId.set(m.id, m);
  return [...byId.values()].filter((m) => m.completed && m.comp !== 'Amistoso').sort((a, b) => new Date(a.date) - new Date(b.date));
}

// historico.json viene en formato compacto (ver scripts/import-historico.mjs).
function hydrateHistoric(m) {
  const withLogo = (t) => ({ ...t, logo: /^\d+$/.test(t.id) ? teamLogo(t.id) : null });
  return { ...m, date: null, comp: 'Primera División', status: 'post', completed: true, home: withLogo(m.home), away: withLogo(m.away) };
}

async function loadLive() {
  try {
    return { data: await withTimeout(fetchLive(), LIVE_TIMEOUT_MS), live: true };
  } catch (err) {
    console.warn('ESPN no respondió, uso el snapshot:', err);
    return { data: await getJson('data/generated/snapshot.json'), live: false };
  }
}

let history = [];
async function refresh() {
  const { data, live } = await loadLive();
  const results = mergeResults(history, data.results);
  renderNext(data.fixture);
  renderLists(data.fixture, results);
  renderTables(espnToTables(data.standings), 'ESPN');
  renderCups(data.fixture, results);
  renderNews(data.fixture, results);
  const badge = $('[data-badge]');
  badge.classList.toggle('is-stale', !live);
  badge.textContent = live ? `En vivo desde ESPN · ${fmt.stamp.format(new Date())}` : `Datos guardados del ${fmt.stamp.format(new Date(data.updatedAt))}`;
  const anyLive = data.fixture.some((m) => m.status === 'in');
  setTimeout(refresh, anyLive ? REFRESH_LIVE_MS : REFRESH_MS);
  return results;
}

async function loadSquad() {
  const players = await getJson('data/generated/players.json').catch(() => null);
  const roster = await withTimeout(fetchRoster(), LIVE_TIMEOUT_MS).catch(async () => (await getJson('data/generated/snapshot.json').catch(() => ({}))).roster);
  if (roster?.players?.length) renderSquad(roster, players);
  else $('[data-squad]').innerHTML = '<p class="empty">El plantel no está disponible ahora.</p>';
  renderStats(players);
}

async function main() {
  const [club, hist, old, news, summary] = await Promise.all([
    getJson('data/club.json'),
    getJson('data/generated/matches.json').catch(() => ({ matches: [] })),
    getJson('data/historico.json').catch(() => ({ matches: [] })),
    getJson('data/generated/news.json').catch(() => null),
    getJson('data/generated/resumen.json').catch(() => null),
  ]);
  newsData = { news, summary };
  renderClub(club);
  history = hist.matches;
  const results = await refresh().catch((err) => {
    console.error(err);
    $('[data-next]').innerHTML = '<p class="next-label">Próximo partido</p><p class="skeleton">No pudimos cargar los partidos. Probá en un rato.</p>';
    return history;
  });
  setupH2H([...old.matches.map(hydrateHistoric), ...results]);
  await loadSquad().catch((err) => console.error(err));
  // El salto inicial al #ancla ocurre con la página vacía: lo repetimos cuando ya está todo armado
  // (instantáneo: un scroll suave se corta si el contenido de arriba sigue creciendo).
  const id = location.hash.slice(1).split('?')[0];
  const target = id ? document.getElementById(id) : null;
  target?.scrollIntoView({ behavior: 'instant', block: 'start' });
}

main();

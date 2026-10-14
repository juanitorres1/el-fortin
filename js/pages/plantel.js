// Plantel: sanciones estimadas, plantel por puesto y estadísticas por torneo. Todo de ESPN.
// No se muestran lesionados ni DT: ESPN no informa lesiones del fútbol argentino y su DT está desactualizado.
import { fetchRoster } from '../espn.js';
import { $, LIVE_TIMEOUT_MS, esc, fmt, getJson, scrollToHash, sized, withTimeout } from '../core.js';

const POS_ORDER = ['G', 'D', 'M', 'F'];
const POS_GROUP = { G: 'Arqueros', D: 'Defensores', M: 'Mediocampistas', F: 'Delanteros' };

function renderSquad(roster, players) {
  const current = players?.tournaments?.[0];
  const statsById = new Map((current?.players ?? []).map((p) => [p.id, p]));
  const sanctions = players?.discipline ?? [];
  const suspended = sanctions.filter((d) => d.kind !== 'limite');
  const limit = sanctions.filter((d) => d.kind === 'limite');

  const alert = (title, cls, items) =>
    `<article class="alert ${cls}"><h3 class="alert-title">${title}<b class="num">${items.length}</b></h3>${items.length ? `<ul>${items.join('')}</ul>` : '<p class="muted">Ninguno.</p>'}</article>`;
  const item = (d) => `<li><strong>${esc(d.name)}</strong> · ${esc(d.text)} (${esc(d.tournament)})</li>`;
  $('[data-alerts]').innerHTML =
    alert('Suspendidos próximo partido', 'alert-red', suspended.map(item)) + alert('Al límite de amarillas', 'alert-yellow', limit.map(item));

  const chip = (id) => {
    const s = sanctions.find((d) => d.id === id);
    if (!s) return '';
    return s.kind === 'limite' ? `<span class="chip chip-yellow">${s.yellows} amarillas</span>` : '<span class="chip chip-red">Suspendido</span>';
  };
  const card = (p) => {
    const st = statsById.get(p.id);
    return `<article class="player">
      <div class="player-num num" aria-label="Número ${esc(p.jersey ?? '')}">${esc(p.jersey ?? '–')}</div>
      <div class="player-main">
        <h4 class="player-name">${esc(p.name)}</h4>
        <p class="muted">${p.flag ? `<img src="${esc(sized(p.flag, 16))}" alt="" width="16" height="16" loading="lazy" decoding="async" onerror="this.remove()">` : ''}${esc(p.nat ?? '')}${p.age ? ` · ${p.age} años` : ''}</p>
        ${chip(p.id)}
      </div>
      <dl class="player-stats" aria-label="${esc(current?.label ?? 'Torneo actual')}">
        <div><dt>PJ</dt><dd class="num">${st?.pj ?? 0}</dd></div><div><dt>Goles</dt><dd class="num">${st?.g ?? 0}</dd></div><div><dt>Asist.</dt><dd class="num">${st?.a ?? 0}</dd></div>
      </dl>
    </article>`;
  };
  const byPos = new Map();
  for (const p of roster.players) byPos.set(p.pos, [...(byPos.get(p.pos) ?? []), p]);
  const order = [...POS_ORDER, ...[...byPos.keys()].filter((k) => !POS_ORDER.includes(k))];
  $('[data-squad-note]').textContent = current ? `Partidos, goles y asistencias del ${current.label}.` : '';
  $('[data-squad]').innerHTML = order
    .filter((pos) => byPos.get(pos)?.length)
    .map((pos) => {
      const list = byPos.get(pos).sort((a, b) => Number(a.jersey ?? 99) - Number(b.jersey ?? 99));
      return `<section class="squad-group"><h3 class="h3">${esc(POS_GROUP[pos] ?? 'Otros')}</h3><div class="squad-grid">${list.map(card).join('')}</div></section>`;
    })
    .join('');
}

const STAT_COLS = [
  ['pj', 'PJ', 'Partidos jugados'], ['tit', 'Tit', 'Titular'], ['g', 'Goles', 'Goles'], ['a', 'Asist', 'Asistencias'],
  ['rem', 'Rem', 'Remates'], ['arco', 'Arco', 'Remates al arco'], ['am', 'Amar', 'Amarillas'], ['r', 'Rojas', 'Rojas'],
  ['fc', 'Faltas', 'Faltas cometidas'], ['ataj', 'Ataj', 'Atajadas (arqueros)'], ['gc', 'GR', 'Goles recibidos (arqueros)'],
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
    .map((x) => `<button class="seg" type="button" aria-pressed="${x.key === t.key}" data-key="${esc(x.key)}">${esc(x.label)}</button>`)
    .join('');
  tabs.onclick = (ev) => {
    const b = ev.target.closest('[data-key]');
    if (!b) return;
    statsState.key = b.dataset.key;
    renderStats(players);
  };

  const leader = (label, k, unit) => {
    const p = [...t.players].sort((a, b) => b[k] - a[k] || a.pj - b.pj)[0];
    return p && p[k] > 0 ? `<div class="leader"><span class="leader-label">${label}</span><strong>${esc(p.name)}</strong><b class="num">${p[k]}</b><small>${unit}</small></div>` : '';
  };
  $('[data-leaders]').innerHTML = leader('Goleador', 'g', 'goles') + leader('Asistidor', 'a', 'asistencias') + leader('Más partidos', 'pj', 'partidos') + leader('Más amarillas', 'am', 'amarillas');
  // Las columnas de arquero y tarjetas aparecen solo si alguien tiene datos.
  const cols = STAT_COLS.filter(([k]) => ['pj', 'g', 'a'].includes(k) || t.players.some((p) => p[k] > 0));
  const sorted = [...t.players].sort((a, b) => (b[statsState.sort] ?? 0) - (a[statsState.sort] ?? 0) || b.pj - a.pj);
  $('[data-stats]').innerHTML = `<table class="stats-table">
    <caption class="sr-only">Estadísticas del ${esc(t.label)}, ordenadas por ${esc(STAT_COLS.find(([k]) => k === statsState.sort)[2])}</caption>
    <thead><tr><th scope="col" class="team">Jugador</th>${cols
      .map(([k, l, title]) => `<th scope="col" aria-sort="${k === statsState.sort ? 'descending' : 'none'}"><button type="button" data-sort="${k}" title="Ordenar por ${title}">${l}</button></th>`)
      .join('')}</tr></thead>
    <tbody>${sorted.map((p) => `<tr><td class="team">${esc(p.name)}</td>${cols.map(([k]) => `<td${k === statsState.sort ? ' class="is-sorted"' : ''}>${p[k] ?? 0}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  $('[data-stats]').onclick = (ev) => {
    const b = ev.target.closest('[data-sort]');
    if (!b) return;
    statsState.sort = b.dataset.sort;
    renderStats(players);
    $(`[data-sort="${statsState.sort}"]`)?.focus();
  };
  $('[data-stats-note]').textContent = `${t.matches} partidos del ${t.label}. Datos de ESPN, actualizados el ${fmt.stamp.format(new Date(players.updatedAt))}. Tocá una columna para ordenar.`;
}

const players = await getJson('data/generated/players.json').catch(() => null);
const roster = await withTimeout(fetchRoster(), LIVE_TIMEOUT_MS).catch(async () => (await getJson('data/generated/snapshot.json').catch(() => ({}))).roster);
if (roster?.players?.length) renderSquad(roster, players);
else $('[data-squad]').innerHTML = '<p class="empty">El plantel no está disponible ahora.</p>';
renderStats(players);
scrollToHash();

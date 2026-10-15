// Historial contra cada rival: Primera División 1931–2000 (dataset público) + todas las competiciones desde 2001 (ESPN).
import { headToHead, teamLogo } from '../espn.js';
import { rivalDetail, rivalFacts } from '../facts.js';
import { $, esc, getJson, logo, matchItem, mergeResults } from '../core.js';

const COPAS = new Set(['Copa Argentina', 'Supercopa Argentina', 'Supercopa Internacional', 'Trofeo de Campeones']);
const INTERNACIONAL = new Set(['Copa Libertadores', 'Copa Sudamericana', 'Recopa Sudamericana']);
const compFilters = {
  todas: () => true,
  liga: (m) => !COPAS.has(m.comp) && !INTERNACIONAL.has(m.comp),
  copas: (m) => COPAS.has(m.comp),
  internacional: (m) => INTERNACIONAL.has(m.comp),
};
const eraFilters = { todas: () => true, espn: (m) => Boolean(m.date), historico: (m) => !m.date };

// historico.json viene en formato compacto (ver scripts/import-historico.mjs).
function hydrateHistoric(m) {
  const withLogo = (t) => ({ ...t, logo: /^\d+$/.test(t.id) ? teamLogo(t.id) : null });
  return { ...m, date: null, comp: 'Primera División', status: 'post', completed: true, home: withLogo(m.home), away: withLogo(m.away) };
}

const WHERE = { local: 'de local', visitante: 'de visitante', neutral: 'en cancha neutral' };

// Datos del cruce: de local y visitante, racha, mayor goleada, peor derrota y últimos triunfos.
function detailHtml(row, filtered) {
  const d = rivalDetail(row.matches);
  const streak = rivalFacts(filtered, row.id)?.streak;
  const rec = (x) => `${x.g} G · ${x.e} E · ${x.p} P`;
  const m = (x) => (x ? `<b class="num">${esc(x.score)}</b> en ${esc(x.year)}<small> · ${esc(x.comp)}, ${WHERE[x.where]}</small>` : '<span class="muted">No hay</span>');
  const items = [
    ['De local', rec(d.home)],
    ['De visitante', rec(d.away)],
    d.neutral.g + d.neutral.e + d.neutral.p > 0 && ['En cancha neutral', rec(d.neutral)],
    streak && ['Racha', esc(streak)],
    ['Mayor goleada', m(d.biggestWin)],
    ['Peor derrota', m(d.worstLoss)],
    ['Último triunfo de local', m(d.lastHomeWin)],
    ['Último triunfo de visitante', m(d.lastAwayWin)],
  ].filter(Boolean);
  return `<div class="card h2h-detail">
    <dl>${items.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
    <button type="button" class="btn btn-outline" data-share>Compartir este historial</button>
  </div>`;
}

function setup(matches) {
  const rivalSel = $('[data-h2h-rival]');
  const compSel = $('[data-h2h-comp]');
  const eraSel = $('[data-h2h-era]');
  const historic = matches.filter((m) => !m.date).length;
  $('[data-h2h-note]').textContent = historic
    ? `${matches.length.toLocaleString('es-AR')} partidos oficiales: Primera División 1931–2000 (dataset público) y todas las competiciones desde 2001 (ESPN).`
    : `${matches.length.toLocaleString('es-AR')} partidos oficiales registrados por ESPN desde 2001.`;

  const allRivals = headToHead(matches);
  rivalSel.innerHTML = [...allRivals]
    .sort((a, b) => a.name.localeCompare(b.name, 'es'))
    .map((r) => `<option value="${esc(r.id)}">${esc(r.name)} (${r.pj})</option>`)
    .join('');
  rivalSel.value = new URLSearchParams(location.search).get('rival') ?? allRivals.find((r) => r.name === 'River Plate')?.id ?? allRivals[0]?.id;

  const render = () => {
    const rows = headToHead(matches.filter((m) => compFilters[compSel.value](m) && eraFilters[eraSel.value](m)));
    const r = rows.find((x) => x.id === rivalSel.value);
    const box = $('[data-h2h]');
    if (!r) {
      box.innerHTML = '<p class="empty">No hay partidos contra este rival con esos filtros.</p>';
    } else {
      const pct = (n) => ((n / r.pj) * 100).toFixed(1);
      box.innerHTML = `
        <div class="h2h-side">
        <article class="h2h-card">
          <header class="h2h-head">${logo(r.logo, 48)}<h2 class="h2">Vélez vs. ${esc(r.name)}</h2></header>
          <dl class="h2h-stats">
            <div class="is-g"><dt>Ganados</dt><dd class="num">${r.g}</dd></div>
            <div class="is-e"><dt>Empates</dt><dd class="num">${r.e}</dd></div>
            <div class="is-p"><dt>Perdidos</dt><dd class="num">${r.p}</dd></div>
          </dl>
          <div class="bar" role="img" aria-label="${pct(r.g)}% ganados, ${pct(r.e)}% empatados, ${pct(r.p)}% perdidos">
            <i class="is-g" style="width:${pct(r.g)}%"></i><i class="is-e" style="width:${pct(r.e)}%"></i><i class="is-p" style="width:${pct(r.p)}%"></i>
          </div>
          <p class="h2h-foot"><span>${r.pj} partidos</span><span>Goles ${r.gf}-${r.gc}</span></p>
        </article>
        ${detailHtml(r, matches.filter((m) => compFilters[compSel.value](m) && eraFilters[eraSel.value](m)))}
        </div>
        <div><h3 class="h3">Últimos cruces</h3><ol class="match-list">${r.matches.slice(0, 8).map((m) => matchItem(m, { showYear: true })).join('')}</ol></div>`;
    }
    $('[data-h2h-top]').innerHTML = `<table>
      <caption class="sr-only">Rivales con más partidos</caption>
      <thead><tr><th scope="col" class="team">Rival</th><th scope="col">PJ</th><th scope="col">G</th><th scope="col">E</th><th scope="col">P</th><th scope="col">GF</th><th scope="col">GC</th><th scope="col">% G</th></tr></thead>
      <tbody>${rows
        .slice(0, 12)
        .map((x) => `<tr><td class="team">${logo(x.logo, 22)}<button type="button" class="link-btn" data-rival="${esc(x.id)}">${esc(x.name)}</button></td><td>${x.pj}</td><td>${x.g}</td><td>${x.e}</td><td>${x.p}</td><td>${x.gf}</td><td>${x.gc}</td><td>${Math.round((x.g / x.pj) * 100)}%</td></tr>`)
        .join('')}</tbody></table>`;
  };
  // La URL lleva el rival elegido: se puede compartir y abre directo en ese rival.
  const syncUrl = () => {
    const url = new URL(location.href);
    url.searchParams.set('rival', rivalSel.value);
    history.replaceState(null, '', url);
    const name = rivalSel.selectedOptions[0]?.textContent.replace(/ \(\d+\)$/, ''); // «Boca Juniors (183)» → «Boca Juniors»
    document.title = name ? `Vélez vs. ${name} · Historial · El Fortín` : 'Historial · El Fortín';
  };
  $('[data-h2h]').onclick = async (ev) => {
    if (!ev.target.closest('[data-share]')) return;
    const data = { title: document.title, url: location.href };
    try {
      if (navigator.share) await navigator.share(data);
      else {
        await navigator.clipboard.writeText(location.href);
        ev.target.closest('[data-share]').textContent = 'Link copiado';
      }
    } catch {
      /* el usuario canceló */
    }
  };
  rivalSel.onchange = () => {
    syncUrl();
    render();
  };
  compSel.onchange = render;
  eraSel.onchange = render;
  $('[data-h2h-top]').onclick = (ev) => {
    const b = ev.target.closest('[data-rival]');
    if (!b) return;
    rivalSel.value = b.dataset.rival;
    syncUrl();
    render();
    rivalSel.scrollIntoView({ block: 'center' });
    rivalSel.focus();
  };
  if (new URLSearchParams(location.search).has('rival')) syncUrl();
  render();
}

const [hist, old] = await Promise.all([
  getJson('data/generated/matches.json').catch(() => ({ matches: [] })),
  getJson('data/historico.json').catch(() => ({ matches: [] })),
]);
setup([...old.matches.map(hydrateHistoric), ...mergeResults(hist.matches, [])]);

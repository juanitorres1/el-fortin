// Inicio: «Juega Vélez» (próximo partido, último resultado, posición) y noticias del club estilo Google Noticias.
import { VELEZ_ID, fetchSummary, keyEvents, velezView } from '../espn.js';
import { isNewsImage, isOfficialNoteUrl, relativeDay } from '../news.js';
import { monthDay, streakLines } from '../facts.js';
import { fetchForecast, wantsForecast } from '../weather.js';
import { $, LIVE_TIMEOUT_MS, REFRESH_LIVE_MS, REFRESH_MS, RESULT_LABEL, capitalize, esc, fmt, getJson, loadLive, logo, mergeResults, updateLiveTitle, withTimeout } from '../core.js';

// Antes todo estaba en una sola página: los links viejos con #ancla llevan a la página nueva.
const LEGACY = {
  partidos: 'partidos.html', tablas: 'partidos.html#tablas', plantel: 'plantel.html', historial: 'historial.html',
  historia: 'club.html#historia', estadio: 'club.html#estadio', amalfitani: 'club.html#don-pepe', momentos: 'club.html#momentos',
  palmares: 'club.html#palmares', records: 'club.html#records',
};
const legacy = LEGACY[location.hash.slice(1)];
if (legacy) location.replace(legacy);

// ---------- Juega Vélez ----------

let countdownTimer;
function renderJuega(data, results) {
  const box = $('[data-juega]');
  clearInterval(countdownTimer);
  const next = data.fixture.find((m) => m.status === 'in') ?? data.fixture.find((m) => !m.completed);
  const last = results.at(-1);
  const zone = data.standings.groups.find((g) => g.rows.some((r) => r.id === VELEZ_ID));
  const row = zone?.rows.find((r) => r.id === VELEZ_ID);

  const lastHtml = last
    ? (() => {
        const { velezHome, velez, rival, result } = velezView(last);
        const [h, a] = velezHome ? [velez, rival] : [rival, velez];
        return `<div><dt>Último resultado</dt><dd><span class="res res-${result}" title="${RESULT_LABEL[result]}"><span class="sr-only">${RESULT_LABEL[result]}</span><span aria-hidden="true">${result}</span></span>
          ${esc(h.name)} ${h.score}-${a.score} ${esc(a.name)}</dd></div>`;
      })()
    : '';
  const posHtml = row ? `<div><dt>Posición</dt><dd><b class="num">${row.rank}°</b> en la ${esc(zone.name)} · ${row.pts} pts</dd></div>` : '';

  if (!next) {
    box.innerHTML = `<h2 class="juega-title">Juega Vélez</h2><p class="juega-empty">Todavía no hay partidos programados.</p><dl class="juega-facts">${lastHtml}${posHtml}</dl>`;
    return;
  }
  const d = new Date(next.date);
  const isLive = next.status === 'in';
  const team = (t) => `<div class="juega-team">${logo(t.logo, 56)}<span>${esc(t.name)}</span></div>`;
  const center = isLive ? `<span class="juega-score num">${next.home.score ?? 0}-${next.away.score ?? 0}</span>` : '<span class="juega-vs">vs</span>';
  // Dos columnas en escritorio (el partido | cuenta regresiva y datos); una en celular.
  box.innerHTML = `
    <div class="juega-main">
      <h2 class="juega-title">${isLive ? '<span class="live-pill">En vivo</span>' : 'Juega Vélez'}</h2>
      <p class="juega-comp">${esc(next.comp)}${next.round ? ` · ${esc(next.round.replace('Torneo ', ''))}` : ''}</p>
      <div class="juega-teams">${team(next.home)}${center}${team(next.away)}</div>
      <p class="juega-when">${esc(capitalize(fmt.long.format(d)))}${next.timeValid ? ` · ${fmt.time.format(d)} h` : ' · hora a confirmar'}${next.venue ? ` · ${esc(next.venue)}` : ''}</p>
    </div>
    <div class="juega-side">
      ${isLive ? '<div class="live-events" data-live-events hidden></div>' : '<div class="countdown" data-countdown role="timer" aria-label="Falta para el partido"></div>'}
      <dl class="juega-facts">${lastHtml}${posHtml}<div data-weather hidden></div></dl>
      <a class="btn btn-on-accent" href="partidos.html">Fixture y tablas</a>
      <div class="juega-links">
        <a class="juega-link" href="partidos.html#agendar">Agendar los partidos</a>
        ${next.home.id === VELEZ_ID ? '<a class="juega-link" href="club.html#como-llegar">Cómo llegar a la cancha</a>' : ''}
      </div>
    </div>`;
  if (isLive) {
    renderLiveEvents(next, box.querySelector('[data-live-events]'));
    return;
  }
  renderWeather(next, box.querySelector('[data-weather]'));
  const cd = box.querySelector('[data-countdown]');
  const tick = () => {
    const diff = Math.max(0, d - Date.now());
    const parts = [
      [Math.floor(diff / 864e5), 'días'],
      [Math.floor(diff / 36e5) % 24, 'horas'],
      [Math.floor(diff / 6e4) % 60, 'min'],
    ];
    cd.innerHTML = parts.map(([n, l]) => `<div><b class="num">${String(n).padStart(2, '0')}</b><span>${l}</span></div>`).join('');
  };
  tick();
  // Cada 30 s alcanza: la cuenta muestra minutos (sin segundos que obliguen a redibujar cada segundo).
  countdownTimer = setInterval(tick, 30_000);
}

// Minuto a minuto: se pide el detalle del partido en cada refresco (cada 1 min mientras se juega).
const KIND_LABEL = { gol: 'Gol', amarilla: 'Amarilla', roja: 'Roja', cambio: 'Cambio', penal: 'Penal' };
let liveCache = null; // { id, html }: lo último que se mostró, para no dejar el hueco vacío mientras se pide de nuevo
async function renderLiveEvents(m, slot) {
  if (liveCache?.id === m.id) {
    slot.innerHTML = liveCache.html;
    slot.hidden = false;
  }
  let events;
  try {
    events = keyEvents(await withTimeout(fetchSummary(m), LIVE_TIMEOUT_MS));
  } catch (err) {
    console.warn('No se pudo leer el minuto a minuto:', err);
    return;
  }
  if (!slot.isConnected || !events.length) return;
  slot.innerHTML = `<h3 class="live-events-title">Minuto a minuto</h3><ol class="live-list">${events
    .map((e) => e.kind === 'pausa'
      ? `<li class="ev-pausa"><span class="ev-min num">${esc(e.minute)}</span><span>${esc(e.text)}</span></li>`
      : `<li class="ev-${e.kind}"><span class="ev-min num">${esc(e.minute)}</span><span><b class="ev-tag">${KIND_LABEL[e.kind]}</b> ${esc(e.text)}${e.team ? ` <span class="ev-team">· ${esc(e.team)}</span>` : ''}</span></li>`)
    .join('')}</ol><p class="ev-note">Fuente: ESPN. Puede llegar con un par de minutos de atraso.</p>`;
  liveCache = { id: m.id, html: slot.innerHTML };
  slot.hidden = false;
}

// Pronóstico para la hora del partido. Se pide una vez por hora (el Inicio se refresca cada 5 min); si falla, no se muestra.
const WEATHER_TTL_MS = 60 * 60 * 1000;
let weatherCache = null; // { id, at, promise }
async function renderWeather(m, slot) {
  if (!slot || !wantsForecast(m)) return;
  if (weatherCache?.id !== m.id || Date.now() - weatherCache.at > WEATHER_TTL_MS) {
    weatherCache = { id: m.id, at: Date.now(), promise: withTimeout(fetchForecast(m), LIVE_TIMEOUT_MS).catch(() => null) };
  }
  const w = await weatherCache.promise;
  if (!w || !slot.isConnected) return;
  const rain = w.rain != null ? ` · ${w.rain}% de lluvia` : '';
  slot.innerHTML = `<dt>Pronóstico a la hora del partido</dt><dd><b class="num">${w.temp}°</b> ${esc(w.text ?? '')}${rain}</dd>`;
  slot.hidden = false;
}

// ---------- La previa: rachas, historial con el rival y un día como hoy ----------

function renderPrevia(facts, data) {
  const section = $('[data-previa]');
  if (!facts) return;
  const cards = [];

  // Rachas con los resultados en vivo encima de los guardados (si terminó un partido hace minutos, ya cuenta).
  const byId = new Map(facts.recent.map((m) => [m.id, m]));
  for (const m of data.results) byId.set(m.id, m);
  const lines = streakLines([...byId.values()]);
  if (lines.length) cards.push(`<article class="card previa-card"><h3 class="kicker">Racha</h3><ul class="previa-lines">${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul></article>`);

  const next = data.fixture.find((m) => !m.completed);
  const rival = next && (next.home.id === VELEZ_ID ? next.away : next.home);
  const rf = rival && facts.rivals[rival.id];
  if (rf) {
    const items = [
      rf.last && `Último partido: ${rf.last.score} (${rf.last.year})`,
      // Si el último partido fue triunfo, «último triunfo» repetiría lo mismo.
      rf.last?.result === 'G' ? null : rf.lastWin ? `Último triunfo: ${rf.lastWin.score} en ${rf.lastWin.year}` : 'No le ganó en ningún partido oficial registrado',
      rf.streak,
    ].filter(Boolean);
    cards.push(`<article class="card previa-card">
      <h3 class="kicker">Historial con ${esc(rf.name)}</h3>
      <dl class="previa-h2h">
        <div><dt>Ganó</dt><dd class="num">${rf.g}</dd></div><div><dt>Empató</dt><dd class="num">${rf.e}</dd></div><div><dt>Perdió</dt><dd class="num">${rf.p}</dd></div>
      </dl>
      <ul class="previa-lines">${items.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
      <a href="historial.html?rival=${encodeURIComponent(rf.id)}">Ver los ${rf.pj} partidos</a>
    </article>`);
  }

  const today = facts.days[monthDay(new Date())] ?? [];
  if (today.length) {
    cards.push(`<article class="card previa-card"><h3 class="kicker">Un día como hoy</h3><ul class="previa-days">${today
      .map((d) => `<li><b class="num">${d.year}</b><span>${d.kind === 'momento' ? `<a href="club.html#momentos">${esc(d.text)}</a>` : esc(d.text)}</span></li>`)
      .join('')}</ul></article>`);
  }

  $('[data-previa-grid]').innerHTML = cards.join('');
  section.hidden = !cards.length;
}

// ---------- Noticias ----------

const SUMMARY_MAX_AGE_DAYS = 10; // si el workflow semanal falló, no mostrar un resumen viejo como si fuera de esta semana
const MAX_CARDS = 7; // destacada (2×2) + 6: llena la grilla de 4 columnas en escritorio
const FEATURED_SECTIONS = ['futbol', 'columnadt', 'socios', 'club']; // la destacada sale de acá si hay
const SECTION_NAMES = {
  futbol: 'Fútbol', columnadt: 'Palabra del DT', socios: 'Socios', club: 'Club', reserva: 'Reserva', amateur: 'Juveniles',
  senior: 'Senior', entrenamiento: 'Entrenamiento', acreditaciones: 'Prensa', rrpp: 'Eventos', 'velez-social': 'Vélez Social',
  vmasculino: 'Vóley', vfemenino: 'Vóley', bmasculino: 'Básquet', bfemenino: 'Básquet', futbolfemenino: 'Fútbol femenino',
};
const sectionName = (s) => SECTION_NAMES[s] ?? capitalize(s.replace(/-/g, ' '));
const shortDate = (iso) => iso.slice(5).split('-').reverse().join('/'); // «2026-10-13» → «13/10»

// Grilla de noticias: la primera (de fútbol, DT, socios o club, si hay) va destacada y más grande.
function newsCard(h, featured) {
  const img = isNewsImage(h.photo)
    ? `<img class="nw-img" src="${esc(h.photo)}" alt="" width="720" height="405" loading="${featured ? 'eager' : 'lazy'}" decoding="async" onerror="this.remove()">`
    : '';
  return `<a class="nw-card${featured ? ' nw-featured' : ''}" href="${esc(h.url)}" target="_blank" rel="noopener">
    ${img}
    <div class="nw-body">
      <p class="kicker">${esc(sectionName(h.section))} <span class="nw-time">· ${esc(relativeDay(h.date))}</span></p>
      <h3 class="nw-title">${esc(h.title)}</h3>
      ${featured && h.lead ? `<p class="nw-lead">${esc(h.lead)}</p>` : ''}
      <span class="sr-only">Abre velez.com.ar en otra pestaña</span>
    </div>
  </a>`;
}

function renderNews(news, summary) {
  const headlines = (news?.headlines ?? []).filter((h) => isOfficialNoteUrl(h.url));
  const featured = headlines.find((h) => FEATURED_SECTIONS.includes(h.section) && isNewsImage(h.photo)) ?? headlines[0];
  const rest = headlines.filter((h) => h !== featured).slice(0, MAX_CARDS - 1);
  $('[data-headlines]').innerHTML = featured
    ? [newsCard(featured, true), ...rest.map((h) => newsCard(h, false))].join('')
    : '<p class="empty">No pudimos leer las notas del club. Mirá las novedades en <a href="https://velez.com.ar" target="_blank" rel="noopener">velez.com.ar</a>.</p>';

  const ageDays = summary ? (Date.now() - Date.parse(summary.generatedAt)) / 864e5 : Infinity;
  const points = (summary?.points ?? []).filter((p) => isOfficialNoteUrl(p.url));
  const box = $('[data-summary]');
  box.hidden = !(ageDays <= SUMMARY_MAX_AGE_DAYS && points.length);
  if (box.hidden) return;
  box.innerHTML = `
    <summary><span class="ai-badge">IA</span> Resumen de la semana <span class="muted">del ${esc(shortDate(summary.period.from))} al ${esc(shortDate(summary.period.to))}</span></summary>
    <ul class="summary-points">${points
      .map((p) => `<li><p>${esc(p.texto)}</p><a href="${esc(p.url)}" target="_blank" rel="noopener">Ver la nota</a></li>`)
      .join('')}</ul>
    <p class="ai-note">Lo escribe una IA (${esc(summary.model)}) a partir de las notas oficiales de la semana. Puede equivocarse: cada punto tiene su nota para chequearlo. Actualizado el ${esc(fmt.stamp.format(new Date(summary.generatedAt)))}.</p>`;
}

// ---------- Arranque ----------

async function refresh() {
  try {
    const { data } = await loadLive();
    const results = mergeResults([], data.results);
    renderJuega(data, results);
    updateLiveTitle(data.fixture);
    renderPrevia(await factsPromise, data);
    setTimeout(refresh, data.fixture.some((m) => m.status === 'in') ? REFRESH_LIVE_MS : REFRESH_MS);
  } catch (err) {
    console.error(err);
    $('[data-juega]').innerHTML = '<h2 class="juega-title">Juega Vélez</h2><p class="juega-empty">No pudimos cargar los partidos. Probá en un rato.</p>';
  }
}

// La previa se arma con datos que genera el deploy (facts.json) más los resultados en vivo.
const factsPromise = getJson('data/generated/facts.json').catch(() => null);
const [news, summary] = await Promise.all([
  getJson('data/generated/news.json').catch(() => null),
  getJson('data/generated/resumen.json').catch(() => null),
]);
renderNews(news, summary);
refresh();

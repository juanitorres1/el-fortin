// El club: historia, estadio, Don Pepe, momentos, palmarés, ídolos y récords (data/club.json, a mano).
import { $, esc, getJson, scrollToHash } from '../core.js';

function renderRecords(rec) {
  if (!rec) return;
  const barList = (rows, val, unit) => {
    const max = rows[0][val];
    return `<ol class="rank">${rows
      .map((r, i) => `<li><span class="rank-n num">${i + 1}</span><div class="rank-main"><strong>${esc(r.nombre)}</strong><small class="muted">${esc(r.periodo)}</small><i style="width:${(r[val] / max) * 100}%"></i></div><b class="num">${r[val]}</b><small class="rank-unit muted">${unit}</small></li>`)
      .join('')}</ol>`;
  };
  $('[data-records]').innerHTML = `
    <article class="card"><h3 class="h3">Máximos goleadores</h3>${barList(rec.goleadores, 'goles', 'goles')}</article>
    <article class="card"><h3 class="h3">Más partidos</h3>${barList(rec.presencias, 'partidos', 'PJ')}</article>
    <article class="card"><h3 class="h3">Más títulos ganados</h3>${rec.titulos
      .map((g) => `<div class="titles-row"><b class="num">${g.titulos}</b><p>${g.jugadores.map(esc).join(' · ')}</p></div>`)
      .join('')}<p class="muted small">${esc(rec.tecnicos)}</p></article>
    <article class="card"><h3 class="h3">Goleadores de torneo</h3><ul class="scorers">${rec.goleadoresTorneo
      .map((g) => `<li><strong>${esc(g.nombre)}</strong><span class="muted">${esc(g.torneo)}</span><b class="num">${g.goles}</b></li>`)
      .join('')}</ul></article>`;
  $('[data-records-source]').textContent = rec.fuente;
}

function render(club) {
  $('[data-fortin]').textContent = club.fortin;
  $('[data-timeline]').innerHTML = club.historia
    .map((h) => `<li><p class="t-year num">${esc(h.anio)}</p><div class="t-body"><h3 class="h3">${esc(h.titulo)}</h3><p>${esc(h.texto)}</p></div></li>`)
    .join('');

  const e = club.estadio;
  $('[data-stadium-intro]').textContent = e.intro;
  $('[data-stadium-stats]').innerHTML = e.datos.map((d) => `<div><dt>${esc(d.etiqueta)}</dt><dd class="num">${esc(d.valor)}</dd></div>`).join('');
  $('[data-stadium-hitos]').innerHTML = e.hitos.map((h) => `<li><b>${esc(h.fecha)}</b><span>${esc(h.texto)}</span></li>`).join('');

  const [first, ...rest] = club.frases;
  $('[data-quotes]').innerHTML = [first && `<figure class="quote quote-main"><blockquote>${esc(first.texto)}</blockquote><figcaption>${esc(first.contexto)}</figcaption></figure>`]
    .concat(rest.map((f) => `<figure class="quote"><blockquote>${esc(f.texto)}</blockquote><figcaption>${esc(f.contexto)}</figcaption></figure>`))
    .join('');

  $('[data-moments]').innerHTML = club.momentos
    .map((m) => `<article class="card moment">${m.marcador ? `<p class="moment-score num">${esc(m.marcador)}</p>` : ''}<h3 class="h3">${esc(m.titulo)}</h3><p class="muted small">${esc(m.fecha)} · ${esc(m.lugar)}</p><p>${esc(m.texto)}</p></article>`)
    .join('');

  const cats = Object.entries(club.palmares);
  $('[data-palmares-total]').textContent = `${cats.reduce((n, [, list]) => n + list.length, 0)} títulos oficiales`;
  $('[data-palmares]').innerHTML = cats
    .map(([cat, list]) => `<article class="card trophy-col"><h3 class="h3">${esc(cat)} <b class="num">${list.length}</b></h3><ul>${list.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></article>`)
    .join('');
  $('[data-idols]').innerHTML = club.idolos
    .map((i) => `<article class="card idol"><h3 class="h3">${esc(i.nombre)}</h3><p class="idol-role">${esc(i.rol)}</p><p>${esc(i.texto)}</p></article>`)
    .join('');
  renderRecords(club.records);
}

render(await getJson('data/club.json'));
scrollToHash();

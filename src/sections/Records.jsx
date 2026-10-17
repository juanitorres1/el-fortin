// Historial: récords que se calculan solos con todos los partidos (lib/facts.js › historyRecords) y efemérides de
// cualquier día del año, con los aniversarios que se vienen.
import { useMemo, useState } from 'react';
import { historyRecords, monthDay, onThisDay, upcomingAnniversaries } from '../lib/facts.js';
import { useNow } from '../hooks/data.js';
import { Empty } from '../components/ui.jsx';

const WHERE = { local: 'de local', visitante: 'de visitante', neutral: 'en cancha neutral' };
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DAYS_IN = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function Streak({ label, s, unit = 'partidos' }) {
  if (!s) return null;
  return (
    <div className="rec-streak">
      <dt>{label}</dt>
      <dd>
        <b className="num">{s.n}</b> {unit}
        <small>{s.from} → {s.to}{s.current && <span className="tag rec-now">En curso</span>}</small>
      </dd>
    </div>
  );
}

/** `matches` = todos los partidos (históricos + ESPN). */
export function HistoryRecords({ matches }) {
  const r = useMemo(() => historyRecords(matches), [matches]);
  if (!r.totals.pj) return null;
  const t = r.totals;
  return (
    <section className="block" id="rachas" aria-labelledby="t-rachas">
      <div className="section-head">
        <h2 className="h2" id="t-rachas">Récords del historial</h2>
        <p className="muted small">Se actualizan solos con cada partido. Rachas desde 2001.</p>
      </div>
      <dl className="rec-totals">
        <div><dt>Partidos oficiales desde {t.since}</dt><dd className="num">{t.pj.toLocaleString('es-AR')}</dd></div>
        <div><dt>Ganados</dt><dd className="num">{t.g.toLocaleString('es-AR')}</dd></div>
        <div><dt>Empatados</dt><dd className="num">{t.e.toLocaleString('es-AR')}</dd></div>
        <div><dt>Perdidos</dt><dd className="num">{t.p.toLocaleString('es-AR')}</dd></div>
        <div><dt>Goles a favor</dt><dd className="num">{t.gf.toLocaleString('es-AR')}</dd></div>
      </dl>
      <div className="records">
        <article className="card">
          <h3 className="h3">Las goleadas más grandes</h3>
          <ol className="rec-wins">
            {r.wins.map((w) => (
              <li key={`${w.when}-${w.rival}-${w.score}`}>
                <b className="num">{w.score}</b>
                <span><strong>{w.rival}</strong><small className="muted">{w.when} · {w.comp}, {WHERE[w.where]}</small></span>
              </li>
            ))}
          </ol>
        </article>
        <article className="card">
          <h3 className="h3">Las rachas más largas</h3>
          <dl className="rec-streaks">
            <Streak label="Ganando" s={r.streaks.ganando} />
            <Streak label="Sin perder" s={r.streaks.invicto} />
            <Streak label="Sin perder de local" s={r.streaks.invictoLocal} />
            <Streak label="Con el arco en cero" s={r.streaks.vallaInvicta} />
            <Streak label="Haciendo goles" s={r.streaks.convirtiendo} />
          </dl>
        </article>
        <article className="card">
          <h3 className="h3">Más datos</h3>
          <dl className="rec-streaks">
            {r.goals && <div className="rec-streak"><dt>Más goles en un partido</dt><dd><b className="num">{r.goals.score}</b> a {r.goals.rival}<small>{r.goals.when} · {r.goals.comp}</small></dd></div>}
            {r.favorite && (
              <div className="rec-streak">
                <dt>El rival al que más le ganó</dt>
                <dd><a href={`historial.html?rival=${encodeURIComponent(r.favorite.id)}`}>{r.favorite.name}</a>: <b className="num">{r.favorite.g}</b> triunfos<small>en {r.favorite.pj} partidos</small></dd>
              </div>
            )}
            {r.bestYear && (
              <div className="rec-streak">
                <dt>El mejor año</dt>
                <dd><b className="num">{r.bestYear.year}</b>: {Math.round(r.bestYear.pct * 100)}% de los puntos<small>{r.bestYear.g} G · {r.bestYear.e} E · {r.bestYear.p} P</small></dd>
              </div>
            )}
          </dl>
        </article>
      </div>
    </section>
  );
}

/** Un día como hoy para cualquier fecha, y lo que se viene. `club` = club.json. */
export function Efemerides({ matches, club }) {
  const now = useNow();
  const today = monthDay(new Date(now));
  const [picked, setPicked] = useState(null);
  const md = picked ?? today;
  const [m, d] = md.split('-').map(Number);
  const items = useMemo(() => onThisDay(md, { matches, club, max: 8 }), [md, matches, club]);
  const upcoming = useMemo(() => upcomingAnniversaries(club, new Date(now), 90).slice(0, 5), [club, now]);
  const set = (mm, dd) => setPicked(`${String(mm).padStart(2, '0')}-${String(Math.min(dd, DAYS_IN[mm - 1])).padStart(2, '0')}`);
  return (
    <section className="block bleed bleed-gray" id="efemerides" aria-labelledby="t-efemerides">
      <h2 className="h2" id="t-efemerides">Efemérides</h2>
      <div className="efe">
        <div>
          <div className="h2h-controls efe-controls">
            <label>
              <span>Día</span>
              <select value={d} onChange={(e) => set(m, Number(e.target.value))}>
                {Array.from({ length: DAYS_IN[m - 1] }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
              </select>
            </label>
            <label>
              <span>Mes</span>
              <select value={m} onChange={(e) => set(Number(e.target.value), d)}>
                {MONTHS.map((name, i) => <option key={name} value={i + 1}>{name}</option>)}
              </select>
            </label>
          </div>
          <h3 className="h3 efe-h">{md === today ? 'Un día como hoy' : `Un ${d} de ${MONTHS[m - 1]}`}</h3>
          {items.length ? (
            <ul className="previa-days">
              {items.map((x) => <li key={`${x.year}-${x.text}`}><b className="num">{x.year}</b><span>{x.text}</span></li>)}
            </ul>
          ) : <Empty>No hay triunfos ni hitos registrados para esa fecha. Probá con otra.</Empty>}
          <p className="muted small">Triunfos con fecha (desde 2001) y momentos del club.</p>
        </div>
        {upcoming.length > 0 && (
          <div className="card efe-next">
            <h3 className="kicker">Se vienen</h3>
            <ul>
              {upcoming.map((a) => (
                <li key={`${a.md}-${a.text}`}>
                  <b className="num">{a.inDays === 0 ? 'Hoy' : a.inDays === 1 ? 'Mañana' : `${a.inDays} días`}</b>
                  <span>{a.text} <small className="muted">· {a.years} años ({a.year})</small></span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

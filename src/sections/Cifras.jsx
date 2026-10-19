// «Vélez en cifras» (Partidos): local y visitante, goles por cuarto de hora, cómo llegan los goles, qué pasa cuando
// convierte primero, remontadas y ventajas perdidas. Sale de games.json (lo genera el deploy con el detalle de cada
// partido oficial del año); las cuentas están en lib/facts.js (seasonNumbers).
import { useState } from 'react';
import { seasonNumbers } from '../lib/facts.js';
import { plural } from '../lib/core.js';
import { Segmented } from '../components/ui.jsx';

const ALL = 'año';
const rec = (t) => `${t.g} G · ${t.e} E · ${t.p} P`;
const eff = (t) => (t.pj ? `${Math.round((t.pts / (3 * t.pj)) * 100)}%` : '—');

function Split({ title, t }) {
  return (
    <div className="cf-split">
      <p className="kicker">{title}</p>
      <p className="cf-big num">{t.pts}<small> pts en {t.pj}</small></p>
      <p>{rec(t)} · goles {t.gf}-{t.gc}</p>
      <p className="muted small">Efectividad {eff(t)}</p>
    </div>
  );
}

function Bands({ bands }) {
  const max = Math.max(1, ...bands.flatMap((b) => [b.gf, b.gc]));
  return (
    <>
      <ol className="cf-bands" aria-label="Goles a favor y en contra por cuarto de hora">
        {bands.map((b) => (
          <li key={b.label}>
            <span className="cf-bar is-for" style={{ height: `${(b.gf / max) * 100}%` }}><b className="num">{b.gf || ''}</b></span>
            <span className="cf-band num">{b.label}</span>
            <span className="cf-bar is-against" style={{ height: `${(b.gc / max) * 100}%` }}><b className="num">{b.gc || ''}</b></span>
            <span className="sr-only">: {b.gf} a favor y {b.gc} en contra</span>
          </li>
        ))}
      </ol>
      <p className="cf-legend muted small"><i className="is-for" /> A favor <i className="is-against" /> En contra</p>
    </>
  );
}

/** `games` = games.json › games (partidos oficiales del año, en orden). */
export function Cifras({ games }) {
  // Primero los torneos de liga (el más reciente arriba), después todo el año y las copas.
  const labels = [...new Set((games ?? []).map((g) => g.label))].reverse();
  const league = labels.filter((l) => /^(Apertura|Clausura|Liga) /.test(l));
  const cups = labels.filter((l) => !league.includes(l));
  const [pick, setPick] = useState(null);
  if (!games?.length) return null;
  const label = pick ?? league[0] ?? labels[0];
  const s = seasonNumbers(label === ALL ? games : games.filter((g) => g.label === label));
  const k = s.kinds;
  const scored = k.p + k.c + k.tl + k.ec + k[''];
  const options = [...league, ...(labels.length > 1 ? [ALL] : []), ...cups].map((l) => ({ value: l, label: l === ALL ? 'Todo el año' : l }));
  return (
    <section className="block" id="cifras" aria-labelledby="t-cifras">
      <h2 className="h2" id="t-cifras">Vélez en cifras</h2>
      {options.length > 1 && <Segmented label="Elegir torneo" options={options} value={label} onChange={setPick} />}
      <div className="cifras">
        <article className="card cf-card">
          <h3 className="h3">Local y visitante</h3>
          <div className="cf-splits"><Split title="De local" t={s.home} /><Split title="De visitante" t={s.away} /></div>
        </article>
        {s.known > 0 && (
          <>
            <article className="card cf-card">
              <h3 className="h3">Goles por minuto</h3>
              <Bands bands={s.bands} />
            </article>
            <article className="card cf-card">
              <h3 className="h3">Cómo llegan los goles</h3>
              <dl className="cf-kinds">
                {[['De jugada', k['']], ['De penal', k.p], ['De cabeza', k.c], ['De tiro libre', k.tl], ['En contra del rival', k.ec]].map(([t, n]) => (
                  <div key={t}><dt>{t}</dt><dd><b className="num">{n}</b><i style={{ width: `${scored ? (n / scored) * 100 : 0}%` }} /></dd></div>
                ))}
              </dl>
            </article>
            <article className="card cf-card">
              <h3 className="h3">El primer gol</h3>
              <dl className="cf-first">
                <div><dt>Cuando convierte primero</dt><dd>{s.first.pj ? `${rec(s.first)} (${plural(s.first.pj, 'partido', 'partidos')})` : 'Todavía no pasó'}</dd></div>
                <div><dt>Cuando le convierten primero</dt><dd>{s.first.against.pj ? `${rec(s.first.against)} (${plural(s.first.against.pj, 'partido', 'partidos')})` : 'Todavía no pasó'}</dd></div>
                <div><dt>Remontadas</dt><dd>{s.comebacks.n ? `Sacó ${plural(s.comebacks.pts, 'punto', 'puntos')} en ${plural(s.comebacks.n, 'partido', 'partidos')} que iba perdiendo${s.comebacks.won ? ` (ganó ${s.comebacks.won})` : ''}` : 'No sacó puntos yendo abajo'}</dd></div>
                <div><dt>Ventajas perdidas</dt><dd>{s.blown.n ? `Dejó ${plural(s.blown.pts, 'punto', 'puntos')} en ${plural(s.blown.n, 'partido', 'partidos')} que iba ganando` : 'Nunca dejó escapar una ventaja'}</dd></div>
              </dl>
            </article>
          </>
        )}
      </div>
      <p className="muted small">
        Partidos oficiales de {label === ALL ? 'este año' : label}, según ESPN.
        {s.known < s.pj && ` Los minutos y cómo llegaron los goles salen de ${s.known} de los ${s.pj} partidos (en el resto ESPN no informó los goles).`}
      </p>
    </section>
  );
}

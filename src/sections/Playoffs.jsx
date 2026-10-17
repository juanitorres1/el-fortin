// «Camino a los playoffs»: qué le falta a cada equipo para clasificar matemáticamente. El cálculo está en
// lib/playoffs.js; cuántos pasan y los partidos que quedan salen de ESPN (si falta alguno, la sección no se muestra).
import { useState } from 'react';
import { VELEZ_ID, fetchPhaseRemaining } from '../lib/espn.js';
import { qualification, qualificationLines, remainingByTeam, spotsPerZone } from '../lib/playoffs.js';
import { useCached } from '../hooks/data.js';
import { Crest, Lines, Segmented } from '../components/ui.jsx';
import { Simulador } from './Simulador.jsx';

const TTL_MS = 15 * 60 * 1000;

function Status({ t }) {
  if (t.status === 'clasificado') return <span className="po-chip po-in">Clasificado</span>;
  if (t.status === 'eliminado') return <span className="po-chip po-out">Eliminado</span>;
  if (t.needed != null) return <span className="po-chip">Asegura con {t.needed} {t.needed === 1 ? 'pt' : 'pts'}</span>;
  return <span className="po-chip">Depende de otros</span>;
}

function Remaining({ t }) {
  if (!t.opponents.length) return 'Terminó la fase';
  return (
    <>
        Le quedan:{' '}
        {t.opponents.map((o, i) => (
          <span key={`${o.rivalId}-${o.date}`}>
            {i > 0 && ' · '}
            <span className={o.rivalId === VELEZ_ID ? 'po-vs-velez' : undefined}>{o.rival} ({o.home ? 'L' : 'V'})</span>
          </span>
        ))}
    </>
  );
}

/** `standings` = tabla en vivo; `refresh` = hora de los datos (para volver a pedir el fixture cada 15 min). */
export function Playoffs({ standings, refresh }) {
  const [zoneName, setZoneName] = useState(null);
  const groups = standings?.groups.filter((g) => g.rows.length) ?? [];
  const spots = standings ? spotsPerZone(standings.playoffTeams, groups.length) : null;
  const events = useCached(spots && standings.phaseKey ? standings.phaseKey : null, () => fetchPhaseRemaining(standings), { ttl: TTL_MS, refresh });
  // Sin el fixture no se puede calcular: mejor no mostrar estados inventados.
  if (!spots || !events) return null;

  const remaining = remainingByTeam(events);
  const zones = groups.map((g) => ({ name: g.name, rows: qualification(g.rows, remaining, spots) }));
  const velezZone = zones.find((z) => z.rows.some((r) => r.id === VELEZ_ID));
  const velez = velezZone?.rows.find((r) => r.id === VELEZ_ID);
  const zone = zones.find((z) => z.name === zoneName) ?? velezZone ?? zones[0];

  return (
    <>
    <section className="block" id="playoffs" aria-labelledby="t-playoffs">
      <h2 className="h2" id="t-playoffs">Camino a los playoffs</h2>
      {velez && (
        <div className="card po-summary">
          <p className="kicker">Vélez · {velezZone.name}</p>
          <Lines items={qualificationLines(velez, velezZone.rows, spots)} />
        </div>
      )}
      <Segmented label="Elegir zona" options={zones.map((z) => ({ value: z.name, label: z.name }))} value={zone.name} onChange={setZoneName} />
      <ol className="po-list">
        {[...zone.rows].sort((a, b) => a.rank - b.rank).flatMap((t, i) => [
          i === spots && <li key="cut" className="po-cut" aria-hidden="true"><span>Zona de clasificación arriba</span></li>,
          <li key={t.id} className={`po-row${t.id === VELEZ_ID ? ' is-velez' : ''}`}>
            <span className="po-pos num">{t.rank}</span>
            <div className="po-main"><strong><Crest url={t.logo} size={22} />{t.name}</strong><small><Remaining t={t} /></small></div>
            <div className="po-pts"><b className="num">{t.pts}</b><small>máx. {t.max}</small></div>
            <div className="po-status"><Status t={t} /></div>
          </li>,
        ])}
      </ol>
      <p className="muted small">
        Pasan los {spots} primeros de cada zona. «Asegura con» son los puntos que le alcanzan para clasificar sin depender de nadie. El cálculo
        es conservador: cuenta como amenaza a quien pueda igualar en puntos (los desempates no se pueden anticipar) y no descuenta que dos
        rivales se enfrenten entre sí. Por eso «Clasificado» y «Eliminado» son seguros, aunque a veces se confirman una fecha más tarde.
      </p>
    </section>
    {velezZone && <Simulador zone={groups.find((g) => g.name === velezZone.name)} events={events} spots={spots} />}
    </>
  );
}

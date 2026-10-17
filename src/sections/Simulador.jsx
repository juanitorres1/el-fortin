// Simulador «¿Qué necesita Vélez?»: el hincha elige cómo terminan los partidos que quedan y ve la tabla de la zona
// con esos resultados. La cuenta está en lib/playoffs.js (simulateZone); lo elegido no se guarda.
import { useMemo, useState } from 'react';
import { VELEZ_ID } from '../lib/espn.js';
import { fmt } from '../lib/core.js';
import { PICKS, simulateZone, zoneEvents } from '../lib/playoffs.js';
import { Crest } from '../components/ui.jsx';

function MatchPick({ m, value, onPick }) {
  const isVelez = m.home.id === VELEZ_ID || m.away.id === VELEZ_ID;
  const label = (p) => (p === 'L' ? `Gana ${m.home.name}` : p === 'V' ? `Gana ${m.away.name}` : 'Empate');
  return (
    <li className={`sim-match${isVelez ? ' is-velez' : ''}`}>
      <p className="sim-date muted small">{fmt.day.format(new Date(m.date))} {fmt.mon.format(new Date(m.date)).replace('.', '')}</p>
      <div className="sim-teams" role="group" aria-label={`${m.home.name} vs ${m.away.name}`}>
        {PICKS.map((p) => (
          <button key={p} type="button" className="sim-pick" aria-pressed={value === p} aria-label={label(p)} onClick={() => onPick(m.id, value === p ? null : p)}>
            {p === 'E' ? 'Empate' : (
              <>
                <Crest url={(p === 'L' ? m.home : m.away).logo} size={20} />
                <span>{(p === 'L' ? m.home : m.away).name}</span>
              </>
            )}
          </button>
        ))}
      </div>
    </li>
  );
}

function verdict(velez, spots, total, open) {
  if (!velez) return null;
  const inside = velez.rank <= spots;
  const pos = `${velez.rank}.º`;
  if (open > 0) return `Con lo que elegiste, Vélez queda ${pos} con ${velez.pts} puntos${inside ? ', adentro de los playoffs' : ', afuera de los playoffs'}. Faltan ${open} ${open === 1 ? 'partido' : 'partidos'} por elegir.`;
  return inside ? `Con estos resultados, Vélez termina ${pos} con ${velez.pts} puntos y clasifica a los playoffs.` : `Con estos resultados, Vélez termina ${pos} de ${total} con ${velez.pts} puntos y se queda afuera.`;
}

/** `zone` = { name, rows } de la zona de Vélez; `events` = partidos que quedan (todos); `spots` = cuántos pasan. */
export function Simulador({ zone, events, spots }) {
  const [picks, setPicks] = useState({});
  const [showAll, setShowAll] = useState(false);
  const list = useMemo(() => zoneEvents(zone.rows, events), [zone, events]);
  const table = useMemo(() => simulateZone(zone.rows, list, picks), [zone, list, picks]);
  if (!list.length) return null;

  const velezMatches = list.filter((m) => m.home.id === VELEZ_ID || m.away.id === VELEZ_ID);
  const others = list.filter((m) => !velezMatches.includes(m));
  const pick = (id, p) => setPicks((s) => ({ ...s, [id]: p }));
  const velezWinsAll = () => setPicks((s) => ({ ...s, ...Object.fromEntries(velezMatches.map((m) => [m.id, m.home.id === VELEZ_ID ? 'L' : 'V'])) }));
  const open = list.filter((m) => !picks[m.id]).length;
  const velez = table.find((r) => r.id === VELEZ_ID);

  return (
    <section className="block" id="simulador" aria-labelledby="t-simulador">
      <div className="section-head">
        <h2 className="h2" id="t-simulador">¿Qué necesita Vélez?</h2>
        <p className="muted small">Elegí cómo terminan los partidos que quedan en la {zone.name} y mirá cómo queda la tabla.</p>
      </div>
      <div className="sim">
        <div>
          <h3 className="h3 sim-h">Los partidos de Vélez</h3>
          <ol className="sim-list">{velezMatches.map((m) => <MatchPick key={m.id} m={m} value={picks[m.id]} onPick={pick} />)}</ol>
          {others.length > 0 && (
            <>
              <button type="button" className="btn btn-outline sim-more" aria-expanded={showAll} onClick={() => setShowAll((x) => !x)}>
                {showAll ? 'Ocultar los partidos de los rivales' : `Elegir también los partidos de los rivales (${others.length})`}
              </button>
              {showAll && <ol className="sim-list">{others.map((m) => <MatchPick key={m.id} m={m} value={picks[m.id]} onPick={pick} />)}</ol>}
            </>
          )}
          <div className="cal-links sim-actions">
            <button type="button" className="btn btn-outline" onClick={velezWinsAll}>Vélez gana todo</button>
            <button type="button" className="btn btn-outline" onClick={() => setPicks({})} disabled={open === list.length}>Borrar todo</button>
          </div>
        </div>
        <div>
          <p className="card sim-verdict" aria-live="polite">{verdict(velez, spots, table.length, open)}</p>
          <ol className="sim-table" aria-label={`Tabla simulada de la ${zone.name}`}>
            {table.flatMap((r, i) => [
              i === spots && <li key="cut" className="po-cut" aria-hidden="true"><span>Zona de clasificación arriba</span></li>,
              <li key={r.id} className={r.id === VELEZ_ID ? 'is-velez' : undefined}>
                <span className="po-pos num">{r.rank}</span>
                <span className="sim-team"><Crest url={r.logo} size={20} />{r.name}</span>
                <span className="sim-move muted small" aria-label={r.before === r.rank ? 'Mismo puesto' : `Antes ${r.before}.º`}>
                  {r.before > r.rank ? `▲${r.before - r.rank}` : r.before < r.rank ? `▼${r.rank - r.before}` : ''}
                </span>
                <b className="num">{r.pts}</b>
              </li>,
            ])}
          </ol>
          <p className="muted small">
            Desempate por la diferencia de gol actual (un resultado elegido no tiene goles). Es una simulación: en el reglamento hay más criterios de desempate.
          </p>
        </div>
      </div>
    </section>
  );
}

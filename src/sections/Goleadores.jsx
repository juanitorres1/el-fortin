// Goleadores y asistidores del torneo en curso, con Vélez resaltado. Los goles se cuentan en vivo desde los partidos
// (lib/espn.js › fetchScorers); las asistencias las arma el deploy desde el detalle de cada partido (asistencias.json).
import { useState } from 'react';
import { VELEZ_ID, fetchScorers } from '../lib/espn.js';
import { DATA, plural } from '../lib/core.js';
import { useCached, useJson } from '../hooks/data.js';
import { Crest, Segmented } from '../components/ui.jsx';

const TTL_MS = 15 * 60 * 1000;
const TOP = 10;
const LISTS = { goles: { label: 'Goleadores', unit: ['gol', 'goles'] }, asist: { label: 'Asistidores', unit: ['asistencia', 'asistencias'] } };

function Leaders({ rows, unit }) {
  return (
    <ol className="scorers-list">
      {rows.map((s, i) => (
        <li key={s.id || s.name} className={`scorer${s.team?.id === VELEZ_ID ? ' is-velez' : ''}`}>
          {/* Empatados comparten puesto: solo el primero lleva el número. */}
          <span className="scorer-pos num">{i > 0 && rows[i - 1].n === s.n ? '' : i + 1}</span>
          <div className="scorer-main">
            <strong>{s.name}</strong>
            <small>{s.team && <><Crest url={s.team.logo} size={18} />{s.team.name}</>}{s.pen ? ` · ${plural(s.pen, 'de penal', 'de penal')}` : ''}</small>
          </div>
          <b className="num scorer-goals">{s.n}<small>{s.n === 1 ? unit[0] : unit[1]}</small></b>
        </li>
      ))}
    </ol>
  );
}

/** `standings` = tabla en vivo (fase en curso); `refresh` = hora de los datos (para volver a contar los goles). */
export function Goleadores({ standings, refresh }) {
  const [pick, setPick] = useState('goles');
  const [all, setAll] = useState(false);
  const scorers = useCached(standings?.phaseKey ?? null, () => fetchScorers(standings), { ttl: TTL_MS, refresh });
  const assistsFile = useJson(`${DATA}asistencias.json`);
  // Las asistencias guardadas son de una fase: si el torneo ya cambió (y el deploy todavía no corrió), no se muestran.
  const assists = assistsFile && standings && assistsFile.phaseKey === standings.phaseKey ? assistsFile.players : null;
  const lists = { goles: scorers, asist: assists };
  const available = Object.keys(LISTS).filter((k) => lists[k]?.length);
  // Se espera a los goles (la lista que se ve primero) para no mostrar los asistidores y cambiar al toque.
  if (scorers === undefined || !available.length) return null;
  const key = available.includes(pick) ? pick : available[0];
  const rows = lists[key];
  const phase = (standings.phase ?? '').replace('Torneo ', '');
  // Hay muchos empatados (26 jugadores con 3 asistencias o más): se muestran los 10 primeros y, a pedido, todos.
  const shown = all ? rows : rows.slice(0, TOP);
  const own = rows.filter((s) => s.team?.id === VELEZ_ID);
  const unit = LISTS[key].unit;
  return (
    <section className="block" id="goleadores" aria-labelledby="t-goleadores">
      <h2 className="h2" id="t-goleadores">{phase ? `Goleadores y asistidores del ${phase}` : 'Goleadores y asistidores'}</h2>
      {available.length > 1 && <Segmented label="Elegir lista" options={available.map((k) => ({ value: k, label: LISTS[k].label }))} value={key} onChange={setPick} />}
      {own.length > 0 && (
        <p className="scorers-own"><b>De Vélez:</b> {own.map((s) => `${s.name} ${s.n}`).join(' · ')}</p>
      )}
      <Leaders rows={shown} unit={unit} />
      {rows.length > TOP && (
        <button type="button" className="btn btn-outline scorers-more" aria-expanded={all} onClick={() => setAll(!all)}>
          {all ? `Ver los ${TOP} primeros` : `Ver todos (${rows.length})`}
        </button>
      )}
      <p className="muted small">
        {key === 'goles'
          ? 'Contados desde los partidos de ESPN, también los que se están jugando. Cuentan todos los goles del torneo aunque el jugador haya cambiado de club; el equipo es con el que hizo el último.'
          : `Desde el detalle de cada partido en ESPN; se actualizan con cada deploy (varias veces por hora). El equipo es con el que dio la última.`}
      </p>
    </section>
  );
}

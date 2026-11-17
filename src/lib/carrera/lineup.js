// Modo Carrera · la formación del partido: los once de Vélez en el 4-2-3-1, con el jugador en su lugar y el resto
// del plantel real de ESPN (arqueros al arco, defensores atrás, volantes en el medio, delanteros arriba). Quién
// juega cada fecha sale de la semilla y la semana: recargar no cambia el equipo. Lógica pura.
import { rng } from '../trivia.js';
import { hash } from '../daily.js';
import { SPOTS, spotOf } from './player.js';

const ROSTER_POS = { arq: 'G', def: 'D', vol: 'M', del: 'F' };

/** El plantel que se guarda al crear la carrera: nombre, puesto de ESPN (G, D, M, F) y dorsal. */
export function squadFrom(roster) {
  return (roster?.players ?? []).filter((p) => p.name && 'GDMF'.includes(p.pos)).slice(0, 40)
    .map((p) => ({ name: p.name, pos: p.pos, n: p.jersey ? String(p.jersey) : null }));
}

/** Apellido para el dibujo (lo que va debajo de cada punto): «Tomás Marchiori» → «Marchiori». */
export const shortName = (name) => String(name ?? '').trim().split(/\s+/).slice(1).join(' ') || String(name ?? '');

/**
 * Los once: [{ spot, name, n, you }]. `bench` = el jugador arranca en el banco (su lugar lo ocupa otro).
 * Sin plantel guardado (carreras viejas) usa los compañeros de campo (`mates`) y deja el arco sin nombre.
 */
export function lineupOf(state, key, { bench = false } = {}) {
  const me = spotOf(state.player);
  const r = rng(hash(`${state.seed}:once:${key}`));
  const pool = { G: [], D: [], M: [], F: [] };
  const squad = state.squad?.length ? state.squad : (state.mates ?? []).map((name, i) => ({ name, pos: 'DMF'[i % 3], n: null }));
  for (const p of squad) pool[p.pos]?.push(p);
  // Una rotación distinta por fecha: arranca cada puesto desde un lugar al azar de su lista.
  const start = Object.fromEntries(Object.entries(pool).map(([k, v]) => [k, v.length ? Math.floor(r() * v.length) : 0]));
  const used = new Set();
  const take = (pos) => {
    const list = pool[pos];
    for (let i = 0; i < list.length; i++) {
      const p = list[(start[pos] + i) % list.length];
      if (!used.has(p.name)) { used.add(p.name); return p; }
    }
    // Si un puesto de campo se queda sin gente, se completa con cualquiera que quede (el arco no).
    if (pos === 'G') return null;
    return Object.values(pool).flat().find((p) => !used.has(p.name) && used.add(p.name)) ?? null;
  };
  return SPOTS.map((spot) => {
    if (spot.key === me.key && !bench) return { spot, name: state.player.name, n: null, you: true };
    const p = take(ROSTER_POS[spot.pos]);
    return { spot, name: p?.name ?? null, n: p?.n ?? null, you: false };
  });
}

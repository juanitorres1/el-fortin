// Camino a los playoffs: con la tabla de la zona y los partidos que le quedan a cada equipo, qué falta para
// clasificar matemáticamente. Cuántos pasan por zona sale de ESPN (playoffTeams / zonas; Clausura 2026: 16 / 2 = 8)
// y los partidos que quedan, del fixture: si la AFA cambia el formato, el cálculo lo sigue sin tocar el código.
//
// El cálculo es conservador, para que «clasificado» y «eliminado» sean seguros:
// - un rival que puede igualar en puntos cuenta como amenaza (los desempates no se pueden anticipar);
// - no se descuenta que dos rivales se enfrenten entre sí (no pueden ganar los dos). Por eso un equipo puede estar
//   clasificado una fecha antes de que este cálculo lo confirme, pero nunca al revés.

/** Puntos que se pueden sumar en `n` partidos: 3G + 1E con G + E ≤ n, ordenados (con 1 partido: 0, 1, 3). */
export function reachablePoints(n) {
  const set = new Set();
  for (let w = 0; w <= n; w++) for (let d = 0; d <= n - w; d++) set.add(3 * w + d);
  return [...set].sort((a, b) => a - b);
}

/** Partidos de la fase regular que quedan, por equipo: Map id → [{ rival, home, date }]. */
export function remainingByTeam(events) {
  const out = new Map();
  const add = (team, rival, home, date) => out.set(team.id, [...(out.get(team.id) ?? []), { rival: rival.name, rivalId: rival.id, home, date }]);
  for (const m of [...events].sort((a, b) => Date.parse(a.date) - Date.parse(b.date))) {
    if (m.completed || m.status === 'post') continue;
    add(m.home, m.away, true, m.date);
    add(m.away, m.home, false, m.date);
  }
  return out;
}

/** Cuántos clasifican por zona: equipos en playoffs / zonas. null si no se puede saber (y la sección se oculta). */
export function spotsPerZone(playoffTeams, zones) {
  return playoffTeams && zones && Number.isInteger(playoffTeams / zones) ? playoffTeams / zones : null;
}

/**
 * Estado de cada equipo de una zona. `rows` = filas de la tabla ({ id, name, logo, pts, pj, rank }).
 * `remaining` = remainingByTeam(...) con todos los partidos que quedan (un equipo que no figura ya terminó).
 * `spots` = cuántos clasifican en la zona.
 * Devuelve las filas con { left, max, status: 'clasificado' | 'eliminado' | null, needed, opponents }:
 * `needed` = puntos que le alcanzan para clasificar sin depender de nadie (null si no alcanza ni ganando todo).
 */
export function qualification(rows, remaining, spots) {
  const teams = rows.map((r) => {
    const opponents = remaining.get(r.id) ?? [];
    const left = opponents.length;
    return { ...r, left, max: r.pts + 3 * left, opponents };
  });
  return teams.map((t) => {
    const others = teams.filter((o) => o.id !== t.id);
    const threatsAt = (pts) => others.filter((o) => o.max >= pts).length;
    const clinched = threatsAt(t.pts) < spots;
    const eliminated = others.filter((o) => o.pts > t.max).length >= spots;
    let needed = null;
    if (clinched) needed = 0;
    else if (!eliminated) needed = reachablePoints(t.left).find((x) => threatsAt(t.pts + x) < spots) ?? null;
    return { ...t, status: clinched ? 'clasificado' : eliminated ? 'eliminado' : null, needed };
  });
}

/** Frases para un equipo (pensadas para Vélez). `t` sale de qualification(); `rows` es la zona entera. */
export function qualificationLines(t, rows, spots) {
  if (t.status === 'clasificado') return ['Ya está clasificado a los playoffs.'];
  if (t.status === 'eliminado') return ['Ya no puede clasificar a los playoffs.'];
  const out = [];
  const cut = [...rows].sort((a, b) => a.rank - b.rank)[spots]; // el primero afuera (9.º)
  const pts = (n) => `${n} ${n === 1 ? 'punto' : 'puntos'}`;
  if (t.rank <= spots && cut) {
    const d = t.pts - cut.pts;
    out.push(d > 0 ? `Hoy está ${t.rank}.º, ${pts(d)} arriba del ${spots + 1}.º.` : `Hoy está ${t.rank}.º, igualado en puntos con el ${spots + 1}.º.`);
  } else {
    const last = [...rows].sort((a, b) => a.rank - b.rank)[spots - 1];
    const d = last ? last.pts - t.pts : 0;
    if (last) out.push(d > 0 ? `Hoy está ${t.rank}.º, a ${pts(d)} del ${spots}.º.` : `Hoy está ${t.rank}.º, igualado en puntos con el ${spots}.º.`);
  }
  if (t.needed != null) {
    out.push(`Si suma ${t.needed} de los ${3 * t.left} puntos que le quedan, clasifica sin depender de nadie.`);
  } else {
    out.push(`Aunque gane todo, no lo tiene asegurado: más de ${spots - 1} rivales todavía pueden alcanzarlo.`);
  }
  return out;
}

// ---------- Simulador: «¿Qué necesita Vélez?» ----------

/** Resultado elegido para un partido: 'L' (gana el local), 'E' (empate) o 'V' (gana el visitante). */
export const PICKS = ['L', 'E', 'V'];

/**
 * La tabla de una zona si los partidos que quedan terminan como dice `picks` ({ [matchId]: 'L' | 'E' | 'V' }).
 * `rows` = filas de la zona ({ id, pts, pj, g, e, p, dg, gf, ... }); `events` = partidos que quedan (de todos: los
 * interzonales suman solo al equipo de esta zona). Los partidos sin elegir no suman.
 * Orden: puntos y después la diferencia de gol actual (un resultado simulado no tiene goles); si siguen iguales,
 * quedan como estaban. Devuelve las filas con `rank` nuevo, `added` (puntos sumados) y `before` (puesto anterior).
 */
export function simulateZone(rows, events, picks) {
  const byId = new Map(rows.map((r) => [r.id, { ...r, added: 0, before: r.rank }]));
  const add = (id, pts, key) => {
    const r = byId.get(id);
    if (!r) return;
    r.pts += pts;
    r.added += pts;
    r.pj += 1;
    r[key] = (r[key] ?? 0) + 1;
  };
  for (const m of events) {
    const pick = picks[m.id];
    if (!PICKS.includes(pick)) continue;
    if (pick === 'E') {
      add(m.home.id, 1, 'e');
      add(m.away.id, 1, 'e');
    } else {
      const [w, l] = pick === 'L' ? [m.home.id, m.away.id] : [m.away.id, m.home.id];
      add(w, 3, 'g');
      add(l, 0, 'p');
    }
  }
  return [...byId.values()]
    .sort((a, b) => b.pts - a.pts || (b.dg ?? 0) - (a.dg ?? 0) || a.before - b.before)
    .map((r, i) => ({ ...r, rank: i + 1 }));
}

/** Partidos que quedan y tocan a la zona (alguno de los dos equipos es de `rows`), en orden de fecha. */
export function zoneEvents(rows, events) {
  const ids = new Set(rows.map((r) => r.id));
  return events.filter((m) => !m.completed && (ids.has(m.home.id) || ids.has(m.away.id))).sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
}

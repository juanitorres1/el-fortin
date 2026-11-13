// Avisos al hincha, sin tocar el DOM: partido postergado, gol en pantalla y «cambió el horario».
// Lo que se lee o se guarda en el navegador lo hacen los hooks (src/hooks/page.js); acá solo se decide qué mostrar.
import { VELEZ_ID } from './espn.js';
import { espnDay, fmt, goalBy, isOff, isUpcoming } from './core.js';

// ---------- Postergados ----------

// Nombres de estado de ESPN (`statusName`) para un partido que no se juega cuando estaba programado.
const OFF_LABEL = {
  STATUS_POSTPONED: 'Postergado',
  STATUS_SUSPENDED: 'Suspendido',
  STATUS_ABANDONED: 'Suspendido',
  STATUS_CANCELED: 'Cancelado',
  STATUS_CANCELLED: 'Cancelado',
};

/**
 * «Postergado», «Suspendido» o «Cancelado» si el partido quedó fuera de programación (`isOff`); null si no.
 * Si ESPN manda un nombre que no se conoce (o no hay: datos guardados viejos), «Postergado».
 */
export const offLabel = (m) => (isOff(m) ? OFF_LABEL[m.statusName] ?? 'Postergado' : null);

// ---------- Gol ----------

/** El marcador que se recuerda entre refrescos para detectar un gol (lo que espera `goalBy`). */
export const scoreOf = (m) => ({ id: m.id, home: m.home.score ?? 0, away: m.away.score ?? 0 });

/**
 * ¿Hubo gol desde el marcador anterior (`prev` = scoreOf del refresco anterior)? Devuelve
 * { who: 'velez' | 'rival', score: '2-1' (local-visitante), rival } o null. Sin marcador previo (primera carga), si
 * cambió el partido o si el marcador bajó (gol anulado, corrección de ESPN) no hay aviso.
 */
export function goalAlert(prev, m) {
  const who = goalBy(prev, m);
  if (!who) return null;
  return { who, score: `${m.home.score ?? 0}-${m.away.score ?? 0}`, rival: (m.home.id === VELEZ_ID ? m.away : m.home).name };
}

/** El texto del aviso en pantalla: festejo para Vélez, sobrio para el rival. */
export const goalText = (a) => (a.who === 'velez' ? `¡Gol de Vélez! ${a.score}` : `Gol de ${a.rival} · ${a.score}`);

// ---------- Cambió el horario ----------

export const KICKOFF_MIN_DIFF_MS = 5 * 60 * 1000; // menos que esto no es una reprogramación
export const KICKOFF_NOTICE_MS = 3 * 24 * 60 * 60 * 1000; // cuánto se muestra el aviso desde que se detectó
const KICKOFF_KEEP_MS = 24 * 60 * 60 * 1000; // un partido que ya no viene en el fixture se olvida un día después

const isRecord = (x) => Boolean(x) && typeof x === 'object' && !Array.isArray(x);
const validEntry = (e) => isRecord(e) && Number.isFinite(Date.parse(e.date));
const noticeOn = (e, now) => Boolean(e.was) && Number.isFinite(e.at) && now - e.at < KICKOFF_NOTICE_MS && now >= e.at - KICKOFF_MIN_DIFF_MS;

/**
 * Lo que hay que guardar de los horarios después de ver el fixture. `stored` = lo guardado en la visita anterior
 * ({ [id]: { date, was?, at? } }: la fecha conocida y, si cambió, la anterior y cuándo se detectó); `now` en ms.
 * - Partido por venir con hora confirmada (`timeValid`): se guarda su fecha. Si difiere 5 min o más de la guardada,
 *   queda `was` (la anterior) y `at` (ahora); el aviso vence a los 3 días.
 * - Sin hora confirmada o postergado: no se toca lo guardado (cuando le pongan fecha, se compara contra la vieja).
 *   Pasar de «hora a confirmar» a tener hora no avisa: no había nada guardado.
 * - Partido terminado, o que ya no está en el fixture y cuya fecha pasó hace más de un día: se borra.
 * No modifica `stored`; tolera cualquier cosa guardada (devuelve siempre un objeto limpio).
 */
export function trackKickoffs(stored, fixture, now) {
  const prev = isRecord(stored) ? stored : {};
  const byId = new Map(fixture.map((m) => [String(m.id), m]));
  const out = {};
  for (const [id, e] of Object.entries(prev)) {
    if (!validEntry(e)) continue;
    const m = byId.get(id);
    if (m ? m.completed : Date.parse(e.date) < now - KICKOFF_KEEP_MS) continue;
    out[id] = noticeOn(e, now) ? { date: e.date, was: e.was, at: e.at } : { date: e.date };
  }
  for (const m of fixture) {
    const t = Date.parse(m.date);
    if (!isUpcoming(m) || !m.timeValid || !Number.isFinite(t)) continue;
    const e = out[m.id];
    if (!e) out[m.id] = { date: m.date };
    else if (Math.abs(t - Date.parse(e.date)) >= KICKOFF_MIN_DIFF_MS) out[m.id] = { date: m.date, was: e.date, at: now };
  }
  return out;
}

/**
 * La fecha anterior de `m` si hay que avisar que cambió (se detectó hace menos de 3 días y el partido sigue en pie
 * con hora confirmada); null si no. `stored` = lo que devolvió `trackKickoffs`.
 */
export function kickoffChange(stored, m, now) {
  const e = isRecord(stored) ? stored[m.id] : null;
  if (!validEntry(e) || !isUpcoming(m) || !m.timeValid || !noticeOn(e, now)) return null;
  const was = Date.parse(e.was);
  // Lo guardado puede ser de un refresco anterior al fixture que se está mostrando: se avisa solo si de verdad difiere.
  return Number.isFinite(was) && Math.abs(was - Date.parse(m.date)) >= KICKOFF_MIN_DIFF_MS ? e.was : null;
}

/**
 * «Cambió el horario: antes era sábado, 14 de noviembre, 19:00 h» (hora de la Argentina). Si el día es el mismo que
 * el de `date` (la fecha nueva), alcanza con la hora: «antes era a las 19:00 h».
 */
export function kickoffChangeText(was, date) {
  const w = new Date(was);
  const sameDay = date != null && espnDay(w) === espnDay(new Date(date));
  return `Cambió el horario: antes era ${sameDay ? `a las ${fmt.time.format(w)} h` : `${fmt.long.format(w)}, ${fmt.time.format(w)} h`}`;
}

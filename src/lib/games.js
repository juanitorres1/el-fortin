// Prode y «Adiviná el once»: cuentas puras (lo que eligió cada hincha se guarda en su navegador, ver lib/storage.js).
import { tournamentOf, velezView } from './espn.js';

export const ONCE_SIZE = 11;
export const PRODE_POINTS = { exacto: 3, resultado: 1, errado: 0 };

const sign = (a, b) => Math.sign(a - b);

/** ¿Se puede pronosticar todavía? Hasta que empieza el partido. */
export const isOpen = (m, now) => Boolean(m) && !m.completed && m.status !== 'in' && Date.parse(m.date) > now;

/**
 * Puntos de un pronóstico `{ v, r }` (goles de Vélez y del rival) contra un partido terminado: 3 el resultado exacto,
 * 1 si acertó quién ganaba (o el empate), 0 si no. null si el partido no terminó. Cuenta lo de los 90' (sin penales).
 */
export function prodeScore(pred, m) {
  if (!pred || !m?.completed) return null;
  const { velez, rival } = velezView(m);
  if (velez.score == null || rival.score == null) return null;
  const kind = pred.v === velez.score && pred.r === rival.score ? 'exacto' : sign(pred.v, pred.r) === sign(velez.score, rival.score) ? 'resultado' : 'errado';
  return { kind, pts: PRODE_POINTS[kind], real: `${velez.score}-${rival.score}` };
}

/** Resumen del prode: `preds` = { [matchId]: { v, r } }; `results` = partidos terminados. */
export function prodeSummary(preds, results) {
  const byId = new Map(results.map((m) => [m.id, m]));
  const list = Object.entries(preds ?? {})
    .map(([id, pred]) => ({ id, pred, match: byId.get(id), score: prodeScore(pred, byId.get(id)) }))
    .filter((x) => x.score)
    .sort((a, b) => Date.parse(b.match.date) - Date.parse(a.match.date));
  return {
    list,
    played: list.length,
    pts: list.reduce((n, x) => n + x.score.pts, 0),
    exact: list.filter((x) => x.score.kind === 'exacto').length,
    hits: list.filter((x) => x.score.kind !== 'errado').length,
  };
}

/**
 * ¿Es un partido de eliminación (playoffs de la Liga o Copa Argentina)? Ahí, si se pronostica empate, se pregunta
 * quién pasa. Las copas internacionales no entran: la ida y vuelta puede terminar empatada sin que nadie pase.
 */
export const isKnockout = (m) => Boolean(m) && (tournamentOf(m).playoff || /Copa Argentina/i.test(m.comp ?? ''));

/** ¿El pronóstico está completo? Los dos goles y, si es empate en un partido de eliminación, quién pasa. */
export const prodeReady = (p, m) => Boolean(p) && Number.isInteger(p.v) && Number.isInteger(p.r) && (p.v !== p.r || !isKnockout(m) || p.pass === 'v' || p.pass === 'r');

/**
 * Cuánto falta para que se cierre el prode (el comienzo del partido), en castellano: «Cierra en 3 días»,
 * «Cierra en 1 día y 4 h», «Cierra en 2 h 15 min», «Cierra en 9 min». null si ya cerró. `now` en ms.
 */
export function prodeClosesIn(m, now) {
  if (!isOpen(m, now)) return null;
  const min = Math.max(1, Math.ceil((Date.parse(m.date) - now) / 60_000));
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  const mm = min % 60;
  if (d >= 2) return `Cierra en ${d} días`;
  if (d === 1) return h ? `Cierra en 1 día y ${h} h` : 'Cierra en 1 día';
  if (h) return mm ? `Cierra en ${h} h ${mm} min` : `Cierra en ${h} h`;
  return `Cierra en ${mm} min`;
}

/**
 * Cómo va el pronóstico mientras se juega: los puntos que sumaría si terminara así. null si no hay marcador o no se
 * está jugando. Mismas reglas que `prodeScore`.
 */
export function prodeLive(pred, m) {
  if (!pred || m?.status !== 'in' || m.home.score == null || m.away.score == null) return null;
  return prodeScore(pred, { ...m, completed: true });
}

/** Los atajos del prode: marcadores para elegir de un toque, como `{ v, r }`. No se elige ninguno de entrada. */
export const PRODE_QUICK = [
  { v: 2, r: 1 }, { v: 1, r: 0 }, { v: 1, r: 1 }, { v: 0, r: 0 }, { v: 0, r: 1 }, { v: 1, r: 2 },
];

/**
 * Ids de los jugadores que (probablemente) no pueden jugar el partido `m`: los de players.json › discipline con roja
 * o con el ciclo de amarillas cumplido en el mismo torneo. Es una estimación (la sanción la define el Tribunal).
 */
export function suspendedFor(discipline, m) {
  if (!m) return new Map();
  const label = tournamentOf(m).label;
  return new Map((discipline ?? []).filter((d) => (d.kind === 'roja' || d.kind === 'amarillas') && d.tournament === label).map((d) => [d.id, d]));
}

/** Aciertos del once: `picked` = ids elegidos; `game` = partido de games.json. null si el partido no está. */
export function onceScore(picked, game) {
  if (!game || !picked?.length) return null;
  const starters = game.players.filter((p) => p.s);
  if (!starters.length) return null;
  const set = new Set(picked);
  const hits = starters.filter((p) => set.has(p.id));
  return { hits: hits.length, total: starters.length, hitIds: new Set(hits.map((p) => p.id)), starters };
}

/** Las líneas de la cancha, del arco hacia arriba: arquero, defensores, volantes y delanteros (puestos de ESPN). */
export const ONCE_LINES = ['G', 'D', 'M', 'F'];

/**
 * El once repartido en líneas: `list` = jugadores con `id` (en el orden en que se eligieron o en que formó ESPN);
 * `posOf(id)` = su puesto (G, D, M o F). Sin puesto conocido (un jugador que ya no está en el plantel) va al medio.
 */
export function onceLines(list, posOf) {
  const lines = Object.fromEntries(ONCE_LINES.map((k) => [k, []]));
  for (const p of list ?? []) lines[ONCE_LINES.includes(posOf(p.id)) ? posOf(p.id) : 'M'].push(p);
  return lines;
}

/** La formación de las líneas, sin el arquero: «4-3-3». Vacía si no hay jugadores de campo. */
export const onceFormation = (lines) => ['D', 'M', 'F'].map((k) => lines[k].length).filter(Boolean).join('-');

/** Avisos del once armado (no impiden nada): sin arquero o con más de uno. Solo con el once completo. */
export function onceWarnings(lines) {
  const total = ONCE_LINES.reduce((n, k) => n + lines[k].length, 0);
  if (total < ONCE_SIZE) return [];
  if (!lines.G.length) return ['No elegiste arquero.'];
  if (lines.G.length > 1) return [`Elegiste ${lines.G.length} arqueros.`];
  return [];
}

/**
 * El último once que puso Vélez (games.json), para usarlo de base: `{ game, ids }` con los titulares que siguen en el
 * plantel (`inRoster` = Set de ids). null si no hay partidos con titulares.
 */
export function onceLast(games, inRoster) {
  const last = [...(games ?? [])].filter((g) => g.players?.some((p) => p.s)).sort((a, b) => Date.parse(b.date) - Date.parse(a.date))[0];
  if (!last) return null;
  const ids = last.players.filter((p) => p.s).map((p) => p.id).filter((id) => !inRoster || inRoster.has(id));
  return { game: last, ids };
}

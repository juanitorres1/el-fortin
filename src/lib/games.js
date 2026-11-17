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

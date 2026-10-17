// Prode y «Adiviná el once»: cuentas puras (lo que eligió cada hincha se guarda en su navegador, ver lib/storage.js).
import { velezView } from './espn.js';

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

/** Aciertos del once: `picked` = ids elegidos; `game` = partido de games.json. null si el partido no está. */
export function onceScore(picked, game) {
  if (!game || !picked?.length) return null;
  const starters = game.players.filter((p) => p.s);
  if (!starters.length) return null;
  const set = new Set(picked);
  const hits = starters.filter((p) => set.has(p.id));
  return { hits: hits.length, total: starters.length, hitIds: new Set(hits.map((p) => p.id)), starters };
}

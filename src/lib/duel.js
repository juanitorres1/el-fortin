// «Mano a Mano»: 10 duelos por día entre dos rivales de Vélez («¿a quién le ganó más veces?»). Los números salen
// del historial completo (1919 hasta hoy), resumido por rival en data/generated/duelos.json (lo escribe el deploy).
import { headToHead, teamLogo } from './espn.js';
import { seeded } from './daily.js';

export const DUEL_SIZE = 10;
const MIN_PJ = 12; // lo que guarda duelos.json
const MIN_DUEL_PJ = 20; // rivales con historia: con menos partidos el duelo es una lotería

export const DUEL_STATS = {
  g: { text: '¿A quién le ganó más veces Vélez?', unit: ['triunfo', 'triunfos'] },
  gf: { text: '¿A quién le hizo más goles Vélez?', unit: ['gol', 'goles'] },
  pj: { text: '¿Contra quién jugó más partidos Vélez?', unit: ['partido', 'partidos'] },
  p: { text: '¿Contra quién perdió más veces Vélez?', unit: ['derrota', 'derrotas'] },
  e: { text: '¿Con quién empató más veces Vélez?', unit: ['empate', 'empates'] },
};

/** El historial resumido por rival, sin los partidos: lo que guarda duelos.json. `matches` = todos los partidos. */
export function duelRows(matches) {
  return headToHead(matches).filter((r) => r.pj >= MIN_PJ).map((r) => ({ id: r.id, name: r.name, pj: r.pj, g: r.g, e: r.e, p: r.p, gf: r.gf, gc: r.gc }));
}

/**
 * Los duelos de un día: los mismos para todos y cada vez más parejos (en el primero un número duplica al otro; en
 * el último la diferencia es de un 10 %). Nunca hay empate. Un rival aparece a lo sumo dos veces por día.
 * Devuelve [{ stat, text, a, b, answer: 'a' | 'b' }] con a y b = { id, name, logo, value, pj }.
 */
export function dailyDuels(rows, day, size = DUEL_SIZE) {
  const list = (rows ?? []).filter((r) => r.pj >= MIN_DUEL_PJ);
  if (list.length < 6) return [];
  const rand = seeded('duelo', day);
  const stats = Object.keys(DUEL_STATS);
  const used = new Map();
  const pairs = new Set();
  const out = [];
  const side = (r, stat) => ({ id: r.id, name: r.name, logo: /^\d+$/.test(r.id) ? teamLogo(r.id) : null, value: r[stat], pj: r.pj });
  for (let i = 0; i < size; i++) {
    // Qué tan parejo: el menor es entre `lo` y `hi` veces el mayor.
    const hi = 0.5 + (0.42 * i) / Math.max(1, size - 1);
    const lo = hi - 0.25;
    let found = null;
    for (let tries = 0; tries < 400 && !found; tries++) {
      const band = tries < 300 ? [lo, hi] : [0.2, 0.95]; // si no aparece ninguno en la franja, cualquiera que no empate
      const stat = stats[Math.floor(rand() * stats.length)];
      const a = list[Math.floor(rand() * list.length)];
      const b = list[Math.floor(rand() * list.length)];
      const [min, max] = [Math.min(a[stat], b[stat]), Math.max(a[stat], b[stat])];
      const key = [stat, ...[a.id, b.id].sort()].join('|');
      if (a.id === b.id || min === max || max < 5 || min / max < band[0] || min / max > band[1]) continue;
      if (pairs.has(key) || (used.get(a.id) ?? 0) >= 2 || (used.get(b.id) ?? 0) >= 2) continue;
      pairs.add(key);
      for (const r of [a, b]) used.set(r.id, (used.get(r.id) ?? 0) + 1);
      found = { stat, text: DUEL_STATS[stat].text, a: side(a, stat), b: side(b, stat), answer: a[stat] > b[stat] ? 'a' : 'b' };
    }
    if (found) out.push(found);
  }
  return out;
}

/** «54 triunfos», «1 gol»: el número con su unidad. */
export function duelUnit(stat, n) {
  const [one, many] = DUEL_STATS[stat]?.unit ?? ['', ''];
  return `${n} ${n === 1 ? one : many}`;
}

// Cómo se dice cada número en una frase: [verbo, preposición] («le ganó 54 veces a River»).
const SAY = {
  g: (n) => [`le ganó ${n} ${n === 1 ? 'vez' : 'veces'}`, 'a'],
  gf: (n) => [`le hizo ${duelUnit('gf', n)}`, 'a'],
  pj: (n) => [`jugó ${duelUnit('pj', n)}`, 'con'],
  p: (n) => [`perdió ${n} ${n === 1 ? 'vez' : 'veces'}`, 'con'],
  e: (n) => [`empató ${n} ${n === 1 ? 'vez' : 'veces'}`, 'con'],
};

/**
 * La respuesta de un duelo en una frase, el mayor primero: «Vélez le ganó 54 veces a River Plate y 49 a Boca Juniors.»
 * La usan el veredicto en pantalla y el lector de pantalla.
 */
export function duelSentence(d) {
  const [top, low] = d.answer === 'a' ? [d.a, d.b] : [d.b, d.a];
  const [verb, prep] = SAY[d.stat](top.value);
  return `Vélez ${verb} ${prep} ${top.name} y ${low.value} ${prep} ${low.name}.`;
}

/** Link al historial completo contra un rival (la página lee ?rival=). */
export const rivalHref = (id) => `historial.html?rival=${encodeURIComponent(id)}`;

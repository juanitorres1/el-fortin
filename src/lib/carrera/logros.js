// Modo Carrera · logros (la vitrina del jugador) y partidos grandes. Lógica pura: cada logro se revisa al cerrar un
// partido o un torneo y queda guardado para siempre en `state.logros` ({ id: número de torneo en que se logró }).
import { norm } from '../daily.js';

/** Rivales que convocan más gente (los grandes y los de siempre en el oeste y el sur porteño). Por nombre de ESPN. */
const BIG = new Set(['river plate', 'boca juniors', 'san lorenzo', 'racing club', 'independiente', 'huracan']);
export const isBigMatch = (rival) => BIG.has(norm(rival?.name ?? ''));

/**
 * Los logros. `match` se revisa al cerrar cada partido (con lo que pasó en él) y `torneo`, al cerrar el torneo.
 * `ctx` del partido: { side, goals, assists, rating, big, kinds: [{ type, kind, choice, sub }], fans, saves, clean }.
 */
export const LOGROS = [
  { id: 'debut', icon: '👕', title: 'Debut', desc: 'Jugá tu primer partido en Primera.', match: (c) => c.side === 'primera' },
  { id: 'primer-gol', icon: '⚽', title: 'Primer grito', desc: 'Hacé tu primer gol en Primera.', match: (c) => c.side === 'primera' && c.goals > 0 },
  { id: 'doblete', icon: '✌️', title: 'Doblete', desc: 'Hacé 2 goles en un partido de Primera.', match: (c) => c.side === 'primera' && c.goals >= 2 },
  { id: 'hat-trick', icon: '🎩', title: 'Hat-trick', desc: 'Hacé 3 goles en un partido de Primera.', match: (c) => c.side === 'primera' && c.goals >= 3 },
  { id: 'asistidor', icon: '🧭', title: 'Asistidor', desc: 'Da 2 asistencias en un partido de Primera.', match: (c) => c.side === 'primera' && c.assists >= 2 },
  { id: 'golazo', icon: '🚀', title: 'Golazo', desc: 'Hacé un gol de afuera del área.', match: (c) => c.kinds.some((k) => k.type === 'remate' && k.sub === 'afuera' && k.kind === 'gol') },
  { id: 'comba', icon: '🌀', title: 'Comba perfecta', desc: 'Hacé un gol de tiro libre.', match: (c) => c.kinds.some((k) => k.type === 'remate' && k.sub === 'libre' && k.kind === 'gol') },
  { id: 'cano', icon: '🪄', title: 'Caño', desc: 'Tirá un caño que salga bien.', match: (c) => c.kinds.some((k) => k.type === 'gambeta' && k.choice === 'cano' && k.kind === 'gambeta') },
  { id: 'figura', icon: '⭐', title: 'Figura', desc: 'Sacá 9 o más de puntaje.', match: (c) => c.rating >= 9 },
  { id: 'grande', icon: '🔥', title: 'Partido grande', desc: 'Hacé un gol en un partido grande.', match: (c) => c.big && c.side === 'primera' && c.goals > 0 },
  { id: 'penal', icon: '🥅', title: 'Sangre fría', desc: 'Meté tu penal en una definición.', match: (c) => c.kinds.some((k) => k.type === 'penal' && k.kind === 'gol') },
  { id: 'muralla', icon: '🧤', title: 'Muralla', desc: 'Atajá 3 remates en un partido de Primera.', match: (c) => c.side === 'primera' && (c.saves ?? 0) >= 3 },
  { id: 'manos', icon: '🖐️', title: 'Manos de oro', desc: 'Atajá un penal en una definición.', match: (c) => c.kinds.some((k) => k.type === 'atajada' && k.sub === 'penal' && k.kind === 'tapada') },
  { id: 'valla', icon: '🔒', title: 'Valla invicta', desc: 'Terminá un partido de Primera sin goles en contra (arquero o defensor).', match: (c) => c.side === 'primera' && !!c.clean },
  { id: 'contra', icon: '🏃', title: 'De contra', desc: 'Recuperá una pelota que termine en gol de Vélez.', match: (c) => c.kinds.some((k) => k.type === 'quite' && k.kind === 'contra') },
  { id: 'idolo', icon: '📣', title: 'Ídolo', desc: 'Llegá a 80 hinchas.', match: (c) => c.fans >= 80 },
  { id: 'goleador', icon: '👟', title: 'Goleador', desc: 'Hacé 10 goles en Primera en un torneo.', torneo: (t) => t.stats.g >= 10 },
  { id: 'titular', icon: '🧱', title: 'Indiscutido', desc: 'Sé titular en 10 partidos de un torneo.', torneo: (t) => t.stats.tit >= 10 },
  { id: 'metas', icon: '🎯', title: 'Cumplidor', desc: 'Cumplí todas las metas de un torneo.', torneo: (t, x) => x.goalsDone > 0 && x.goalsDone === x.goalsTotal },
  { id: 'ideal', icon: '🌟', title: 'Equipo ideal', desc: 'Entrá en el equipo ideal de un torneo (promedio 7 o más en 8 partidos de Primera).', torneo: (t, x) => !!x.ideal },
  { id: 'campeon', icon: '🏆', title: 'Campeón', desc: 'Salí campeón con Vélez.', torneo: (t, x) => x.result === 'Campeón' },
  // Se gana al elegir quedarse ante la oferta del exterior (career.js › chooseEvent).
  { id: 'capitan', icon: '©️', title: 'Capitán', desc: 'Recibí la cinta de capitán (25 partidos de titular y 50 hinchas).', special: true },
  { id: 'leal', icon: '💙', title: 'Corazón de Vélez', desc: 'Rechazá una oferta de Europa para quedarte.', special: true },
];

/** Los logros nuevos de un partido (ids), sin los que ya tenía. */
export function matchLogros(have, ctx) {
  return LOGROS.filter((l) => l.match && !have[l.id] && l.match(ctx)).map((l) => l.id);
}

/** Los logros nuevos al cerrar un torneo (ids). `extra` = { result, goalsDone, goalsTotal, ideal }. */
export function torneoLogros(have, torneo, extra) {
  return LOGROS.filter((l) => l.torneo && !have[l.id] && l.torneo(torneo, extra)).map((l) => l.id);
}

export const logroOf = (id) => LOGROS.find((l) => l.id === id);

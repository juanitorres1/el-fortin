// Modo Carrera · lo que pasa fuera de la cancha (como en los juegos de carrera): eventos de la semana con una
// decisión y metas del torneo. Lógica pura: los efectos son fijos (sin azar después de elegir) y quedan en el texto.
import { ATTR_CAP, ROLE_AT, clamp } from './player.js';

/** Eventos posibles. `fx`: fans, dt y energy suman o restan; remate, pase, velocidad y fisico suben el atributo. */
export const EVENTS = [
  {
    id: 'nota', text: 'Un periodista te pide una nota a la salida del entrenamiento.',
    options: [
      { label: 'Dar la nota', fx: { fans: 4, energy: -5 }, res: 'Saliste en todos lados: los hinchas te conocen un poco más.' },
      { label: 'Pasar de largo', fx: { energy: 3 }, res: 'Te fuiste a descansar.' },
    ],
  },
  {
    id: 'extra', text: 'El DT te ofrece quedarte después de hora a practicar definición.',
    options: [
      { label: 'Quedarme', fx: { remate: 1, energy: -12, dt: 2 }, res: 'Una hora más pateando al arco. El DT lo vio.' },
      { label: 'Irme a casa', fx: {}, res: 'Mañana será otro día.' },
    ],
  },
  {
    id: 'asado', text: 'Los más grandes del plantel organizan un asado.',
    options: [
      { label: 'Ir', fx: { dt: 3, energy: -6 }, res: 'Te integraste al grupo y el DT lo valora.' },
      { label: 'Descansar', fx: { energy: 8 }, res: 'Dormiste como nunca.' },
    ],
  },
  {
    id: 'clinica', text: 'Te invitan a una clínica con los chicos de las inferiores.',
    options: [
      { label: 'Ir', fx: { fans: 5, energy: -5 }, res: 'Los pibes no te soltaban. Los hinchas lo valoraron.' },
      { label: 'No puedo', fx: {}, res: 'Será la próxima.' },
    ],
  },
  {
    id: 'video', text: 'El cuerpo técnico te pasa videos del próximo rival.',
    options: [
      { label: 'Mirarlos', fx: { pase: 1, energy: -4 }, res: 'Aprendiste dónde se abren los espacios.' },
      { label: 'Dejarlo para después', fx: {}, res: 'Quedaron en el celular.' },
    ],
  },
  {
    id: 'gimnasio', text: 'El preparador físico te arma una rutina extra.',
    options: [
      { label: 'Hacerla', fx: { fisico: 1, energy: -10 }, res: 'Te dolió todo, pero valió la pena.' },
      { label: 'Hoy no', fx: { energy: 4 }, res: 'Guardaste piernas para el partido.' },
    ],
  },
  {
    id: 'viral', text: 'Un video tuyo gambeteando en la práctica se hizo viral.',
    options: [
      { label: 'Compartirlo', fx: { fans: 6, dt: -2 }, res: 'Explotaron las redes. Al DT no le gustó tanto.' },
      { label: 'Perfil bajo', fx: { dt: 2 }, res: 'El DT valoró tu humildad.' },
    ],
  },
  {
    id: 'pique', text: 'Un ex velocista se ofrece a enseñarte a arrancar más rápido.',
    options: [
      { label: 'Aceptar', fx: { velocidad: 1, energy: -8 }, res: 'Ahora salís como una flecha.' },
      { label: 'No, gracias', fx: {}, res: 'Seguís con tu rutina.' },
    ],
  },
  {
    // Solo para un jugador que se hizo un nombre. Irse no es una opción: el juego es una carrera en Vélez.
    id: 'oferta', text: 'Un club de Europa ofrece el triple de tu sueldo para llevarte.',
    when: (p) => p.dt >= 70 && (p.fans ?? 0) >= 40,
    options: [
      { label: 'Me quedo en Vélez', fx: { fans: 8, dt: 2 }, res: 'La tribuna lo cantó toda la semana.' },
      { label: 'Pedir un aumento', fx: { raise: 0.25, dt: -3 }, res: 'Vélez te mejoró el contrato. Algunos no lo vieron con buenos ojos.' },
    ],
  },
];

const ATTR_KEYS = ['remate', 'pase', 'velocidad', 'fisico'];
export const EVENT_CHANCE = 0.4;

/**
 * Elige el evento de la semana con un generador con semilla: null si no hay (o si es la primera semana). Los que
 * tienen `when` solo salen si el jugador cumple la condición.
 */
export function pickEvent(rand, firstWeek, player) {
  if (firstWeek || rand() >= EVENT_CHANCE) return null;
  const pool = EVENTS.filter((e) => !e.when || (player && e.when(player)));
  return pool[Math.floor(rand() * pool.length)];
}

/** Aplica los efectos de una opción al jugador (no lo modifica: devuelve uno nuevo). `raise` suma al multiplicador del sueldo. */
export function applyFx(player, fx) {
  const p = { ...player, attrs: { ...player.attrs } };
  for (const [k, v] of Object.entries(fx)) {
    if (ATTR_KEYS.includes(k)) p.attrs[k] = clamp(p.attrs[k] + v, 1, Math.max(ATTR_CAP, p.attrs[k]));
    else if (k === 'raise') p.raise = Math.round(((p.raise ?? 1) + v) * 100) / 100;
    else if (k in p) p[k] = clamp(p[k] + v, 0, 100);
  }
  return p;
}

/** Texto corto de los efectos («+1 Remate · −12 energía»), para mostrarlo en el botón. */
export function fxText(fx) {
  const names = { fans: 'hinchas', dt: 'DT', energy: 'energía', remate: 'Remate', pase: 'Pase', velocidad: 'Velocidad', fisico: 'Físico' };
  return Object.entries(fx).map(([k, v]) => (k === 'raise' ? `+${Math.round(v * 100)} % de sueldo` : `${v > 0 ? '+' : '−'}${Math.abs(v)} ${names[k]}`)).join(' · ') || 'sin efecto';
}

// ---------- Metas del torneo ----------

/** Tres metas según cómo arranca el torneo: si está en la Reserva, debutar; si no, rendir en Primera. */
export function goalsFor(player) {
  const del = player.pos === 'del';
  if (player.dt < ROLE_AT.sub) {
    return [
      { key: 'pj', text: 'Jugá 3 partidos en Primera', target: 3 },
      { key: 'gt', text: 'Hacé 3 goles (Primera o Reserva)', target: 3 },
      { key: 'avg', text: 'Promediá 7 en Primera (3 partidos o más)', target: 7 },
    ];
  }
  return [
    { key: 'g', text: `Hacé ${del ? 6 : 3} goles en Primera`, target: del ? 6 : 3 },
    { key: 'a', text: `Da ${del ? 2 : 4} asistencias en Primera`, target: del ? 2 : 4 },
    { key: 'pj', text: 'Jugá 10 partidos en Primera', target: 10 },
  ];
}

export const GOAL_REWARD = 4; // hinchas por cada meta cumplida, al cerrar el torneo

/** Avance de cada meta con las estadísticas del torneo: [{ ...meta, value, done }]. */
export function goalProgress(torneo) {
  const st = torneo.stats;
  const avg = st.ratings.length ? Math.round((st.ratings.reduce((a, b) => a + b, 0) / st.ratings.length) * 10) / 10 : 0;
  return (torneo.goals ?? []).map((g) => {
    const value = { pj: st.pj, g: st.g, a: st.a, gt: st.g + st.res.g, avg }[g.key] ?? 0;
    const done = g.key === 'avg' ? st.ratings.length >= 3 && value >= g.target : value >= g.target;
    return { ...g, value, done };
  });
}

// Modo Carrera · la plata: sueldo por semana según el rol, premios por gol y por triunfo, y mejoras para invertir
// (como en los juegos de carrera). Montos de ficción, en miles de pesos. Nada de apuestas ni compras reales.
import { overall, roleOf } from './player.js';

const BASE = { reserva: 20, suplente: 60, titular: 120 }; // miles por semana
export const GOAL_PRIZE = 30;
export const WIN_PRIZE = 20;
export const CLEAN_PRIZE = 30; // valla invicta (arqueros y defensores)

/** Sueldo de la semana: sube con el rol, la media, los hinchas y los aumentos que haya pedido. */
export function salaryOf(player) {
  const lift = 1 + Math.max(0, overall(player) - 55) / 40;
  const fame = 1 + (player.fans ?? 0) / 200;
  return Math.round((BASE[roleOf(player)] * lift * fame * (player.raise ?? 1)) / 10) * 10;
}

/** Mejoras: se compran una vez y quedan para siempre. Los efectos los aplican player.js, match.js y career.js. */
export const PERKS = [
  { id: 'nutricionista', icon: '🥗', title: 'Nutricionista', desc: 'Entrenar te cansa menos: −5 de energía por sesión.', cost: 3000 },
  { id: 'botines', icon: '👟', title: 'Botines a medida', desc: 'Un poco más de chance de gol en cada remate.', cost: 5000 },
  { id: 'preparador', icon: '🏋️', title: 'Preparador físico personal', desc: 'Recuperás 6 de energía más por semana.', cost: 6000 },
  { id: 'kinesiologo', icon: '🩺', title: 'Kinesiólogo personal', desc: 'Te lesionás menos y volvés una semana antes.', cost: 7000 },
  { id: 'psicologo', icon: '🧠', title: 'Psicólogo deportivo', desc: 'Un mal partido te baja menos la confianza del DT.', cost: 8000 },
  { id: 'video', icon: '🎬', title: 'Analista de video', desc: 'La zona verde de la barra es un poco más ancha.', cost: 12000 },
  { id: 'casa', icon: '🏠', title: 'Casa en Liniers', desc: 'Vivís a cuadras del Amalfitani: +10 hinchas.', cost: 20000, fx: { fans: 10 } },
];

export const hasPerk = (player, id) => (player.perks ?? []).includes(id);
export const perkOf = (id) => PERKS.find((p) => p.id === id);

/** Plata en texto: «$ 3.450 mil» o «$ 1,2 M». */
export function money(n) {
  const v = Math.round(n ?? 0);
  if (Math.abs(v) >= 10000) return `$ ${(v / 1000).toLocaleString('es-AR', { maximumFractionDigits: 1 })} M`;
  return `$ ${v.toLocaleString('es-AR')} mil`;
}

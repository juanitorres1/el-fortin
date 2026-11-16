// Modo Carrera · el guardado: se guarda en el navegador (lib/storage.js, clave «carrera») y se puede pasar a otro
// dispositivo con un código. Cada guardado lleva `v`: si cambia la forma del estado, se agrega una migración acá.
import { SAVE_VERSION } from './career.js';

export const SAVE_KEY = 'carrera';
const PREFIX = 'FORTIN1:';

// Migraciones: MIGRATIONS[n] pasa un guardado de la versión n a la n + 1.
const MIGRATIONS = {};

/** Un guardado con la forma esperada (lo mínimo para dibujar sin romper). */
export function isCareer(s) {
  return !!s && typeof s === 'object' && s.v === SAVE_VERSION && typeof s.seed === 'number' && typeof s.velez === 'string'
    && !!s.player?.attrs && typeof s.player.name === 'string' && Array.isArray(s.torneo?.fixtures) && Array.isArray(s.torneo?.teams)
    && Array.isArray(s.history) && Array.isArray(s.news) && Array.isArray(s.mates);
}

/** Lleva un guardado viejo a la versión actual. null si no se puede (y la carrera arranca de cero). */
export function migrate(s) {
  if (!s || typeof s !== 'object' || !Number.isInteger(s.v)) return null;
  let cur = s;
  while (cur.v < SAVE_VERSION) {
    const step = MIGRATIONS[cur.v];
    if (!step) return null;
    cur = step(cur);
  }
  return isCareer(cur) ? cur : null;
}

/** Código para llevar la carrera a otro navegador (texto, se puede pegar en un mensaje). */
export function exportCode(state) {
  const bytes = new TextEncoder().encode(JSON.stringify(state));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return PREFIX + btoa(bin);
}

/** Lee un código de exportCode. null si no es válido. */
export function importCode(text) {
  try {
    const raw = String(text ?? '').replace(/\s+/g, '');
    if (!raw.startsWith(PREFIX)) return null;
    const bin = atob(raw.slice(PREFIX.length));
    const json = new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
    return migrate(JSON.parse(json));
  } catch {
    return null;
  }
}

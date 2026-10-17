// Estadio en 3D (Club › Estadio): la cuenta de los ángulos y los totales, sin React. El dibujo está en
// src/sections/Estadio3D.jsx. Plano con el norte arriba: x hacia el este, y hacia el sur.

/** Giro de cada lado respecto del norte (en grados, sentido horario como en la pantalla). */
export const SIDE_ANGLE = { norte: 0, este: 90, sur: 180, oeste: 270 };

/**
 * Giro de la escena para ver la cancha desde un lado: ese lado queda abajo, cerca de quien mira.
 * Con 0 se ve desde el sur (el norte queda al fondo). rotateZ gira en sentido horario: para traer el este (90°)
 * abajo (180°) hay que girar +90°, o sea 180° menos el ángulo del lado.
 */
export const viewFrom = (lado) => (540 - SIDE_ANGLE[lado]) % 360;

/** Dónde queda en pantalla un punto del plano (x, y) con la escena girada `angle` grados (para los tests). */
export function rotatePoint([x, y], angle) {
  const a = (angle * Math.PI) / 180;
  return [Math.round(x * Math.cos(a) - y * Math.sin(a)), Math.round(x * Math.sin(a) + y * Math.cos(a))];
}

/** El giro equivalente más cercano a `from` (para que la animación no dé la vuelta larga). */
export function nearestAngle(from, to) {
  const diff = ((((to - from) % 360) + 540) % 360) - 180;
  return from + diff;
}

/** El lado que se ve de frente (abajo) con la escena girada `angle` grados. */
export function sideInFront(angle) {
  const a = ((Math.round(angle / 90) * 90) % 360 + 360) % 360;
  return Object.keys(SIDE_ANGLE).find((k) => viewFrom(k) === a);
}

/** Capacidad de un sector (suma de sus niveles) y del estadio. */
export const sectorCapacity = (s) => (s.niveles ?? []).reduce((n, l) => n + (l.capacidad ?? 0), 0);
export const totalCapacity = (sectores) => (sectores ?? []).reduce((n, s) => n + sectorCapacity(s), 0);

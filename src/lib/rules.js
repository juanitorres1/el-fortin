// Reglas del fútbol argentino que el sitio no puede sacar de ESPN. Están todas acá, con el año para el que se
// revisaron: cuando empieza una temporada nueva, scripts/check-data.mjs abre un aviso para revisarlas y, mientras
// tanto, la página deja de marcar «Hoy descendería» (mejor no mostrar nada que mostrar algo mal).
// Lo que sí sale de ESPN y se adapta solo: cuántos clasifican a playoffs, los partidos que quedan y las fases.

/** Temporada para la que se revisó este archivo. */
export const RULES_YEAR = 2026;

/** Temporadas que cuentan para los promedios (la actual y las anteriores). */
export const AVERAGE_SEASONS = 3;

/** Torneos fuera de arg.1 en ESPN que cuentan para los promedios (fase de grupos, sin playoffs), por temporada. */
export const EXTRA_AVERAGE_PHASES = { 2024: ['arg.copa_lpf'] }; // Copa de la Liga 2024

/** Descenso 2026: el último de los promedios y el último de la tabla anual (si es el mismo, el anteúltimo de la anual). */
export const RELEGATION_NOTE =
  'Descienden el último de los promedios y el último de la tabla anual (si es el mismo equipo, el anteúltimo de la anual). Empates en zona de descenso: partido de desempate.';

/** ¿Las reglas de este archivo valen para la temporada `year`? */
export const rulesApply = (year) => year == null || year <= RULES_YEAR;

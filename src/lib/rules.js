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

/**
 * Cuadro de los playoffs 2026: los octavos por puesto en la zona («A1» = 1.º de la Zona A), en el orden del cuadro
 * (los dos primeros se cruzan en cuartos, los dos siguientes también, y así hasta la final). ESPN da los partidos
 * pero no el cuadro: se sacó de los cruces reales del Apertura 2026 (octavos, cuartos y semis) y los octavos del
 * Clausura 2026 coinciden. Si los partidos de ESPN no encajan acá, el cuadro se muestra sin líneas ni cruces futuros.
 */
export const PLAYOFF_SEEDS = [['A1', 'B8'], ['B4', 'A5'], ['B2', 'A7'], ['A3', 'B6'], ['B1', 'A8'], ['A4', 'B5'], ['A2', 'B7'], ['B3', 'A6']];

/** ¿Las reglas de este archivo valen para la temporada `year`? */
export const rulesApply = (year) => year == null || year <= RULES_YEAR;

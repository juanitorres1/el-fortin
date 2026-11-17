// Lo común de los juegos del partido (Prode y Adiviná el once): el próximo partido y cómo se nombra.
import { VELEZ_ID } from '../../lib/espn.js';
import { capitalize, fmt, nextMatch } from '../../lib/core.js';

// El próximo partido para pronosticar: el que sigue en pie (un postergado no cuenta) y todavía no empezó.
export const upcoming = (data) => {
  const m = data && nextMatch(data.fixture);
  return m && m.status !== 'in' ? m : undefined;
};

export const rivalOf = (m) => (m.home.id === VELEZ_ID ? m.away : m.home);
export const matchLabel = (m) => `${m.home.name} vs ${m.away.name}`;
export const whenLabel = (m) => `${capitalize(fmt.long.format(new Date(m.date)))}${m.timeValid ? ` · ${fmt.time.format(new Date(m.date))} h` : ''}`;

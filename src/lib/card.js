// Tarjetas para compartir (resultado y previa): qué texto lleva cada una. El dibujo en <canvas> está en
// src/components/ShareCard.jsx; acá queda la parte que se puede testear sin navegador.
import { VELEZ_ID, velezView } from './espn.js';

const TZ = 'America/Argentina/Buenos_Aires';
const dateFmt = new Intl.DateTimeFormat('es-AR', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' });
const timeFmt = new Intl.DateTimeFormat('es-AR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

const HEADLINE = { G: '¡Ganó Vélez!', E: 'Empate', P: 'Derrota' };

/** Goleadores de Vélez de un partido, desde el minuto a minuto (keyEvents): «Romero 23', 67' · Bou 80'». */
export function scorersLine(events) {
  const byName = new Map();
  for (const e of [...(events ?? [])].reverse()) {
    if (e.kind !== 'gol' || !e.velez || /^Penales:/.test(e.text)) continue;
    const name = e.text.match(/^Gol (?:de penal )?de (.+?)(?: \(|$)/)?.[1] ?? e.text.match(/^Gol en contra de (.+)$/)?.[1];
    if (!name) continue;
    const label = /en contra/.test(e.text) ? `${name} (en contra)` : name;
    byName.set(label, [...(byName.get(label) ?? []), e.minute].filter(Boolean));
  }
  return [...byName].map(([n, mins]) => `${n}${mins.length ? ` ${mins.join(', ')}` : ''}`).join(' · ');
}

/**
 * Tarjeta de un resultado. `extra` = { scorers, streak, position }: frases opcionales.
 * Devuelve { kind, kicker, headline, home, away, center, lines }.
 */
export function resultCard(m, { scorers, streak, position } = {}) {
  const { result } = velezView(m);
  const pens = m.home.pen != null && m.away.pen != null ? `Penales ${m.home.pen}-${m.away.pen}` : null;
  return {
    kind: 'resultado',
    kicker: [m.comp, m.round?.replace('Torneo ', '')].filter(Boolean).join(' · '),
    headline: HEADLINE[result] ?? 'Final',
    home: m.home,
    away: m.away,
    center: `${m.home.score ?? 0}-${m.away.score ?? 0}`,
    lines: [scorers && `Goles: ${scorers}`, pens, streak, position].filter(Boolean),
  };
}

/** Tarjeta de la previa. `rf` = historial con el rival (facts.json); `streak` = racha de Vélez. */
export function previaCard(m, { rf, streak } = {}) {
  const d = new Date(m.date);
  const rival = m.home.id === VELEZ_ID ? m.away : m.home;
  return {
    kind: 'previa',
    kicker: [m.comp, m.round?.replace('Torneo ', '')].filter(Boolean).join(' · '),
    headline: 'Juega Vélez',
    home: m.home,
    away: m.away,
    center: 'vs',
    when: `${cap(dateFmt.format(d))}${m.timeValid ? ` · ${timeFmt.format(d)} h` : ''}`,
    lines: [
      m.venue,
      // La racha con el rival va entre paréntesis: suelta («Perdió los últimos 2») no se entiende de quién habla.
      rf && `Historial con ${rival.name}: ${rf.g} G · ${rf.e} E · ${rf.p} P${rf.streak ? ` (${rf.streak.charAt(0).toLowerCase()}${rf.streak.slice(1)})` : ''}`,
      streak,
    ].filter(Boolean),
  };
}

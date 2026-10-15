// Calendario de partidos en formato iCalendar (RFC 5545). Lo genera scripts/update-data.mjs cada hora en
// data/generated/velez.ics: quien se suscribe ve los cambios de horario sin hacer nada. Solo Node (usa Buffer).
import { velezView } from '../src/lib/espn.js';

export const SITE_URL = 'https://juanitorres1.github.io/el-fortin/';
const TZ = 'America/Argentina/Buenos_Aires';
const MATCH_MINUTES = 120; // 90 + entretiempo + descuentos

// Texto: \ ; , y saltos de línea se escapan (RFC 5545 §3.3.11).
const text = (s) => String(s ?? '').replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\r?\n/g, '\\n');

// Líneas de más de 75 octetos se pliegan con CRLF + espacio, sin cortar un carácter UTF-8 al medio (§3.1).
export function fold(line) {
  const out = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const n = Buffer.byteLength(ch);
    if (bytes + n > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = '';
      bytes = 0;
    }
    cur += ch;
    bytes += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}

const utc = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
// Fecha en la Argentina («20261017»): un partido a las 22 h de Argentina es el día siguiente en UTC.
const localDate = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d).replace(/-/g, '');

function event(m, stamp) {
  const { velezHome, velez, rival } = velezView(m);
  const [home, away] = velezHome ? [velez, rival] : [rival, velez];
  const start = new Date(m.date);
  const summary = m.completed && home.score != null ? `${home.name} ${home.score}-${away.score} ${away.name}` : `${home.name} vs ${away.name}`;
  const round = m.round && !m.round.includes(m.comp) ? ` · ${m.round.replace('Torneo ', '')}` : '';
  const desc = [`${m.comp}${round}`, m.timeValid ? null : 'Horario a confirmar.', `Fixture y tablas: ${SITE_URL}partidos.html`].filter(Boolean).join('\n');
  const when = m.timeValid
    ? [`DTSTART:${utc(start)}`, `DTEND:${utc(new Date(start.getTime() + MATCH_MINUTES * 6e4))}`]
    : (() => {
        // Sin horario: evento de todo el día, en la fecha argentina.
        const day = localDate(start);
        const next = localDate(new Date(start.getTime() + 864e5));
        return [`DTSTART;VALUE=DATE:${day}`, `DTEND;VALUE=DATE:${next}`];
      })();
  return [
    'BEGIN:VEVENT',
    `UID:espn-${m.id}@el-fortin`,
    `DTSTAMP:${stamp}`,
    ...when,
    `SUMMARY:${text(summary)}`,
    `DESCRIPTION:${text(desc)}`,
    m.venue ? `LOCATION:${text(m.venue)}` : null,
    `URL:${SITE_URL}partidos.html`,
    m.completed || m.timeValid ? 'STATUS:CONFIRMED' : 'STATUS:TENTATIVE',
    'TRANSP:TRANSPARENT', // no marca al usuario como ocupado
    'END:VEVENT',
  ].filter(Boolean);
}

/** Calendario con los partidos dados (próximos y jugados). `now` solo para tests. */
export function buildCalendar(matches, now = new Date()) {
  const stamp = utc(now);
  const seen = new Set();
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//El Fortin//Partidos de Velez//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Vélez · El Fortín',
    'X-WR-CALDESC:Partidos de Vélez Sarsfield (sitio de hinchas\\, no oficial). Datos de ESPN.',
    `X-WR-TIMEZONE:${TZ}`,
    'REFRESH-INTERVAL;VALUE=DURATION:PT6H',
    'X-PUBLISHED-TTL:PT6H',
  ];
  for (const m of [...matches].sort((a, b) => new Date(a.date) - new Date(b.date))) {
    if (seen.has(m.id) || !m.date) continue;
    seen.add(m.id);
    lines.push(...event(m, stamp));
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(fold).join('\r\n')}\r\n`;
}

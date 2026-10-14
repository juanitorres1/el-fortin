// Noticias: lo que usan tanto el navegador (js/app.js) como el deploy (scripts/news.mjs).
import { velezView } from './espn.js';

export const NEWS_DAYS = 7;
export const OFFICIAL_SITE = 'https://velez.com.ar';

/** Solo se linkean notas de la web oficial (los datos vienen de afuera: no se confía en cualquier URL). */
export const isOfficialNoteUrl = (url) => /^https:\/\/velez\.com\.ar\/[a-z-]+\/notas\/\d{4}\/\d{2}\/\d{2}\/[\w-]+$/.test(url ?? '');

/** Imágenes: solo las que sirve la web oficial (se muestran directo desde velez.com.ar, con link a la nota). */
export const isOfficialImageUrl = (url) => /^https:\/\/velez\.com\.ar\/img\/[\w/.-]+\.(?:jpe?g|png|webp|gif)$/i.test(url ?? '');

/** Miniaturas generadas por el deploy (data/generated/img/news/…) o, si no hubo ImageMagick, la imagen oficial. */
export const isNewsImage = (src) => /^data\/generated\/img\/news\/[a-f0-9]{16}-[tf]\.jpg$/.test(src ?? '') || isOfficialImageUrl(src);

const TZ = 'America/Argentina/Buenos_Aires';

/** «Hoy», «Ayer», «Hace 3 días» o «13/10». Solo días: la hora que publica la web no aclara la zona horaria. */
export function relativeDay(isoDate, now = new Date()) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(now);
  const days = Math.round((Date.parse(today) - Date.parse(isoDate)) / 864e5);
  if (days <= 0) return 'Hoy';
  if (days === 1) return 'Ayer';
  if (days < 7) return `Hace ${days} días`;
  return isoDate.slice(5).split('-').reverse().join('/');
}
const dayParts = new Intl.DateTimeFormat('es-AR', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'numeric' });
const timeFmt = new Intl.DateTimeFormat('es-AR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
/** «sábado 17/10» (Intl da «17-10» en es-AR). */
export function dayLabel(date) {
  const p = Object.fromEntries(dayParts.formatToParts(date).map((x) => [x.type, x.value]));
  return `${p.weekday} ${p.day}/${p.month}`;
}

/** Último resultado (si fue en la última semana) y próximo partido, armados con datos de ESPN, sin IA. */
export function matchFacts(fixture, results, now = new Date()) {
  const facts = [];
  const last = results.filter((m) => m.completed && Date.parse(m.date) >= now - NEWS_DAYS * 864e5).at(-1);
  if (last) {
    const { velez, rival, result } = velezView(last);
    const verb = { G: 'le ganó', E: 'empató', P: 'perdió' }[result] ?? 'jugó';
    // Como se dice en Argentina: el resultado del ganador primero («perdió 2-0 con Lanús»).
    const score = `${Math.max(velez.score, rival.score)}-${Math.min(velez.score, rival.score)}`;
    const vs = result === 'G' ? `a ${rival.name}` : `con ${rival.name}`;
    facts.push({ tipo: 'resultado', texto: `Último resultado: Vélez ${verb} ${score} ${vs} (${last.comp}, ${dayLabel(new Date(last.date))}).` });
  }
  const next = fixture.find((m) => !m.completed && m.status !== 'in');
  if (next) {
    const { velezHome, rival } = velezView(next);
    const when = `${dayLabel(new Date(next.date))}${next.timeValid ? ` a las ${timeFmt.format(new Date(next.date))}` : ''}`;
    facts.push({ tipo: 'proximo', texto: `Próximo partido: ${velezHome ? 'Vélez vs.' : 'visita a'} ${rival.name}, ${when}${next.venue ? `, en ${next.venue}` : ''} (${next.comp}).` });
  }
  return facts;
}

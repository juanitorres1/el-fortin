// Noticias del club estilo Google Noticias (titulares de velez.com.ar) y el resumen de los últimos 7 días hecho por IA.
import { isNewsImage, isOfficialNoteUrl, newsPhotoSources, relativeDay } from '../lib/news.js';
import { capitalize, fmt } from '../lib/core.js';
import { useNow } from '../hooks/data.js';
import { ExtLink, Skeletons } from '../components/ui.jsx';

const SUMMARY_MAX_AGE_DAYS = 10; // si el resumen dejó de generarse (falló o no hubo notas), no mostrar uno viejo como si fuera de esta semana
const MAX_CARDS = 7; // destacada (2×2) + 6: llena la grilla de 4 columnas en escritorio
const FEATURED_SECTIONS = ['futbol', 'columnadt', 'socios', 'club']; // la destacada sale de acá si hay
const SECTION_NAMES = {
  futbol: 'Fútbol', columnadt: 'Palabra del DT', socios: 'Socios', club: 'Club', reserva: 'Reserva', amateur: 'Juveniles',
  senior: 'Senior', entrenamiento: 'Entrenamiento', acreditaciones: 'Prensa', rrpp: 'Eventos', 'velez-social': 'Vélez Social',
  vmasculino: 'Vóley', vfemenino: 'Vóley', bmasculino: 'Básquet', bfemenino: 'Básquet', futbolfemenino: 'Fútbol femenino',
};
const sectionName = (s) => SECTION_NAMES[s] ?? capitalize(s.replace(/-/g, ' '));
const shortDate = (iso) => iso.slice(5).split('-').reverse().join('/'); // «2026-10-13» → «13/10»

// Ancho aproximado de la foto: columna de la grilla (o dos, la destacada) en escritorio, todo el ancho en celular.
const SIZES = { card: '(min-width: 48rem) 20rem, 100vw', featured: '(min-width: 48rem) 40rem, 100vw' };

function NewsPhoto({ h, featured }) {
  const s = newsPhotoSources(h);
  if (!s) return null;
  const sizes = featured ? SIZES.featured : SIZES.card;
  return (
    <picture className="nw-pic">
      {s.webp && <source type="image/webp" srcSet={s.webp} sizes={sizes} />}
      <img
        className="nw-img" src={s.src} srcSet={s.srcSet ?? undefined} sizes={s.srcSet ? sizes : undefined} alt="" width="720" height="405"
        loading={featured ? 'eager' : 'lazy'} decoding="async"
        onError={(e) => e.currentTarget.parentElement.remove()}
      />
    </picture>
  );
}

function NewsCard({ h, featured, now }) {
  return (
    <ExtLink className={`nw-card${featured ? ' nw-featured' : ''}`} href={h.url}>
      <NewsPhoto h={h} featured={featured} />
      <div className="nw-body">
        <p className="kicker">{sectionName(h.section)} <span className="nw-time">· {relativeDay(h.date, new Date(now))}</span></p>
        <h3 className="nw-title">{h.title}</h3>
        {featured && h.lead && <p className="nw-lead">{h.lead}</p>}
        <span className="sr-only">Abre velez.com.ar en otra pestaña</span>
      </div>
    </ExtLink>
  );
}

function Summary({ summary, now }) {
  const ageDays = summary ? (now - Date.parse(summary.generatedAt)) / 864e5 : Infinity;
  const points = (summary?.points ?? []).filter((p) => isOfficialNoteUrl(p.url));
  if (!(ageDays <= SUMMARY_MAX_AGE_DAYS && points.length)) return null;
  return (
    <details className="news-summary">
      <summary>
        <span className="ai-badge">IA</span> Resumen de la semana{' '}
        <span className="muted">del {shortDate(summary.period.from)} al {shortDate(summary.period.to)}</span>
      </summary>
      <ul className="summary-points">
        {points.map((p) => (
          <li key={p.url + p.texto}>
            <p>{p.origen === 'nota' && <span className="summary-src">Texto de la nota<span className="sr-only">: </span></span>}{p.texto}</p>
            <p className="summary-meta">
              {/^\d{4}-\d{2}-\d{2}$/.test(p.fecha ?? '') && <span className="muted">{shortDate(p.fecha)} · </span>}
              <ExtLink className="summary-link" href={p.url}>
                Ver la nota<span className="sr-only">{p.titulo ? `: ${p.titulo}` : ''} (abre velez.com.ar en otra pestaña)</span>
              </ExtLink>
            </p>
          </li>
        ))}
      </ul>
      <p className="ai-note">
        Lo escribe una IA ({summary.model}) a partir de las notas oficiales de la semana. Puede equivocarse: cada punto tiene su nota para
        chequearlo.{points.some((p) => p.origen === 'nota') && ' Los marcados «Texto de la nota» copian la bajada oficial: el punto de la IA no pasó el control de datos.'}{' '}
        Actualizado el {fmt.stamp.format(new Date(summary.generatedAt))}.
      </p>
    </details>
  );
}

/** `news` y `summary`: undefined mientras cargan, null si no hay. */
export function Noticias({ news, summary }) {
  const now = useNow();
  const headlines = (news?.headlines ?? []).filter((h) => isOfficialNoteUrl(h.url));
  const featured = headlines.find((h) => FEATURED_SECTIONS.includes(h.section) && isNewsImage(h.photo)) ?? headlines[0];
  const rest = headlines.filter((h) => h !== featured).slice(0, MAX_CARDS - 1);
  return (
    <section className="band band-gray" aria-labelledby="t-noticias">
      <div className="wrap">
        <div className="section-head">
          <h2 className="display" id="t-noticias">Noticias</h2>
          <ExtLink className="btn btn-outline" href="https://velez.com.ar/noticias">Todas en velez.com.ar</ExtLink>
        </div>
        <div className="news-grid">
          {news === undefined ? <Skeletons n={4} className="sk-card" />
            : featured ? [featured, ...rest].map((h, i) => <NewsCard key={h.url} h={h} featured={i === 0} now={now} />)
            : <p className="empty">No pudimos leer las notas del club. Mirá las novedades en <ExtLink href="https://velez.com.ar">velez.com.ar</ExtLink>.</p>}
        </div>
        <Summary summary={summary} now={now} />
      </div>
    </section>
  );
}

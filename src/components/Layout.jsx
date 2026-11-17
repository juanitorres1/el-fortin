// Encabezado, menú, banda de título y pie: iguales en todas las páginas, armados desde src/site.js.
import { useEffect } from 'react';
import { PAGES, SITE } from '../site.js';

function Icon({ parts }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {parts.map((p, i) => (typeof p === 'string' ? <path key={i} d={p} />
        : p.rect ? <rect key={i} x={p.rect[0]} y={p.rect[1]} width={p.rect[2]} height={p.rect[3]} rx={p.rect[4]} />
        : <circle key={i} cx={p.circle[0]} cy={p.circle[1]} r={p.circle[2]} />))}
    </svg>
  );
}

/** Banda azul con el título de la página y la muesca en V. */
export function PageBand({ title, children }) {
  return (
    <header className="page-band">
      <div className="wrap">
        <h1 className="page-title">{title}</h1>
        {children}
      </div>
    </header>
  );
}

/**
 * Página completa. `page` = clave de src/site.js (marca la sección en el menú). `band` = banda de título (opcional);
 * `mainClass` = clases del <main> (el Inicio usa bandas a todo el ancho y no lleva «wrap page»).
 */
export function Layout({ page, band = null, mainClass = 'wrap page', children }) {
  const info = PAGES.find((p) => p.key === page);
  const current = info?.parent ?? page;
  // Páginas que cambian según la query (jugador.html?id=…): el canonical lleva ese parámetro y nada más (ni utm ni
  // otros). Va en un efecto porque al dibujar no se puede leer `location` (hidratación). Lo leen los buscadores que
  // ejecutan JS; sin id no se pone (la página sin jugador elegido no es una ficha).
  useEffect(() => {
    if (!info?.query) return;
    const value = new URLSearchParams(location.search).get(info.query);
    let link = document.querySelector('link[rel="canonical"]');
    if (!value) return link?.remove();
    link ??= Object.assign(document.createElement('link'), { rel: 'canonical' });
    link.href = `${info.url}?${info.query}=${encodeURIComponent(value)}`;
    document.head.append(link);
  }, [info]);
  return (
    <>
      <a className="skip" href="#contenido">Saltar al contenido</a>
      <header className="topbar">
        <div className="wrap topbar-in">
          <a className="brand" href="./"><img src="assets/v.svg" alt="" width="28" height="28" /><span>{SITE.name}</span></a>
          <nav className="tabbar" aria-label="Secciones">
            {PAGES.filter((p) => p.nav).map((p) => (
              <a key={p.key} href={p.href} aria-current={p.key === current ? 'page' : undefined}>
                <Icon parts={p.icon} /><span>{p.label}</span>
              </a>
            ))}
          </nav>
        </div>
      </header>
      {band}
      <main id="contenido" className={mainClass}>{children}</main>
      <footer className="footer">
        <div className="wrap">
          <p><strong>{SITE.name}</strong> es un sitio de hinchas, no oficial. No está afiliado al Club Atlético Vélez Sarsfield.</p>
          <p className="muted">{SITE.sources}</p>
          <p className="muted">
            Privacidad: las visitas se cuentan con GoatCounter, sin cookies ni datos personales (solo cifras totales).
            Lo que guardás en los juegos queda en tu navegador.
          </p>
          <ul className="footer-links">
            <li><a href={`${SITE.repo}/issues/new`} target="_blank" rel="noopener">Reportar un error</a></li>
            <li><a href={SITE.repo} target="_blank" rel="noopener">Código en GitHub</a></li>
          </ul>
        </div>
      </footer>
    </>
  );
}

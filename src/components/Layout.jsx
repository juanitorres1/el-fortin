// Encabezado, menú, banda de título y pie: iguales en todas las páginas, armados desde src/site.js.
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
  return (
    <>
      <a className="skip" href="#contenido">Saltar al contenido</a>
      <header className="topbar">
        <div className="wrap topbar-in">
          <a className="brand" href="./"><img src="assets/v.svg" alt="" width="28" height="28" /><span>{SITE.name}</span></a>
          <nav className="tabbar" aria-label="Secciones">
            {PAGES.map((p) => (
              <a key={p.key} href={p.href} aria-current={p.key === page ? 'page' : undefined}>
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
        </div>
      </footer>
    </>
  );
}

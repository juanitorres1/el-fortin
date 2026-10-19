// Piezas chicas que se repiten en todas las páginas.
import { useState } from 'react';
import { RESULT_LABEL, sized } from '../lib/core.js';

/** Escudo gris con un signo de pregunta: el lugar de un equipo sin escudo (ESPN no los tiene a todos). */
function NoCrest({ size, className }) {
  return (
    <svg className={`${className} crest-none`} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 1.5 3 4.2v6.6c0 5.6 3.8 10 9 11.7 5.2-1.7 9-6.1 9-11.7V4.2z" fill="#b8bdc6" stroke="#1b1d21" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M9.4 9.3a2.7 2.7 0 1 1 3.9 2.4c-.8.4-1.3 1-1.3 1.9v.6" fill="none" stroke="#1b1d21" strokeWidth="1.9" strokeLinecap="round" />
      <rect x="11" y="16" width="2" height="2" fill="#1b1d21" />
    </svg>
  );
}

/** Escudo de un equipo. Si ESPN no lo tiene (sin `url`) o la imagen no carga, va el escudo gris. */
export function Crest({ url, size = 24, className = 'crest' }) {
  const [failed, setFailed] = useState(false);
  if (!url || failed) return <NoCrest size={size} className={className} />;
  return (
    <img
      className={className} src={sized(url, size)} alt="" width={size} height={size} loading="lazy" decoding="async"
      onError={() => setFailed(true)}
    />
  );
}

/** G / E / P con color y texto para lectores de pantalla. */
export function ResultBadge({ result, as: Tag = 'span' }) {
  if (!result) return null;
  return (
    <Tag className={`res res-${result}`} title={RESULT_LABEL[result]}>
      <span className="sr-only">{RESULT_LABEL[result]}</span>
      <span aria-hidden="true">{result}</span>
    </Tag>
  );
}

/** Placeholders con la forma del contenido mientras carga (`as` = li para listas). */
export function Skeletons({ n = 1, className = 'sk-row', as: Tag = 'div' }) {
  return Array.from({ length: n }, (_, i) => <Tag key={i} className={`skeleton ${className}`} aria-hidden="true" />);
}

/** Control segmentado: elegir tabla, zona o torneo. `options` = [{ value, label }]. */
export function Segmented({ options, value, onChange, label }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} className="seg" type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Frases cortas en lista (rachas, qué necesita para clasificar…). */
export function Lines({ items, className = 'previa-lines' }) {
  return (
    <ul className={className}>
      {items.map((l) => <li key={l}>{l}</li>)}
    </ul>
  );
}

/** Mensaje de lista vacía o de error. */
export function Empty({ children, as: Tag = 'p' }) {
  return <Tag className="empty">{children}</Tag>;
}

/** Link externo que abre en otra pestaña. */
export function ExtLink({ href, className, children }) {
  return <a className={className} href={href} target="_blank" rel="noopener">{children}</a>;
}

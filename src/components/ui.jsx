// Piezas chicas que se repiten en todas las páginas.
import { RESULT_LABEL, sized } from '../lib/core.js';

/** Escudo de un equipo (ESPN no tiene todos: si la imagen falla, queda el lugar vacío). */
export function Crest({ url, size = 24, className = 'crest' }) {
  if (!url) return null;
  return (
    <img
      className={className} src={sized(url, size)} alt="" width={size} height={size} loading="lazy" decoding="async"
      onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }}
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

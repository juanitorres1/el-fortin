// Escudos para el historial 1931–2000: los equipos del dataset que no tienen id de ESPN (Atlanta, Ferro…) se buscan
// por nombre en las listas de equipos de ESPN de todas las categorías. Lo corre el deploy (scripts/update-data.mjs) y
// guarda data/generated/escudos.json; el historial y la previa cambian el id del dataset por el de ESPN, así el rival
// queda unido con sus partidos desde 2001 y con su escudo. Si no aparece, queda el escudo gris.

/** Siglas del dataset, escritas completas como las pone ESPN. */
const EXPAND = { mdp: 'mar del plata', rde: 'remedios de escalada', sde: 'santiago del estero', sj: 'san juan' };

/** Minúsculas, sin tildes ni puntos: «Huracán (Ing. White)» → «huracan (ing white)». */
export const normName = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[.'’]/g, '').replace(/[^a-z0-9()]+/g, ' ').replace(/\s*([()])\s*/g, '$1').replace(/\(/g, ' (').trim();

/**
 * Formas de escribir un nombre: «Racing (Córdoba)» → racing (cordoba), racing de cordoba, racing cordoba.
 * Nunca saca lo que va entre paréntesis: «San Lorenzo (MdP)» no es San Lorenzo.
 */
export function nameVariants(name) {
  const n = normName(name);
  const m = n.match(/^(.*) \((.*)\)$/);
  if (!m) return [n];
  const place = EXPAND[m[2]] ?? m[2];
  return [...new Set([n, `${m[1]} (${place})`, `${m[1]} de ${place}`, `${m[1]} ${place}`])];
}

/**
 * Une los equipos del dataset con los de ESPN. `historic` = [{ id, name }] (ids que no son de ESPN);
 * `espn` = [{ id, names: [...] }] (nombre largo, corto, etc.). Un nombre que corresponde a dos equipos de ESPN no
 * se usa (mejor el escudo gris que el de otro club). Devuelve { ids: { idDelDataset: idDeEspn }, missing: [nombres] }.
 */
export function linkTeams(historic, espn) {
  const index = new Map();
  for (const t of espn) {
    for (const v of new Set(t.names.filter(Boolean).flatMap(nameVariants))) {
      const prev = index.get(v);
      index.set(v, prev && prev !== String(t.id) ? null : String(t.id));
    }
  }
  const ids = {};
  const missing = [];
  for (const t of historic) {
    const id = nameVariants(t.name).map((v) => index.get(v)).find(Boolean);
    if (id) ids[t.id] = id;
    else missing.push(t.name);
  }
  return { ids, missing };
}

/** Cambia en un partido del dataset los ids unidos por los de ESPN (`ids` = escudos.json › ids). */
export function relinkMatch(m, ids) {
  if (!ids) return m;
  const fix = (t) => (ids[t.id] ? { ...t, id: ids[t.id] } : t);
  return { ...m, home: fix(m.home), away: fix(m.away) };
}

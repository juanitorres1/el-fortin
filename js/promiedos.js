// Cliente y normalizador de la API de Promiedos (no documentada; datos de Opta).
// Fuente principal para lo que ESPN no tiene o tiene mal en el fútbol argentino:
// tablas oficiales (zonas, anual, promedios), plantel y DT, lesionados y suspendidos del próximo partido.
// Si algo de esto falla, la página usa ESPN o el snapshot (ver js/app.js).

export const TEAM_ID = 'ihc'; // Vélez
export const LEAGUE_ID = 'hc'; // Liga Profesional
const API = 'https://api.promiedos.com.ar';
// Sin este header la API responde `{}`. Es la versión de su web: si cambia y deja de andar, actualizarla.
const HEADERS = { 'X-VER': '1.11.7.5' };

export const teamLogo = (id) => `${API}/images/team/${id}/1`;
export const countryFlag = (id) => (id ? `${API}/images/country/${id}/1` : null);

async function get(path, fetchImpl = fetch) {
  const res = await fetchImpl(`${API}${path}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`Promiedos ${res.status} en ${path}`);
  const json = await res.json();
  if (!json || !Object.keys(json).length) throw new Error(`Promiedos devolvió vacío en ${path}`);
  return json;
}

const valuesOf = (row) => Object.fromEntries((row.values ?? []).map((v) => [v.key, v.value]));

function tableName(group, name) {
  if (/anual/i.test(name)) return 'Tabla anual';
  if (/promedio/i.test(name)) return 'Promedios';
  return `${name.replace(/^Grupo /, 'Zona ')}${group ? ` · ${group}` : ''}`;
}

/** Todas las tablas de la liga, con las columnas tal como las define Promiedos. */
export function normalizeLeagueTables(json) {
  return (json.tables_groups ?? []).flatMap((g) =>
    (g.tables ?? []).map((t) => ({
      phase: g.name || null,
      name: tableName(g.name, t.name),
      columns: (t.table.columns ?? []).filter((c) => !c.key.startsWith('{')).map((c) => ({ key: c.key, title: /^\d{2}$/.test(c.title) ? `20${c.title}` : c.title, bold: Boolean(c.is_bold) })), // promedios: «24» = temporada 2024
      destinations: (t.table.destinations ?? []).map((d) => ({ color: d.color, name: d.name })),
      rows: (t.table.rows ?? []).map((r) => ({
        pos: r.num,
        id: r.entity.object.id,
        name: r.entity.object.name,
        logo: teamLogo(r.entity.object.id),
        color: r.destination_color ?? null,
        values: valuesOf(r),
      })),
    })),
  );
}

export function normalizeTeam(json) {
  const staff = [];
  const squad = [];
  for (const g of json.squad?.groups ?? []) {
    for (const r of g.rows ?? []) {
      const o = r.entity?.object ?? {};
      const person = {
        name: o.name,
        jersey: o.num || null,
        group: g.name,
        role: o.formation_position ?? '',
        age: o.age ? Number(o.age) : null,
        flag: countryFlag(o.country_id),
      };
      (o.is_staff || /direcci/i.test(g.name) ? staff : squad).push(person);
    }
  }
  const next = json.games?.next?.rows?.[0]?.game ?? null;
  return {
    coach: staff.find((s) => /entrenador/i.test(s.role))?.name ?? staff[0]?.name ?? null,
    staff,
    squad,
    nextGameId: next?.id ?? null,
    statsFilters: (json.stats?.filters ?? []).map((f) => ({ key: f.key, name: f.name })),
  };
}

/**
 * Del gamecenter del próximo partido: quiénes no juegan o están en duda (lesión/suspensión) y datos útiles
 * de la previa (árbitro, TV). `missing_players` viene en el mismo orden que `teams`.
 */
export function normalizeGame(json, teamId = TEAM_ID) {
  const g = json.game ?? {};
  const idx = (g.teams ?? []).findIndex((t) => t.id === teamId);
  const missing = (idx >= 0 ? g.players?.missing_players?.[idx] : null) ?? [];
  const [day, month, rest] = (g.start_time ?? '').split('-');
  return {
    id: g.id,
    round: g.stage_round_name ?? null,
    opponent: idx >= 0 ? g.teams[1 - idx]?.name ?? null : null,
    date: rest ? `${rest.slice(0, 4)}-${month}-${day}` : null, // AAAA-MM-DD (hora argentina)
    info: Object.fromEntries((g.game_info ?? []).map((i) => [i.name, i.value])),
    missing: missing.map((p) => ({
      name: p.name,
      jersey: p.jersey_num ?? null,
      reason: p.missing_details?.reason ?? 'Baja',
      // will_play_status 2 = «No jugarán»; cualquier otro valor se muestra como duda.
      out: p.missing_details?.will_play_status === 2,
      note: p.missing_details?.will_play ?? null,
    })),
  };
}

export async function fetchPromiedos(fetchImpl) {
  const [teamJson, leagueJson] = await Promise.all([get(`/team/${TEAM_ID}`, fetchImpl), get(`/league/tables_and_fixtures/${LEAGUE_ID}`, fetchImpl)]);
  const team = normalizeTeam(teamJson);
  const nextGame = team.nextGameId ? normalizeGame(await get(`/gamecenter/${team.nextGameId}`, fetchImpl)) : null;
  return { updatedAt: new Date().toISOString(), team, tables: normalizeLeagueTables(leagueJson), nextGame };
}

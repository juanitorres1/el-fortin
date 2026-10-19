import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregateStats, annualTable, averagesTable, discipline, gamesLog, goalEvents, headToHead, lineupFromSummary, keeperRecord, matchFigure, teamStats, keyEvents, normalizeEvent, normalizeScorers, normalizeStandings, playersFromSummary, playoffTeams, relegation, velezView } from '../src/lib/espn.js';

const side = (id, name, homeAway, score, extra = {}) => ({
  homeAway,
  team: { id, displayName: name, logos: [{ href: `logo-${id}` }] },
  score: score == null ? undefined : { value: score, displayValue: String(score) },
  ...extra,
});

const event = ({ id = '1', date = '2026-01-01T20:00Z', home, away, state = 'post', league = { slug: 'arg.1', name: 'Argentine Liga Profesional de Fútbol' } }) => ({
  id,
  date,
  league,
  competitions: [{ competitors: [home, away], status: { type: { state, completed: state === 'post', shortDetail: 'FT' } }, venue: { fullName: 'José Amalfitani' } }],
});

test('normalizeEvent toma local/visitante por homeAway, no por orden', () => {
  const m = normalizeEvent(event({ away: side('16', 'River Plate', 'away', 1), home: side('21', 'Vélez Sarsfield', 'home', 2) }));
  assert.equal(m.home.name, 'Vélez');
  assert.equal(m.home.score, 2);
  assert.equal(m.away.id, '16');
  assert.equal(m.comp, 'Liga Profesional');
  assert.equal(m.completed, true);
});

test('normalizeEvent: partido sin jugar tiene score null y logo de respaldo', () => {
  const home = side('21', 'Vélez Sarsfield', 'home');
  const away = { homeAway: 'away', team: { id: '99', displayName: 'Rival' } };
  const m = normalizeEvent(event({ home, away, state: 'pre' }));
  assert.equal(m.home.score, null);
  assert.equal(m.completed, false);
  assert.match(m.away.logo, /\/99\.png$/);
});

test('normalizeEvent traduce competencias', () => {
  const m = normalizeEvent(event({ home: side('21', 'Vélez Sarsfield', 'home', 2), away: side('8', 'Estudiantes', 'away', 0), league: { slug: 'x', name: 'Argentine Supercopa Internacional' } }));
  assert.equal(m.comp, 'Supercopa Internacional');
});

test('velezView resuelve resultado desde la óptica de Vélez, de local o visitante', () => {
  const visit = normalizeEvent(event({ home: side('12', 'Lanús', 'home', 2), away: side('21', 'Vélez Sarsfield', 'away', 0) }));
  assert.deepEqual([velezView(visit).result, velezView(visit).velezHome, velezView(visit).rival.name], ['P', false, 'Lanús']);
  const draw = normalizeEvent(event({ home: side('21', 'Vélez Sarsfield', 'home', 1), away: side('5', 'Boca Juniors', 'away', 1) }));
  assert.equal(velezView(draw).result, 'E');
});

test('velezView: empate definido por penales usa el flag winner', () => {
  const m = normalizeEvent(event({ home: side('21', 'Vélez Sarsfield', 'home', 1, { winner: true }), away: side('5', 'Boca Juniors', 'away', 1, { winner: false }) }));
  assert.equal(velezView(m).result, 'G');
});

test('headToHead acumula por rival, cuenta penales como empate e ignora amistosos y no jugados', () => {
  const ms = [
    event({ id: 'a', date: '2020-01-01T00:00Z', home: side('21', 'Vélez Sarsfield', 'home', 3), away: side('16', 'River Plate', 'away', 1) }),
    event({ id: 'b', date: '2021-01-01T00:00Z', home: side('16', 'River Plate', 'home', 2), away: side('21', 'Vélez Sarsfield', 'away', 2, { winner: true }) }),
    event({ id: 'c', date: '2022-01-01T00:00Z', home: side('21', 'Vélez Sarsfield', 'home', 0), away: side('16', 'River Plate', 'away', 0), league: { slug: 'f', name: 'Club Friendly' } }),
    event({ id: 'd', date: '2026-12-01T00:00Z', home: side('21', 'Vélez Sarsfield', 'home'), away: side('16', 'River Plate', 'away'), state: 'pre' }),
    event({ id: 'e', date: '2022-01-01T00:00Z', home: side('5', 'Boca Juniors', 'home', 1), away: side('21', 'Vélez Sarsfield', 'away', 0) }),
  ].map(normalizeEvent);
  const [river, boca] = headToHead(ms);
  assert.deepEqual({ pj: river.pj, g: river.g, e: river.e, p: river.p, gf: river.gf, gc: river.gc }, { pj: 2, g: 1, e: 1, p: 0, gf: 5, gc: 3 });
  assert.deepEqual(river.matches.map((m) => m.id), ['b', 'a']);
  assert.deepEqual({ pj: boca.pj, p: boca.p }, { pj: 1, p: 1 });
});

test('normalizeStandings renombra zonas y ordena por posición', () => {
  const stat = (name, value) => ({ name, value });
  const entry = (id, rank, pts) => ({ team: { id, displayName: id === '21' ? 'Vélez Sarsfield' : `T${id}` }, stats: [stat('rank', rank), stat('points', pts), stat('gamesPlayed', 1), stat('wins', 0), stat('ties', 0), stat('losses', 0), stat('pointsFor', 0), stat('pointsAgainst', 0), stat('pointDifferential', 0)] });
  const [zona] = normalizeStandings({ children: [{ name: 'Group A', standings: { entries: [entry('21', 2, 3), entry('5', 1, 6)] } }] });
  assert.equal(zona.name, 'Zona A');
  assert.deepEqual(zona.rows.map((r) => r.name), ['T5', 'Vélez']);
});

test('annualTable suma fases por equipo y ordena por puntos, DG y GF', () => {
  const row = (id, pts, dg, gf, pj = 1) => ({ id, name: `T${id}`, logo: null, pj, g: 0, e: 0, p: 0, gf, gc: gf - dg, dg, pts });
  const apertura = [{ name: 'Zona A', rows: [row('21', 10, 2, 8), row('5', 12, 1, 5)] }, { name: 'Zona B', rows: [row('16', 9, 5, 9)] }];
  const clausura = [{ name: 'Zona A', rows: [row('21', 6, 1, 4), row('16', 7, 0, 3)] }, { name: 'Zona B', rows: [row('5', 4, 2, 6)] }];
  const t = annualTable([apertura, clausura]);
  // Los tres empatan en 16 pts: T16 (DG +5), T21 (DG +3, GF 12), T5 (DG +3, GF 11).
  assert.deepEqual(t.map((r) => [r.id, r.pts, r.rank]), [['16', 16, 1], ['21', 16, 2], ['5', 16, 3]]);
  assert.equal(t.find((r) => r.id === '21').pj, 2);
});

// ---------- Jugadores ----------
const summaryOf = (players) => ({
  rosters: [
    { team: { id: '5' }, roster: [] },
    {
      team: { id: '21' },
      roster: players.map(([id, { starter = true, subbedIn = false, ...stats }]) => ({
        starter, subbedIn, athlete: { id, displayName: `J${id}` },
        stats: Object.entries({ appearances: starter || subbedIn ? 1 : 0, ...stats }).map(([name, value]) => ({ name, value })),
      })),
    },
  ],
});
const liga = (id, round = 'Torneo Clausura', date = `2026-08-${String(id).padStart(2, '0')}T20:00Z`) => ({ id: String(id), date, comp: 'Liga Profesional', round });

test('playersFromSummary toma solo a Vélez y a los que entraron', () => {
  const ps = playersFromSummary(summaryOf([['1', { totalGoals: 2 }], ['2', { starter: false }], ['3', { starter: false, subbedIn: true, goalAssists: 1 }]]));
  assert.deepEqual(ps.map((p) => [p.id, p.starter, p.stats.g, p.stats.a]), [['1', true, 2, 0], ['3', false, 0, 1]]);
});

test('aggregateStats separa Apertura, Clausura y copas y pone primero el torneo más reciente', () => {
  const p = (stats) => playersFromSummary(summaryOf([['1', stats]]));
  const t = aggregateStats([
    { match: liga(1, 'Torneo Apertura', '2026-03-01T20:00Z'), players: p({ totalGoals: 1 }) },
    { match: liga(2), players: p({ totalGoals: 2, yellowCards: 1 }) },
    { match: liga(3), players: p({ totalGoals: 1 }) },
    { match: { id: '9', date: '2026-07-01T20:00Z', comp: 'Copa Argentina' }, players: p({}) },
  ]);
  assert.deepEqual(t.map((x) => [x.label, x.matches]), [['Clausura 2026', 2], ['Copa Argentina 2026', 1], ['Apertura 2026', 1]]);
  assert.deepEqual([t[0].players[0].pj, t[0].players[0].g, t[0].players[0].am, t[0].players[0].tit], [2, 3, 1, 2]);
});

test('discipline: quinta amarilla en el último partido = suspendido; cuatro = al límite; roja = suspendido', () => {
  const g = (id, players) => ({ match: liga(id), players: playersFromSummary(summaryOf(players)) });
  const games = [
    g(1, [['A', { yellowCards: 1 }], ['B', { yellowCards: 1 }], ['C', { yellowCards: 1 }]]),
    g(2, [['A', { yellowCards: 1 }], ['B', { yellowCards: 1 }], ['C', { yellowCards: 1 }]]),
    g(3, [['A', { yellowCards: 1 }], ['B', { yellowCards: 1 }], ['C', { yellowCards: 1 }]]),
    g(4, [['A', { yellowCards: 1 }], ['B', { yellowCards: 1 }], ['C', { yellowCards: 1 }]]),
    g(5, [['A', { yellowCards: 1 }], ['B', {}], ['C', {}], ['D', { yellowCards: 1, redCards: 1 }]]),
  ];
  const d = discipline(games, new Set(['Clausura-2026']));
  const by = Object.fromEntries(d.map((x) => [x.id, x.kind]));
  assert.deepEqual(by, { A: 'amarillas', B: 'limite', C: 'limite', D: 'roja' });
});

test('discipline ignora torneos sin partidos por jugar y la quinta amarilla ya cumplida', () => {
  const g = (id, players) => ({ match: liga(id), players: playersFromSummary(summaryOf(players)) });
  const games = [1, 2, 3, 4, 5].map((i) => g(i, [['A', { yellowCards: 1 }]])).concat([g(6, [['A', {}]])]);
  assert.deepEqual(discipline(games, new Set(['Clausura-2026'])), []);
  assert.deepEqual(discipline(games.slice(0, 5), new Set()), []);
});

test('keyEvents: eventos en castellano, del más nuevo al más viejo, sin los que no importan', () => {
  const ev = (id, type, minute, team, names = [], extra = {}) => ({
    id, type: { type }, clock: { displayValue: minute }, team: team ? { id: team } : undefined,
    participants: names.map((n) => ({ athlete: { displayName: n } })), ...extra,
  });
  const summary = {
    header: { competitions: [{ competitors: [{ team: { id: '21', displayName: 'Vélez Sarsfield' } }, { team: { id: '16', displayName: 'River Plate' } }] }] },
    keyEvents: [
      ev('1', 'kickoff', '', null),
      ev('2', 'goal---header', "10'", '21', ['Romero', 'Valdés']),
      ev('3', 'own-goal', "20'", '16', ['Silvero']),
      ev('4', 'yellow-card', "30'", '16', ['Pérez']),
      ev('5', 'start-delay', "31'", '16', []),
      ev('6', 'halftime', "45'+2'", null),
      ev('7', 'substitution', "60'", '21', ['Aguirre', 'Godoy']),
      ev('8', 'penalty---missed', "80'", '21', ['Godoy']),
      ev('9', 'red-card', "85'", '16', ['Paz']),
    ],
  };
  const out = keyEvents(summary);
  assert.deepEqual(out.map((e) => e.id), ['9', '8', '7', '6', '4', '3', '2']);
  assert.deepEqual(out.at(-1), { id: '2', minute: "10'", kind: 'gol', text: 'Gol de Romero (asistencia de Valdés)', team: 'Vélez', velez: true });
  assert.equal(out.find((e) => e.id === '3').text, 'Gol en contra de Silvero');
  assert.equal(out.find((e) => e.id === '3').team, 'River Plate');
  assert.equal(out.find((e) => e.id === '7').text, 'Entra Aguirre por Godoy');
  assert.equal(out.find((e) => e.id === '6').kind, 'pausa');
  assert.equal(out.find((e) => e.id === '9').kind, 'roja');
});

test('averagesTable: suma por temporada, divide por partidos, deja afuera a los descendidos y desempata por nombre', () => {
  const row = (id, name, pts, pj) => ({ id, name, pts, pj });
  const parts = [
    { key: 'a', season: 2024, groups: [{ rows: [row('1', 'Boca', 50, 27), row('2', 'Vélez', 40, 27), row('9', 'Descendido', 10, 27)] }] },
    { key: 'b', season: 2025, groups: [{ rows: [row('1', 'Boca', 30, 16)] }, { rows: [row('2', 'Vélez', 36, 16), row('3', 'Ascendido', 20, 16)] }] },
    { key: 'c', season: 2026, groups: [{ rows: [row('1', 'Boca', 10, 10), row('2', 'Vélez', 10, 10), row('3', 'Ascendido', 5, 10), row('4', 'Aldosivi', 13, 10)] }] },
  ];
  const t = averagesTable(parts, new Set(['1', '2', '3', '4']));
  assert.deepEqual(t.seasons, [2024, 2025, 2026]);
  assert.deepEqual(t.rows.map((r) => r.id), ['1', '2', '4', '3']);
  const velez = t.rows.find((r) => r.id === '2');
  assert.deepEqual([velez.pts, velez.pj, velez.bySeason], [86, 53, { 2024: 40, 2025: 36, 2026: 10 }]);
  assert.equal(t.rows.find((r) => r.id === '3').pj, 26); // el ascendido divide solo por sus partidos en Primera
  const tie = averagesTable([{ key: 'x', season: 2026, groups: [{ rows: [row('5', 'Tigre', 10, 10), row('6', 'Banfield', 10, 10)] }] }], new Set(['5', '6']));
  assert.deepEqual(tie.rows.map((r) => r.name), ['Banfield', 'Tigre']);
});

test('relegation: último de promedios y último de la anual; si coinciden, el anteúltimo de la anual', () => {
  const ids = (...xs) => xs.map((id) => ({ id }));
  assert.deepEqual(relegation(ids('a', 'b', 'c'), ids('x', 'y', 'z')), { promedios: 'c', anual: 'z' });
  assert.deepEqual(relegation(ids('a', 'b', 'c'), ids('x', 'y', 'c')), { promedios: 'c', anual: 'y' });
});

test('normalizeScorers: nombre, goles, partidos y equipo actual', () => {
  const json = { leaders: { categories: [{ name: 'goalsLeaders', leaders: [
    { value: 9, displayValue: 'Matches: 11, Goals: 9', athlete: { id: 1, displayName: 'Agustín Módica' }, team: { id: 11972, displayName: 'Gimnasia (Mendoza)', logos: [{ href: 'logo' }] } },
    { value: 6, displayValue: 'raro', athlete: { id: 2, displayName: 'Ronaldo Martínez' }, team: { id: 21, displayName: 'Vélez Sarsfield' } },
  ] }] } };
  const out = normalizeScorers(json);
  assert.deepEqual(out[0], { id: '1', name: 'Agustín Módica', goals: 9, pj: 11, team: { id: '11972', name: 'Gimnasia (Mendoza)', logo: 'logo' } });
  assert.equal(out[1].pj, null);
  assert.equal(out[1].team.name, 'Vélez');
  assert.deepEqual(normalizeScorers({}), []);
});

test('playoffTeams: cuántos juegan los playoffs según las fases que siguen a la regular', () => {
  const types = [
    { id: '1', name: 'Torneo Apertura', hasStandings: true }, { id: '2', name: 'Apertura - Round of 16', hasStandings: false },
    { id: '3', name: 'Apertura - Quarterfinals', hasStandings: false }, { id: '6', name: 'Torneo Clausura', hasStandings: true },
    { id: '7', name: 'Clausura - Quarterfinals', hasStandings: false }, { id: '8', name: 'Clausura - Final', hasStandings: false },
  ];
  assert.equal(playoffTeams(types, { id: '1' }), 16);
  assert.equal(playoffTeams(types, { id: '6' }), 8);
  assert.equal(playoffTeams([{ id: '1', name: 'Liga', hasStandings: true }], { id: '1' }), null);
  assert.equal(playoffTeams(types, null), null);
});

test('gamesLog y keeperRecord: vallas invictas del arquero titular, por torneo', () => {
  const m = (id, vs, rs, round = 'Torneo Clausura') => ({
    id, date: '2026-09-01T20:00:00Z', comp: 'Liga Profesional', round, completed: true,
    home: { id: '21', name: 'Vélez', score: vs }, away: { id: '5', name: 'Boca Juniors', score: rs },
  });
  const arquero = (starter, gc, ataj) => ({ id: 'k', name: 'Arquero', starter, stats: { g: 0, a: 0, am: 0, r: 0, gc, ataj } });
  const log = gamesLog([
    { match: m('1', 1, 0), players: [arquero(true, 0, 4)] },
    { match: m('2', 2, 2), players: [arquero(true, 2, 3)] },
    { match: m('3', 3, 0), players: [arquero(false, 0, 1)] }, // entró de suplente: no cuenta como valla
    { match: m('4', 0, 0, 'Torneo Apertura'), players: [arquero(true, 0, 5)] },
  ]);
  assert.deepEqual(log[0].players[0], { id: 'k', name: 'Arquero', s: 1, g: 0, a: 0, am: 0, r: 0, ataj: 4, gc: 0 });
  assert.equal(log[0].score, '1-0');
  assert.deepEqual(keeperRecord(log, 'k', 'Clausura 2026'), { pj: 3, vi: 1, ataj: 8, gc: 2 });
  assert.deepEqual(keeperRecord(log, 'k'), { pj: 4, vi: 2, ataj: 13, gc: 2 });
  assert.deepEqual(keeperRecord(log, 'otro'), { pj: 0, vi: 0, ataj: 0, gc: 0 });
});

test('teamStats: estadísticas que ESPN informa para los dos equipos, en números', () => {
  const st = (pairs) => pairs.map(([name, displayValue]) => ({ name, displayValue }));
  const summary = {
    boxscore: {
      teams: [
        { team: { id: '5' }, statistics: st([['possessionPct', '41.5'], ['totalShots', '9'], ['wonCorners', '3']]) },
        { team: { id: '21' }, statistics: st([['possessionPct', '58.5'], ['totalShots', '14'], ['shotsOnTarget', '6']]) },
      ],
    },
  };
  const match = { home: { id: '21' }, away: { id: '5' } };
  assert.deepEqual(teamStats(summary, match).map((x) => [x.label, x.home, x.away]), [['Posesión', 58.5, 41.5], ['Remates', 14, 9]]);
  assert.deepEqual(teamStats({}, match), []);
});

test('matchFigure: el de mejores números (goles, asistencias, remates, atajadas)', () => {
  const p = (id, stats) => ({ id, name: `J${id}`, stats: { g: 0, a: 0, arco: 0, ataj: 0, r: 0, ...stats } });
  assert.deepEqual(matchFigure([p('1', { a: 1 }), p('2', { g: 1, arco: 2 }), p('3', { ataj: 4 })]), { id: '2', name: 'J2', line: '1 gol, 2 remates al arco' });
  assert.equal(matchFigure([p('1', {})]), null);
});

test('lineupFromSummary: el once en filas desde el arco, de izquierda a derecha, y la formación', () => {
  const p = (id, pos, extra = {}) => ({ starter: true, jersey: id, position: { abbreviation: pos }, athlete: { id, displayName: `Jugador ${id}`, ...extra } });
  const roster = [p('1', 'G'), p('2', 'RB'), p('3', 'CD-R'), p('4', 'CD-L'), p('5', 'LB'), p('6', 'DM'), p('7', 'CM-R'), p('8', 'CM-L'),
    p('9', 'RW'), p('10', 'CF', { shortName: 'B. Romero' }), p('11', 'LW'), { starter: false, position: { abbreviation: 'SUB' }, athlete: { id: '12', displayName: 'Suplente' } }];
  const summary = { rosters: [{ team: { id: '21' }, formation: '4-3-3', roster }] };
  const lu = lineupFromSummary(summary, '21');
  assert.equal(lu.formation, '4-3-3');
  assert.deepEqual(lu.rows.map((r) => r.map((x) => x.id)), [['1'], ['5', '4', '3', '2'], ['6'], ['8', '7'], ['11', '10', '9']]);
  assert.equal(lu.rows.at(-1)[1].short, 'Romero');
  assert.equal(lu.players[0].short, '1'); // sin shortName: la última palabra del nombre
  // Sin formación de ESPN, se arma con las filas; sin posiciones, no hay cancha; sin 11 titulares, nada.
  assert.equal(lineupFromSummary({ rosters: [{ team: { id: '21' }, roster }] }, '21').formation, '4-1-2-3');
  assert.equal(lineupFromSummary({ rosters: [{ team: { id: '21' }, roster: roster.map((x) => ({ ...x, position: null })) }] }, '21').rows, null);
  assert.equal(lineupFromSummary({ rosters: [{ team: { id: '21' }, roster: roster.slice(1) }] }, '21'), null);
});

test('goalEvents: goles con minuto y tipo, en orden, sin la definición por penales', () => {
  const ev = (id, type, clock, team, extra = {}) => ({ id, type: { type }, clock: { displayValue: clock }, team: { id: team }, participants: [{ athlete: { displayName: 'X' } }], ...extra });
  const summary = { keyEvents: [
    ev('1', 'goal---header', "90'+3'", '21'), ev('2', 'yellow-card', "40'", '5'), ev('3', 'own-goal', "12'", '21'),
    ev('4', 'penalty---scored', "55'", '5'), ev('5', 'goal---free-kick', "45'+1'", '21'), ev('6', 'goal', '', '21', { shootout: true }),
  ] };
  assert.deepEqual(goalEvents(summary), [
    { min: 12, add: 0, velez: true, kind: 'ec' }, { min: 45, add: 1, velez: true, kind: 'tl' },
    { min: 55, add: 0, velez: false, kind: 'p' }, { min: 90, add: 3, velez: true, kind: 'c' },
  ]);
});

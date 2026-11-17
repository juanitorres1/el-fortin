// Arreglos de la auditoría de nov-2026: rondas en castellano, nombres de ESPN, detalle recortado, goleadores con lo
// guardado por el deploy, penales y cancha neutral en «Vélez en cifras», pronóstico y formato de números.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchScorers, keyEvents, leaderboard, lineupFromSummary, personName, playersFromSummary, roundName, scorersBase, slimSummary, teamStats } from '../src/lib/espn.js';
import { seasonNumbers } from '../src/lib/facts.js';
import { parseForecast } from '../src/lib/weather.js';
import { num } from '../src/lib/core.js';

test('roundName: pasa las rondas de ESPN al castellano y deja igual lo que ya está', () => {
  assert.equal(roundName('Clausura - Round of 16'), 'Clausura · Octavos de final');
  assert.equal(roundName('Quarter-finals'), 'Cuartos de final');
  assert.equal(roundName('Semi-finals'), 'Semifinales');
  assert.equal(roundName('Copa Argentina - Round of 64'), 'Copa Argentina · 32avos de final');
  assert.equal(roundName('2022 Argentine Liga Profesional'), 'Liga Profesional 2022');
  assert.equal(roundName('Torneo Clausura'), 'Torneo Clausura');
  assert.equal(roundName(null), null);
});

test('personName: corrige las tildes que ESPN no pone', () => {
  assert.equal(personName('Elias Gomez'), 'Elías Gómez');
  assert.equal(personName('Ronaldo Martínez'), 'Ronaldo Martínez');
});

test('slimSummary: las funciones del sitio dan lo mismo con el detalle recortado', () => {
  const ath = (id, displayName, shortName) => ({ id, displayName, shortName, extra: 'x'.repeat(50) });
  const full = {
    header: { competitions: [{ competitors: [{ team: { id: '21', displayName: 'Vélez Sarsfield', logos: [] } }, { team: { id: '5', displayName: 'Boca Juniors' } }] }] },
    keyEvents: [
      { id: '1', type: { type: 'goal', text: 'Goal' }, clock: { displayValue: "12'" }, team: { id: '21' }, scoringPlay: true, participants: [{ athlete: ath('9', 'Elias Gomez', 'E. Gomez') }, { athlete: ath('8', 'Ana') }] },
      { id: '2', type: { type: 'yellow-card' }, clock: { displayValue: "40'" }, team: { id: '5' }, participants: [{ athlete: ath('3', 'Beto') }] },
    ],
    boxscore: { teams: [{ team: { id: '21' }, statistics: [{ name: 'possessionPct', displayValue: '55.5', label: 'x' }] }, { team: { id: '5' }, statistics: [{ name: 'possessionPct', displayValue: '44.5' }] }] },
    rosters: [{
      team: { id: '21' }, formation: '4-4-2',
      roster: Array.from({ length: 11 }, (_, i) => ({ athlete: ath(String(100 + i), `Jugador ${i}`), starter: true, jersey: String(i + 1), position: { abbreviation: i ? 'CD' : 'G' }, stats: [{ name: 'totalGoals', value: i === 3 ? 1 : 0 }] })),
    }],
    news: { articles: Array.from({ length: 50 }, () => ({ body: 'x'.repeat(1000) })) },
  };
  const slim = slimSummary(full);
  const match = { home: { id: '21' }, away: { id: '5' } };
  assert.deepEqual(keyEvents(slim), keyEvents(full));
  assert.deepEqual(teamStats(slim, match), teamStats(full, match));
  assert.deepEqual(playersFromSummary(slim), playersFromSummary(full));
  assert.deepEqual(lineupFromSummary(slim, '21'), lineupFromSummary(full, '21'));
  assert.ok(JSON.stringify(slim).length < JSON.stringify(full).length / 5);
  assert.equal(keyEvents(full).at(-1).text, 'Gol de Elías Gómez (asistencia de Ana)');
});

const goal = (id, name, team, extra = {}) => ({ scoringPlay: true, team: { id: team }, athletesInvolved: [{ id, displayName: name }], ...extra });
const ev = (id, date, details, completed = true) => ({
  id, date, season: { slug: 'torneo-clausura' },
  competitions: [{ status: { type: { completed } }, competitors: [{ team: { id: '21', displayName: 'Vélez Sarsfield' } }, { team: { id: '19', displayName: 'Talleres (Córdoba)' } }], details }],
});

test('fetchScorers: con lo guardado por el deploy pide solo los meses que siguen y no cuenta dos veces', async () => {
  const standings = { phase: 'Torneo Clausura', phaseKey: 'arg.1-2026-6', phaseStart: '2026-09-01T04:00Z' };
  const sep = ev('a', '2026-09-10T20:00Z', [goal('9', 'Ronaldo Martínez', '19')]);
  const oct = ev('b', '2026-10-10T20:00Z', [goal('9', 'Ronaldo Martínez', '21'), goal('9', 'Ronaldo Martínez', '21', { penaltyKick: true })]);
  const base = scorersBase(standings, new Map([['202609', [sep]], ['202610', [oct]]]), '202610');
  assert.equal(base.through, '202609');
  const asked = [];
  const fetchImpl = async (url) => {
    asked.push(url.match(/dates=(\d+)/)[1]);
    // El de septiembre aparece también en octubre (la hora): no tiene que sumar de nuevo.
    return { ok: true, json: async () => ({ events: [sep, oct] }) };
  };
  const out = await fetchScorers(standings, fetchImpl, new Date(2026, 9, 20), base);
  assert.deepEqual(asked, ['202610']);
  assert.deepEqual(out.map((r) => [r.name, r.n, r.pen, r.team.name, r.by]), [['Ronaldo Martínez', 3, 1, 'Vélez', { Talleres: 1, 'Vélez': 2 }]]);
  // Lo guardado de otra fase se ignora.
  asked.length = 0;
  await fetchScorers(standings, fetchImpl, new Date(2026, 9, 20), { ...base, phaseKey: 'otra' });
  assert.deepEqual(asked, ['202609', '202610']);
});

test('leaderboard: cuenta los goles con cada club', () => {
  const t = (name) => ({ id: name, name });
  const out = leaderboard([{ id: '9', name: 'R', team: t('Talleres'), date: '2026-07-01' }, { id: '9', name: 'R', team: t('Vélez'), date: '2026-09-01' }]);
  assert.deepEqual(out[0].by, { Talleres: 1, 'Vélez': 1 });
});

test('seasonNumbers: un partido por penales cuenta como en la lista y la Copa Argentina va en cancha neutral', () => {
  const g = (score, home, extra = {}) => ({ score, home, comp: 'Liga Profesional', label: 'Clausura 2026', ...extra });
  const s = seasonNumbers([
    g('2-0', true, { result: 'G' }), g('1-1', false, { result: 'E' }),
    g('0-0', true, { comp: 'Copa Argentina', label: 'Copa Argentina 2026', result: 'P' }),
  ]);
  assert.deepEqual([s.home.pj, s.away.pj, s.neutral.pj], [1, 1, 1]);
  assert.deepEqual([s.neutral.p, s.neutral.pts], [1, 0]);
  assert.equal(s.shootouts, 1);
});

test('parseForecast: lluvia con probabilidad baja va como posibilidad', () => {
  const f = (code, rain) => parseForecast({ hourly: { time: ['x'], temperature_2m: [19.4], precipitation_probability: [rain], weather_code: [code] } });
  assert.equal(f(53, 19).text, 'Posible llovizna');
  assert.equal(f(63, 70).text, 'Lluvia');
  assert.equal(f(2, 5).text, 'Parcialmente nublado');
});

test('num: formato argentino', () => {
  assert.equal(num(34.9, 1), '34,9');
  assert.equal(num(1829), '1.829');
  assert.equal(num(1.2345, 3), '1,235');
});

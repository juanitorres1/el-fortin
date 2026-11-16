import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkBracket, checkData } from '../scripts/check-data.mjs';
import { PLAYOFF_SEEDS, RULES_YEAR, rulesApply } from '../src/lib/rules.js';

const NOW = new Date(`${RULES_YEAR}-10-15T12:00:00Z`);
const ok = () => ({
  snapshot: {
    updatedAt: '2026-10-15T11:30:00Z'.replace('2026', String(RULES_YEAR)),
    fixture: [{ completed: false }],
    standings: { playoffTeams: 16, groups: [{ rows: [{ id: '21' }] }] },
  },
  matches: { matches: Array.from({ length: 1100 }, () => ({})) },
  promedios: { parts: [{ season: RULES_YEAR - 2 }, { season: RULES_YEAR - 1 }, { season: RULES_YEAR }] },
  players: { tournaments: [{}] },
  games: { games: [{}] },
  news: { headlines: [{}] },
  facts: {},
  ics: 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nEND:VEVENT\r\nEND:VCALENDAR',
});

test('checkData: con todo en orden no hay problemas', () => {
  assert.deepEqual(checkData(ok(), NOW), []);
});

test('checkData: avisa datos viejos, tabla vacía, playoffs ocultos y archivos que faltan', () => {
  const d = ok();
  d.snapshot.updatedAt = `${RULES_YEAR}-10-14T00:00:00Z`;
  d.snapshot.standings.playoffTeams = null;
  d.facts = null;
  d.matches = { matches: [] };
  const out = checkData(d, NOW).join('\n');
  assert.match(out, /tiene 36 h/);
  assert.match(out, /Camino a los playoffs/);
  assert.match(out, /facts\.json/);
  assert.match(out, /historial tiene 0 partidos/);
});

test('checkData: en enero un fixture y una tabla vacíos son normales', () => {
  const d = ok();
  d.snapshot.updatedAt = `${RULES_YEAR}-01-10T11:30:00Z`;
  d.snapshot.fixture = [];
  d.snapshot.standings.groups = [];
  d.ics = 'BEGIN:VCALENDAR\r\nEND:VCALENDAR';
  assert.deepEqual(checkData(d, new Date(`${RULES_YEAR}-01-10T12:00:00Z`)), []);
});

test('checkData y rulesApply: en una temporada nueva pide revisar el reglamento', () => {
  const next = RULES_YEAR + 1;
  const d = ok();
  d.snapshot.updatedAt = `${next}-03-01T11:30:00Z`;
  d.promedios.parts.push({ season: next });
  const out = checkData(d, new Date(`${next}-03-01T12:00:00Z`));
  assert.equal(out.length, 1);
  assert.match(out[0], /src\/lib\/rules\.js/);
  assert.equal(rulesApply(RULES_YEAR), true);
  assert.equal(rulesApply(next), false);
  assert.equal(rulesApply(null), true);
});

// Cuadro de los playoffs: zonas A y B de 8 con id = puesto («A3»), octavos según PLAYOFF_SEEDS.
const zones = ['A', 'B'].map((z) => ({ name: `Zona ${z}`, rows: Array.from({ length: 8 }, (_, i) => ({ id: `${z}${i + 1}`, name: `${z}${i + 1}`, rank: i + 1 })) }));
const side = (tid) => ({ id: tid, name: tid, score: null, pen: null, winner: false });
const octavo = (h, a, i) => ({ id: String(i), slug: 'r16', date: '2026-11-20T23:00Z', status: 'pre', completed: false, home: side(h), away: side(a) });
const bracketData = (pairs) => ({
  standings: {
    phaseKey: 'arg.1-2026-6', year: RULES_YEAR, groups: zones,
    playoffRounds: ['r16', 'r8', 'r4', 'r2'].map((slug, i) => ({ id: String(i), slug, start: i === 0 ? '2026-11-09T05:00Z' : null })),
  },
  playoffs: { phaseKey: 'arg.1-2026-6', events: pairs.map(([h, a], i) => octavo(h, a, i)) },
});
const AFTER = new Date('2026-11-16T12:00:00Z');

test('checkBracket: los octavos de ESPN encajan en el cuadro: sin aviso', () => {
  const { standings, playoffs } = bracketData(PLAYOFF_SEEDS);
  assert.deepEqual(checkBracket(standings, playoffs, AFTER), []);
});

test('checkBracket: avisa si un partido no encaja o si falta playoffs.json', () => {
  const pairs = PLAYOFF_SEEDS.map((p) => [...p]);
  pairs[0] = ['A1', 'B7']; // cambió el formato
  pairs[6] = ['A2', 'B8'];
  const { standings, playoffs } = bracketData(pairs);
  assert.match(checkBracket(standings, playoffs, AFTER).join(), /PLAYOFF_SEEDS/);
  assert.match(checkBracket(standings, null, AFTER).join(), /playoffs\.json/);
});

test('checkBracket: antes de los playoffs, con datos de otra fase o con el reglamento vencido no avisa', () => {
  const pairs = PLAYOFF_SEEDS.map(([a]) => [a, 'A1']);
  const { standings, playoffs } = bracketData(pairs);
  assert.deepEqual(checkBracket(standings, null, new Date('2026-11-01T12:00:00Z')), []);
  assert.deepEqual(checkBracket(standings, { ...playoffs, phaseKey: 'arg.1-2026-1' }, AFTER), []);
  assert.deepEqual(checkBracket({ ...standings, year: RULES_YEAR + 1 }, playoffs, AFTER), []);
});

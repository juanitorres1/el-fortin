import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkData } from '../scripts/check-data.mjs';
import { RULES_YEAR, rulesApply } from '../src/lib/rules.js';

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
  assert.match(out[0], /js\/rules\.js/);
  assert.equal(rulesApply(RULES_YEAR), true);
  assert.equal(rulesApply(next), false);
  assert.equal(rulesApply(null), true);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCalendar, fold } from '../scripts/ics.mjs';

const team = (id, name, score = null) => ({ id, name, logo: null, score, pen: null, winner: false });
const match = (over = {}) => ({
  id: '100', date: '2026-10-17T23:00Z', timeValid: true, comp: 'Liga Profesional', round: 'Torneo Clausura',
  status: 'pre', completed: false, venue: 'José Amalfitani', home: team('21', 'Vélez'), away: team('99', 'Gimnasia (Mendoza)'), ...over,
});
const NOW = new Date('2026-10-15T12:00:00Z');
const unfold = (ics) => ics.replace(/\r\n /g, '');

test('evento con horario: UTC, 2 horas, local primero y comas escapadas', () => {
  const ics = unfold(buildCalendar([match()], NOW));
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /\r\nEND:VCALENDAR\r\n$/);
  assert.match(ics, /UID:espn-100@el-fortin/);
  assert.match(ics, /DTSTART:20261017T230000Z/);
  assert.match(ics, /DTEND:20261018T010000Z/);
  assert.match(ics, /SUMMARY:Vélez vs Gimnasia \(Mendoza\)/);
  assert.match(ics, /DESCRIPTION:Liga Profesional · Clausura\\nFixture/);
  assert.match(ics, /DTSTAMP:20261015T120000Z/);
});

test('sin horario confirmado: todo el día en la fecha argentina y tentativo', () => {
  // 02:00 UTC del 18 = 23:00 del 17 en la Argentina
  const ics = unfold(buildCalendar([match({ date: '2026-10-18T02:00Z', timeValid: false })], NOW));
  assert.match(ics, /DTSTART;VALUE=DATE:20261017/);
  assert.match(ics, /DTEND;VALUE=DATE:20261018/);
  assert.match(ics, /STATUS:TENTATIVE/);
  assert.match(ics, /Horario a confirmar/);
});

test('partido jugado de visitante: resultado en el título con el local primero', () => {
  const m = match({ completed: true, status: 'post', home: team('5', 'Boca Juniors', 1), away: team('21', 'Vélez', 2) });
  assert.match(unfold(buildCalendar([m], NOW)), /SUMMARY:Boca Juniors 1-2 Vélez/);
});

test('sin duplicados y en orden', () => {
  const a = match({ id: '1', date: '2026-11-01T20:00Z' });
  const b = match({ id: '2', date: '2026-10-01T20:00Z' });
  const ics = buildCalendar([a, b, a], NOW);
  assert.equal(ics.match(/BEGIN:VEVENT/g).length, 2);
  assert.ok(ics.indexOf('espn-2@') < ics.indexOf('espn-1@'));
});

test('fold: ninguna línea pasa de 75 octetos y no corta caracteres UTF-8', () => {
  const long = `SUMMARY:${'Vélez ñandú '.repeat(20)}`;
  const lines = fold(long).split('\r\n');
  assert.ok(lines.length > 1);
  for (const l of lines) assert.ok(Buffer.byteLength(l) <= 75, l);
  assert.equal(lines.map((l, i) => (i ? l.slice(1) : l)).join(''), long);
});

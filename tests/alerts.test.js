import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  KICKOFF_MIN_DIFF_MS, KICKOFF_NOTICE_MS, goalAlert, goalText, kickoffChange, kickoffChangeText, offLabel, scoreOf, trackKickoffs,
} from '../src/lib/alerts.js';

const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;
const NOW = Date.parse('2026-11-10T15:00:00Z');

// ---------- Postergados ----------

const off = (statusName, extra = {}) => ({ id: '1', status: 'post', completed: false, statusName, ...extra });

test('offLabel: el texto sale del estado de ESPN', () => {
  assert.equal(offLabel(off('STATUS_POSTPONED')), 'Postergado');
  assert.equal(offLabel(off('STATUS_SUSPENDED')), 'Suspendido');
  assert.equal(offLabel(off('STATUS_ABANDONED')), 'Suspendido');
  assert.equal(offLabel(off('STATUS_CANCELED')), 'Cancelado');
});

test('offLabel: «Postergado» si el nombre no se conoce o falta (datos guardados viejos)', () => {
  assert.equal(offLabel(off('STATUS_ALGO_NUEVO')), 'Postergado');
  assert.equal(offLabel(off(null)), 'Postergado');
  assert.equal(offLabel(off(undefined)), 'Postergado');
});

test('offLabel: null si el partido sigue en pie, se juega o terminó', () => {
  assert.equal(offLabel({ status: 'pre', completed: false, statusName: 'STATUS_SCHEDULED' }), null);
  assert.equal(offLabel({ status: 'in', completed: false, statusName: 'STATUS_FIRST_HALF' }), null);
  assert.equal(offLabel({ status: 'post', completed: true, statusName: 'STATUS_FULL_TIME' }), null);
  // Un partido del historial no trae estado: no es un postergado.
  assert.equal(offLabel({ completed: true }), null);
  // El nombre solo no alcanza: manda el estado.
  assert.equal(offLabel({ status: 'pre', completed: false, statusName: 'STATUS_POSTPONED' }), null);
});

// ---------- Gol ----------

const live = (home, away, { velezHome = true, id = '1' } = {}) => ({
  id, status: 'in',
  home: { id: velezHome ? '21' : '5', name: velezHome ? 'Vélez' : 'Boca Juniors', score: home },
  away: { id: velezHome ? '5' : '21', name: velezHome ? 'Boca Juniors' : 'Vélez', score: away },
});

test('goalAlert: gol de Vélez y gol del rival, con el marcador local-visitante', () => {
  assert.deepEqual(goalAlert(scoreOf(live(1, 1)), live(2, 1)), { who: 'velez', score: '2-1', rival: 'Boca Juniors' });
  assert.deepEqual(goalAlert(scoreOf(live(1, 0)), live(1, 1)), { who: 'rival', score: '1-1', rival: 'Boca Juniors' });
  assert.deepEqual(
    goalAlert(scoreOf(live(1, 0, { velezHome: false })), live(1, 1, { velezHome: false })),
    { who: 'velez', score: '1-1', rival: 'Boca Juniors' },
  );
});

test('goalAlert: la primera carga con datos no es un gol, ni un cambio de partido', () => {
  assert.equal(goalAlert(null, live(2, 0)), null);
  assert.equal(goalAlert(scoreOf(live(0, 0, { id: '9' })), live(2, 0)), null);
});

test('goalAlert: un marcador que baja (gol anulado, corrección de ESPN) no avisa', () => {
  assert.equal(goalAlert(scoreOf(live(2, 1)), live(1, 1)), null);
  assert.equal(goalAlert(scoreOf(live(2, 1)), live(2, 0)), null);
  assert.equal(goalAlert(scoreOf(live(2, 1)), live(2, 1)), null);
});

test('goalAlert: marcador sin números (ESPN todavía no lo mandó) cuenta como 0', () => {
  assert.deepEqual(scoreOf(live(undefined, null)), { id: '1', home: 0, away: 0 });
  assert.equal(goalAlert(scoreOf(live(undefined, undefined)), live(0, 0)), null);
  assert.equal(goalAlert(scoreOf(live(undefined, undefined)), live(1, undefined)).score, '1-0');
});

test('goalText: festejo para Vélez, sobrio para el rival', () => {
  assert.equal(goalText({ who: 'velez', score: '2-1', rival: 'Boca Juniors' }), '¡Gol de Vélez! 2-1');
  assert.equal(goalText({ who: 'rival', score: '1-1', rival: 'Boca Juniors' }), 'Gol de Boca Juniors · 1-1');
});

// ---------- Cambió el horario ----------

const pre = (id, date, extra = {}) => ({ id, date, status: 'pre', completed: false, timeValid: true, ...extra });
const SAT_19 = '2026-11-14T22:00:00Z'; // sábado 14, 19:00 en la Argentina
const SAT_21 = '2026-11-15T00:00:00Z'; // sábado 14, 21:00 en la Argentina
const SUN_17 = '2026-11-15T20:00:00Z'; // domingo 15, 17:00

test('trackKickoffs: la primera visita guarda las fechas y no avisa', () => {
  const out = trackKickoffs(null, [pre('1', SAT_19), pre('2', SUN_17)], NOW);
  assert.deepEqual(out, { 1: { date: SAT_19 }, 2: { date: SUN_17 } });
  assert.equal(kickoffChange(out, pre('1', SAT_19), NOW), null);
});

test('trackKickoffs: si la fecha cambió, guarda la anterior y cuándo se detectó', () => {
  const out = trackKickoffs({ 1: { date: SAT_19 } }, [pre('1', SUN_17)], NOW);
  assert.deepEqual(out, { 1: { date: SUN_17, was: SAT_19, at: NOW } });
  assert.equal(kickoffChange(out, pre('1', SUN_17), NOW), SAT_19);
});

test('trackKickoffs: menos de 5 minutos de diferencia no es una reprogramación', () => {
  const almost = new Date(Date.parse(SAT_19) + KICKOFF_MIN_DIFF_MS - 1000).toISOString();
  assert.deepEqual(trackKickoffs({ 1: { date: SAT_19 } }, [pre('1', almost)], NOW), { 1: { date: SAT_19 } });
  const five = new Date(Date.parse(SAT_19) + KICKOFF_MIN_DIFF_MS).toISOString();
  assert.equal(trackKickoffs({ 1: { date: SAT_19 } }, [pre('1', five)], NOW)[1].was, SAT_19);
  // También si lo adelantan.
  const before = new Date(Date.parse(SAT_19) - 2 * 60 * MIN).toISOString();
  assert.equal(trackKickoffs({ 1: { date: SAT_19 } }, [pre('1', before)], NOW)[1].was, SAT_19);
});

test('trackKickoffs: el aviso dura 3 días desde que se detectó y después se limpia', () => {
  const changed = { 1: { date: SUN_17, was: SAT_19, at: NOW } };
  const m = pre('1', SUN_17);
  const almost = NOW + KICKOFF_NOTICE_MS - MIN;
  assert.deepEqual(trackKickoffs(changed, [m], almost), changed);
  assert.equal(kickoffChange(changed, m, almost), SAT_19);
  const later = NOW + KICKOFF_NOTICE_MS;
  assert.equal(kickoffChange(changed, m, later), null);
  assert.deepEqual(trackKickoffs(changed, [m], later), { 1: { date: SUN_17 } });
});

test('trackKickoffs: un segundo cambio pisa el aviso anterior', () => {
  const changed = { 1: { date: SAT_21, was: SAT_19, at: NOW } };
  const out = trackKickoffs(changed, [pre('1', SUN_17)], NOW + DAY);
  assert.deepEqual(out, { 1: { date: SUN_17, was: SAT_21, at: NOW + DAY } });
});

test('trackKickoffs: pasar de «hora a confirmar» a tener hora no avisa', () => {
  const tbd = pre('1', '2026-11-14T03:00:00Z', { timeValid: false });
  const first = trackKickoffs({}, [tbd], NOW);
  assert.deepEqual(first, {});
  const out = trackKickoffs(first, [pre('1', SAT_19)], NOW + DAY);
  assert.deepEqual(out, { 1: { date: SAT_19 } });
  assert.equal(kickoffChange(out, pre('1', SAT_19), NOW + DAY), null);
});

test('trackKickoffs: un postergado conserva la fecha vieja y avisa cuando lo reprograman', () => {
  const stored = { 1: { date: SAT_19 } };
  const postponed = { id: '1', date: SAT_19, status: 'post', completed: false, timeValid: true, statusName: 'STATUS_POSTPONED' };
  const kept = trackKickoffs(stored, [postponed], NOW);
  assert.deepEqual(kept, stored);
  assert.equal(kickoffChange(kept, postponed, NOW), null);
  // Lo mismo si vuelve como «hora a confirmar» en otro día.
  const tbd = pre('1', '2026-12-01T03:00:00Z', { timeValid: false });
  assert.deepEqual(trackKickoffs(kept, [tbd], NOW), stored);
  assert.equal(kickoffChange(kept, tbd, NOW), null);
  const again = pre('1', '2026-12-02T00:00:00Z');
  const out = trackKickoffs(kept, [again], NOW + DAY);
  assert.equal(kickoffChange(out, again, NOW + DAY), SAT_19);
});

test('trackKickoffs: poda los partidos terminados y los que ya no vienen y pasaron hace más de un día', () => {
  const stored = {
    1: { date: '2026-11-08T22:00:00Z' }, // terminado
    2: { date: '2026-11-08T22:00:00Z' }, // ya no está en el fixture y pasó hace dos días
    3: { date: SAT_19 }, // no vino en este fixture, pero es a futuro: se conserva
    4: { date: '2026-11-10T14:00:00Z' }, // se está jugando: se conserva hasta que termine
  };
  const fixture = [
    { id: '1', date: '2026-11-08T22:00:00Z', status: 'post', completed: true, timeValid: true },
    { id: '4', date: '2026-11-10T14:00:00Z', status: 'in', completed: false, timeValid: true },
  ];
  assert.deepEqual(Object.keys(trackKickoffs(stored, fixture, NOW)), ['3', '4']);
});

test('trackKickoffs: no modifica lo guardado y tolera basura', () => {
  const stored = Object.freeze({ 1: Object.freeze({ date: SAT_19 }) });
  trackKickoffs(stored, [pre('1', SUN_17)], NOW);
  assert.deepEqual(stored, { 1: { date: SAT_19 } });
  for (const junk of [null, undefined, 'x', 7, [], [1, 2]]) assert.deepEqual(trackKickoffs(junk, [pre('1', SAT_19)], NOW), { 1: { date: SAT_19 } });
  const dirty = { 1: null, 2: 'x', 3: { date: 'no es fecha' }, 4: { date: SUN_17, was: SAT_19, at: 'ayer' } };
  assert.deepEqual(trackKickoffs(dirty, [pre('4', SUN_17)], NOW), { 4: { date: SUN_17 } });
  assert.equal(kickoffChange(dirty, pre('4', SUN_17), NOW), null);
  assert.equal(kickoffChange(null, pre('4', SUN_17), NOW), null);
  // Un partido con fecha rota no se guarda.
  assert.deepEqual(trackKickoffs({}, [pre('1', 'x')], NOW), {});
});

test('kickoffChange: no avisa si el partido ya no está por jugarse o volvió a la fecha anterior', () => {
  const changed = { 1: { date: SUN_17, was: SAT_19, at: NOW } };
  assert.equal(kickoffChange(changed, { ...pre('1', SUN_17), status: 'post' }, NOW), null);
  assert.equal(kickoffChange(changed, pre('1', SUN_17, { timeValid: false }), NOW), null);
  assert.equal(kickoffChange(changed, pre('2', SUN_17), NOW), null);
  assert.equal(kickoffChange(changed, pre('1', SAT_19), NOW), null);
});

test('kickoffChangeText: en hora de la Argentina; si es el mismo día, solo la hora', () => {
  assert.equal(kickoffChangeText(SAT_19, SUN_17), 'Cambió el horario: antes era sábado, 14 de noviembre, 19:00 h');
  // 00:00 UTC del 15 todavía es sábado 14 a las 21:00 en la Argentina.
  assert.equal(kickoffChangeText(SAT_19, SAT_21), 'Cambió el horario: antes era a las 19:00 h');
  assert.equal(kickoffChangeText(SAT_21, SUN_17), 'Cambió el horario: antes era sábado, 14 de noviembre, 21:00 h');
  assert.equal(kickoffChangeText(SAT_19), 'Cambió el horario: antes era sábado, 14 de noviembre, 19:00 h');
});

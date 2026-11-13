// Lo que sostiene el partido en vivo con mala señal: eventos ilegibles, refresco liviano, tabla opcional, la copia del
// deploy que no pisa datos más nuevos, postergados y el límite de tiempo que corta los pedidos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchLive, fetchLiveFast, normalizeEvent, patchLive, safeEvents } from '../src/lib/espn.js';
import { isOff, isUpcoming, keepNewest, liveCall, nextMatch } from '../src/lib/core.js';

const side = (id, name, homeAway, score) => ({
  homeAway,
  team: { id, displayName: name, logos: [{ href: `logo-${id}` }] },
  score: score == null ? undefined : { value: score, displayValue: String(score) },
});
const event = ({ id = '1', date = '2026-01-01T20:00Z', home, away, state = 'post', league = { slug: 'arg.1', name: 'Argentine Liga Profesional de Fútbol' } }) => ({
  id,
  date,
  league,
  competitions: [{ competitors: [home, away], status: { type: { state, completed: state === 'post', shortDetail: 'FT' } }, venue: { fullName: 'José Amalfitani' } }],
});
const boca = side('5', 'Boca Juniors', 'away', 0);
const velez = (score) => side('21', 'Vélez Sarsfield', 'home', score);
const clausura = (e) => ({ ...e, season: { slug: 'torneo-clausura' } });
const STANDINGS = { phase: 'Torneo Clausura' };

/** fetch simulado: `routes` = { 'parte de la URL': json | Error }. Guarda en `urls` lo que se pidió. */
const jsonFetch = (routes, urls = []) => async (url) => {
  urls.push(url);
  const key = Object.keys(routes).find((k) => url.includes(k));
  if (!key) throw new Error(`sin ruta: ${url}`);
  if (routes[key] instanceof Error) throw routes[key];
  return { ok: true, json: async () => routes[key] };
};

test('safeEvents saltea los partidos ilegibles sin perder el resto', (t) => {
  t.mock.method(console, 'warn', () => {});
  const good = event({ id: '1', home: velez(1), away: boca });
  const out = safeEvents([good, { id: '2' }, { id: '3', competitions: [{ competitors: [] }] }, null]);
  assert.deepEqual(out.map((m) => m.id), ['1']);
  assert.deepEqual(safeEvents(undefined), []);
});

test('normalizeEvent: una liga sin nombre no rompe y guarda el estado de ESPN', () => {
  const e = event({ home: velez(null), away: boca, state: 'pre', league: { slug: 'arg.rara' } });
  e.competitions[0].status.type.name = 'STATUS_POSTPONED';
  const m = normalizeEvent(e);
  assert.equal(m.comp, 'Otro');
  assert.equal(m.statusName, 'STATUS_POSTPONED');
});

test('patchLive: actualiza estado, reloj y goles por equipo, y conserva lo demás', () => {
  const m = normalizeEvent(event({ id: '7', home: velez(0), away: boca, state: 'in' }));
  // En el scoreboard el partido viene sin liga y podría venir con los equipos en otro orden.
  const fresh = normalizeEvent({ ...event({ id: '7', home: side('5', 'Boca Juniors', 'home', 1), away: side('21', 'Vélez Sarsfield', 'away', 2), state: 'in' }), league: undefined });
  const out = patchLive(m, fresh);
  assert.equal(out.home.id, '21');
  assert.deepEqual([out.home.score, out.away.score], [2, 1]);
  assert.equal(out.comp, 'Liga Profesional');
  assert.equal(out.venue, 'José Amalfitani');
  assert.equal(patchLive(m, undefined), m);
});

test('fetchLiveFast: solo el scoreboard, sobre los últimos datos completos', async () => {
  const live = normalizeEvent(event({ id: '7', home: velez(0), away: boca, state: 'in' }));
  const later = normalizeEvent(event({ id: '8', date: '2026-02-01T20:00Z', home: velez(null), away: boca, state: 'pre' }));
  const prev = { updatedAt: '2026-01-01T20:00:00.000Z', fixture: [live, later], results: ['r'], standings: STANDINGS };
  const urls = [];
  const board = { events: [clausura(event({ id: '7', home: velez(1), away: boca, state: 'in' }))] };
  const out = await fetchLiveFast(prev, jsonFetch({ scoreboard: board }, urls));
  assert.equal(urls.length, 1);
  assert.match(urls[0], /arg\.1\/scoreboard$/);
  assert.equal(out.fixture[0].home.score, 1);
  assert.equal(out.fixture[1], later);
  assert.equal(out.playing.length, 1);
  assert.deepEqual(out.results, ['r']);
  assert.notEqual(out.updatedAt, prev.updatedAt);
});

test('fetchLiveFast: pide un refresco completo si Vélez no está en el scoreboard o ya no se juega nada', async () => {
  const live = normalizeEvent(event({ id: '7', home: velez(0), away: boca, state: 'in' }));
  const prev = { fixture: [live], standings: STANDINGS };
  assert.equal(await fetchLiveFast(prev, jsonFetch({ scoreboard: { events: [] } })), null);
  const ended = { events: [clausura(event({ id: '7', home: velez(1), away: boca, state: 'post' }))] };
  assert.equal(await fetchLiveFast(prev, jsonFetch({ scoreboard: ended })), null);
});

test('fetchLiveFast: en una copa pide también el scoreboard de esa copa', async () => {
  const cup = normalizeEvent(event({ id: '9', home: velez(0), away: boca, state: 'in', league: { slug: 'arg.copa', name: 'Copa Argentina' } }));
  const urls = [];
  const routes = { 'arg.copa/scoreboard': { events: [event({ id: '9', home: velez(2), away: boca, state: 'in' })] }, 'arg.1/scoreboard': { events: [] } };
  const out = await fetchLiveFast({ fixture: [cup], standings: STANDINGS }, jsonFetch(routes, urls));
  assert.equal(urls.length, 2);
  assert.equal(out.fixture[0].home.score, 2);
  assert.equal(out.fixture[0].comp, 'Copa Argentina');
});

test('fetchLive: con una tabla de respaldo, que falle la tabla no tira el marcador; sin respaldo, sí', async () => {
  const sched = { events: [event({ id: '7', home: velez(1), away: boca, state: 'in' })] };
  const routes = { schedule: sched, standings: new Error('ESPN 503'), scoreboard: { events: [] } };
  const fallback = { phase: 'Torneo Clausura', groups: [] };
  const out = await fetchLive(jsonFetch(routes), { fallbackStandings: fallback });
  assert.equal(out.standings, fallback);
  assert.equal(out.fixture[0].home.score, 1);
  await assert.rejects(fetchLive(jsonFetch(routes)), /503/);
});

const fx = (id, status, completed = false) => ({ id, status, completed });

test('nextMatch: el que se juega o el próximo en pie; un postergado no tapa al siguiente', () => {
  const postponed = fx('1', 'post');
  assert.equal(nextMatch([postponed, fx('2', 'pre'), fx('3', 'pre')]).id, '2');
  assert.equal(nextMatch([fx('1', 'post', true), fx('2', 'pre'), fx('3', 'in')]).id, '3');
  assert.equal(nextMatch([postponed]), undefined);
  assert.equal(isUpcoming(postponed), false);
  assert.equal(isOff(postponed), true);
  assert.equal(isOff(fx('1', 'post', true)), false);
});

test('keepNewest: la copia del deploy no pisa datos más nuevos que ya estaban en pantalla', () => {
  const last = { updatedAt: '2026-11-13T22:30:00Z', n: 'en pantalla' };
  const snapshot = { updatedAt: '2026-11-13T22:00:00Z', n: 'copia' };
  assert.deepEqual(keepNewest(last, { data: snapshot, live: false }), { data: last, live: false });
  // Una copia más nueva que lo que había, los datos en vivo y la primera carga pasan tal cual.
  const newer = { data: { updatedAt: '2026-11-13T22:45:00Z' }, live: false };
  assert.equal(keepNewest(last, newer), newer);
  const liveNow = { data: { updatedAt: '2026-11-13T22:31:00Z' }, live: true };
  assert.equal(keepNewest(last, liveNow), liveNow);
  assert.equal(keepNewest(null, newer), newer);
});

test('liveCall: corta los pedidos cuando se pasa del límite', async (t) => {
  let signal;
  t.mock.method(globalThis, 'fetch', (url, init) => {
    signal = init.signal;
    return new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(init.signal.reason)));
  });
  await assert.rejects(liveCall((f) => f('https://ejemplo.test/'), 10), /timeout/);
  assert.equal(signal.aborted, true);
  assert.equal(await liveCall(async () => 'ok', 10), 'ok');
});

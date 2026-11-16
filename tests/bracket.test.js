import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBracket, currentRound, mergePlayoffEvents, seedMap, staleDays, teamPath, winnerId } from '../src/lib/bracket.js';
import { playoffEventsOf, playoffRounds } from '../src/lib/espn.js';
import { PLAYOFF_SEEDS } from '../src/lib/rules.js';

// Zonas A y B con 8 equipos: el id es el puesto («A3»), salvo Vélez, que es el 3.º de la A.
const team = (code) => ({ id: code === 'A3' ? '21' : code, name: code === 'A3' ? 'Vélez' : `Equipo ${code}`, logo: `logo-${code}` });
const groups = ['A', 'B'].map((z) => ({ name: `Zona ${z}`, rows: Array.from({ length: 8 }, (_, i) => ({ ...team(`${z}${i + 1}`), rank: i + 1, pts: 30 - i })) }));
const id = (code) => team(code).id;

const ROUNDS = [16, 8, 4, 2].map((n, i) => ({ id: String(7 + i), slug: `r${n}`, label: { 16: 'Octavos', 8: 'Cuartos', 4: 'Semifinales', 2: 'Final' }[n], teams: n }));

let seq = 0;
/** Partido de playoffs: `score` = [local, visitante] si terminó, 'in' si se juega, nada si falta. */
const match = (slug, h, a, score, extra = {}) => {
  const done = Array.isArray(score);
  return {
    id: String(++seq), slug, date: `2026-11-${String(10 + seq).padStart(2, '0')}T23:00Z`, timeValid: true,
    status: done ? 'post' : score === 'in' ? 'in' : 'pre', completed: done,
    home: { ...team(h), id: id(h), score: done ? score[0] : null, pen: extra.pen?.[0] ?? null, winner: done && (score[0] > score[1] || (extra.pen && extra.pen[0] > extra.pen[1])) },
    away: { ...team(a), id: id(a), score: done ? score[1] : null, pen: extra.pen?.[1] ?? null, winner: done && (score[1] > score[0] || (extra.pen && extra.pen[1] > extra.pen[0])) },
  };
};
const octavos = () => PLAYOFF_SEEDS.map(([a, b]) => match('r16', a, b));
const build = (events) => buildBracket({ groups, rounds: ROUNDS, events, seeds: PLAYOFF_SEEDS });

test('playoffRounds: rondas después de la fase regular, con el slug del scoreboard y el nombre en castellano', () => {
  const types = [
    { id: '6', name: 'Torneo Clausura', hasStandings: true, startDate: 'a' },
    { id: '7', name: 'Clausura - Round of 16', hasStandings: false, startDate: '2026-11-09T05:00Z', endDate: '2026-11-24T04:59Z' },
    { id: '8', name: 'Clausura - Quarterfinals', hasStandings: false },
    { id: '10', name: 'Clausura - Final', hasStandings: false },
    { id: '11', name: 'Torneo Apertura', hasStandings: true },
  ];
  const r = playoffRounds(types, { id: '6' });
  assert.deepEqual(r.map((x) => [x.slug, x.label, x.teams]), [['clausura---round-of-16', 'Octavos', 16], ['clausura---quarterfinals', 'Cuartos', 8], ['clausura---final', 'Final', 2]]);
  assert.equal(r[0].start, '2026-11-09T05:00Z');
  assert.deepEqual(playoffRounds(types, { id: '99' }), []);
});

test('playoffEventsOf: solo los partidos de las rondas de playoffs del scoreboard, con su slug', () => {
  const side = (tid, homeAway) => ({ homeAway, team: { id: tid, displayName: `T${tid}` }, score: '0' });
  const ev = (eid, slug) => ({ id: eid, date: '2026-11-20T23:00Z', season: { slug }, competitions: [{ competitors: [side('21', 'home'), side('4', 'away')], status: { type: { state: 'pre' } } }] });
  const standings = { playoffRounds: [{ slug: 'clausura---round-of-16' }] };
  const out = playoffEventsOf({ events: [ev('1', 'torneo-clausura'), ev('2', 'clausura---round-of-16')] }, standings);
  assert.deepEqual(out.map((m) => [m.id, m.slug, m.home.id]), [['2', 'clausura---round-of-16', '21']]);
  assert.deepEqual(playoffEventsOf(null, standings), []);
});

test('seedMap: «A1» es el 1.º de la Zona A', () => {
  const m = seedMap(groups);
  assert.equal(m.get('A3').name, 'Vélez');
  assert.equal(m.get('B8').id, 'B8');
});

test('buildBracket: octavos por puesto y rondas siguientes con los candidatos', () => {
  const b = build(octavos());
  assert.equal(b.tree, true);
  assert.deepEqual(b.rounds.map((r) => r.ties.length), [8, 4, 2, 1]);
  assert.deepEqual(b.rounds[0].ties[3].sides.map((s) => s.seed), ['A3', 'B6']);
  // Cuartos 2: el ganador de B2-A7 contra el de A3-B6 (Vélez).
  const qf = b.rounds[1].ties[1];
  assert.equal(qf.sides[0].team, null);
  assert.deepEqual(qf.sides[1].cands.map((t) => t.id), ['21', 'B6']);
  assert.equal(b.rounds[3].ties[0].sides[0].cands.length, 8);
  assert.equal(currentRound(b), 0);
});

test('buildBracket: el ganador pasa y el partido de la ronda siguiente se ubica por equipos', () => {
  const evs = octavos();
  evs[2] = match('r16', 'B2', 'A7', [0, 1]); // pasa A7
  evs[3] = match('r16', 'A3', 'B6', [1, 1], { pen: [4, 3] }); // pasa Vélez por penales
  const qf = match('r8', 'A3', 'A7');
  const b = build([...evs, qf]);
  assert.equal(b.tree, true);
  assert.equal(b.rounds[0].ties[3].winner, '21');
  assert.deepEqual(b.rounds[0].ties[3].sides.map((s) => [s.score, s.pen]), [[1, 4], [1, 3]]);
  const tie = b.rounds[1].ties[1];
  assert.deepEqual(tie.sides.map((s) => s.team.id), ['A7', '21']); // el orden es el del cuadro, no la localía
  assert.equal(tie.match.id, qf.id);
});

test('buildBracket: un partido que no encaja en el cuadro arma el cuadro plano', () => {
  const evs = octavos();
  evs[0] = match('r16', 'A1', 'B7'); // el formato cambió
  const b = build(evs);
  assert.equal(b.tree, false);
  assert.equal(b.rounds[0].ties.length, 8);
  assert.equal(b.rounds[1].ties.length, 0);
  assert.equal(buildBracket({ groups, rounds: ROUNDS, events: octavos(), seeds: null }).tree, false);
});

test('teamPath: próximo partido, con quién se cruzaría, eliminado y campeón', () => {
  const evs = octavos();
  let p = teamPath(build(evs), '21');
  assert.equal(p.state, 'next');
  assert.equal(p.rival.team.id, 'B6');
  assert.equal(p.next.round.label, 'Cuartos');
  assert.deepEqual(p.next.other.cands.map((t) => t.id), ['B2', 'A7']);

  evs[3] = match('r16', 'A3', 'B6', [0, 2]);
  p = teamPath(build(evs), '21');
  assert.equal(p.state, 'out');

  evs[3] = match('r16', 'A3', 'B6', 'in');
  assert.equal(teamPath(build(evs), '21').state, 'live');

  // Vélez gana todo.
  const all = octavos().map((m, i) => (i === 3 ? match('r16', 'A3', 'B6', [2, 0]) : i === 2 ? match('r16', 'B2', 'A7', [1, 0]) : m));
  for (const [i, m] of all.entries()) if (![2, 3].includes(i)) all[i] = match('r16', m.home.id, m.away.id, [1, 0]);
  const champ = build([...all, match('r8', 'B2', 'A3', [0, 1]), match('r8', 'A1', 'B4', [1, 0]), match('r8', 'B1', 'A4', [1, 0]), match('r8', 'A2', 'B3', [1, 0]),
    match('r4', 'A1', 'A3', [0, 1]), match('r4', 'B1', 'A2', [1, 0]), match('r2', 'A3', 'B1', [3, 1])]);
  assert.equal(champ.tree, true);
  assert.equal(teamPath(champ, '21').state, 'champion');
  assert.equal(currentRound(champ), 3);
  assert.equal(teamPath(champ, 'nadie'), null);
});

test('winnerId: por la marca de ESPN, el marcador o los penales', () => {
  const m = (h, a, hp = null, ap = null) => ({ completed: true, home: { id: 'h', score: h, pen: hp }, away: { id: 'a', score: a, pen: ap } });
  assert.equal(winnerId(m(2, 1)), 'h');
  assert.equal(winnerId(m(1, 1, 3, 4)), 'a');
  assert.equal(winnerId({ ...m(1, 1), away: { id: 'a', score: 1, winner: true } }), 'a');
  assert.equal(winnerId({ completed: false, home: {}, away: {} }), null);
});

test('mergePlayoffEvents: lo más nuevo pisa, salvo que esté menos avanzado', () => {
  const base = [{ id: '1', date: 'x', status: 'post', completed: true, slug: 'r16' }, { id: '2', date: 'y', status: 'pre', completed: false, slug: 'r16' }];
  const fresh = [{ id: '1', date: 'x', status: 'in', completed: false }, { id: '2', date: 'y', status: 'in', completed: false, clock: "30'" }, { id: '3', date: 'z', status: 'pre', slug: 'r8' }];
  const out = mergePlayoffEvents(base, fresh);
  assert.equal(out.find((m) => m.id === '1').completed, true);
  assert.equal(out.find((m) => m.id === '2').clock, "30'");
  assert.equal(out.find((m) => m.id === '2').slug, 'r16'); // conserva la ronda
  assert.equal(out.length, 3);
});

test('staleDays: días (hora argentina) con partidos que ya tendrían que haber terminado', () => {
  const now = Date.parse('2026-11-23T12:00Z');
  const evs = [
    { date: '2026-11-23T01:00Z', status: 'pre', completed: false }, // 22/11 a las 22 en la Argentina
    { date: '2026-11-21T20:00Z', status: 'post', completed: true },
    { date: '2026-11-21T18:00Z', status: 'post', completed: false }, // postergado: no se pide
    { date: '2026-11-23T11:00Z', status: 'in', completed: false }, // empezó hace 1 h: lo trae el scoreboard del día
  ];
  assert.deepEqual(staleDays(evs, now), ['20261122']);
});

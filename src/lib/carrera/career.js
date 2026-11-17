// Modo Carrera · el estado de la partida y cómo avanza: crear la carrera, entrenar, jugar el partido de la semana,
// la fecha libre, los playoffs y el torneo siguiente. Cada función recibe el estado y devuelve uno nuevo (no lo
// modifica), así se guarda tal cual en el navegador y se testea en Node. Todo el azar sale de la semilla de la
// carrera más la semana: recargar la página no cambia ningún resultado.
import { rng } from '../trivia.js';
import { hash } from '../daily.js';
import { WEEK_REST, clamp, matchCost, newPlayer, overall, roleOf, spotOf, train } from './player.js';
import { PLAYOFF_SPOTS, expectedGoals, nextPairs, playoffPairs, poisson, roundName, schedule, shootout, simMatch, table, teamsFrom } from './season.js';
import { isPenalty, makeMoments, matchRating, momentShape, outcomeKind, quality, resolveDribble, resolvePass, resolveSave, resolveShot, resolveTackle } from './match.js';
import { isBigMatch, matchLogros, torneoLogros } from './logros.js';
import { CLEAN_PRIZE, GOAL_PRIZE, WIN_PRIZE, hasPerk, perkOf, salaryOf } from './economia.js';
import { EVENTS, GOAL_REWARD, applyFx, goalProgress, goalsFor, pickEvent } from './extras.js';
import { PRESS, RETIRE_AT, RETIRE_FROM, ageAttrs, pickPress } from './historia.js';

export const SAVE_VERSION = 1;
const NEWS_MAX = 6;

const randOf = (state, ...keys) => rng(hash(`${state.seed}:${keys.join(':')}`));
const copy = (x) => structuredClone(x);

export const torneoLabel = (startYear, n) => `${(n - 1) % 2 ? 'Clausura' : 'Apertura'} ${startYear + Math.floor((n - 1) / 2)}`;

/** Compañeros para los textos de las jugadas: los de campo del plantel de ESPN. */
export function matesFrom(roster) {
  const names = (roster?.players ?? []).filter((p) => p.pos !== 'G' && p.name).map((p) => p.name);
  return names.length ? names.slice(0, 30) : ['un compañero'];
}

function newTorneo(state, n, teams) {
  return {
    n, label: torneoLabel(state.startYear, n), teams,
    fixtures: schedule(teams, randOf(state, 'fixture', n)),
    results: [], week: 0, phase: 'liga', bracket: null,
    stats: { pj: 0, tit: 0, g: 0, a: 0, at: 0, qt: 0, vi: 0, ratings: [], res: { pj: 0, g: 0, a: 0, at: 0, qt: 0 } },
    trained: null, match: null, last: null, summary: null, event: null,
    goals: goalsFor(state.player),
  };
}

/** Carrera nueva. null si los datos no alcanzan (sin la tabla de ESPN o sin Vélez en ella). */
export function newCareer({ name, pos, spot, extra, standings, roster, velezId, seed }) {
  const teams = teamsFrom(standings, velezId);
  if (!teams) return null;
  const state = {
    v: SAVE_VERSION, seed: seed >>> 0, velez: String(velezId), startYear: (standings.year ?? 2026) + 1,
    player: newPlayer({ name, pos, spot, extra }), mates: matesFrom(roster), history: [], news: [], torneo: null,
  };
  state.torneo = newTorneo(state, 1, teams);
  state.news = [{ n: 1, text: `Firmaste tu primer contrato con Vélez. Arrancás en la Reserva.` }];
  return state;
}

const teamOf = (t, id) => t.teams.find((x) => x.id === id);
const weekKey = (t) => (t.phase === 'playoffs' ? `P${t.bracket.rounds.length - 1}` : `L${t.week}`);
const pushNews = (state, text) => { state.news = [{ n: state.torneo.n, text }, ...state.news].slice(0, NEWS_MAX); };

/** El partido de Vélez de esta semana: { kind: 'liga' | 'playoff' | 'libre', label, rival, home } o null si terminó. */
export function currentGame(state) {
  const t = state.torneo;
  if (t.phase === 'liga') {
    const label = `Fecha ${t.week + 1}`;
    const pair = t.fixtures[t.week]?.find((p) => p.includes(state.velez));
    if (!pair) return { kind: 'libre', label };
    const home = pair[0] === state.velez;
    return { kind: 'liga', label, rival: teamOf(t, home ? pair[1] : pair[0]), home };
  }
  if (t.phase === 'playoffs') {
    const round = t.bracket.rounds.at(-1);
    const tie = round.find((x) => !x.score && (x.h === state.velez || x.a === state.velez));
    if (!tie) return null;
    const home = tie.h === state.velez;
    return { kind: 'playoff', label: roundName(round.length), rival: teamOf(t, home ? tie.a : tie.h), home };
  }
  return null;
}

export function weekTitle(state) {
  const g = currentGame(state);
  return g ? `${state.torneo.label} · ${g.label}` : state.torneo.label;
}

/** Entrenamiento de la semana (una vez por semana). */
export function trainWeek(state, key) {
  if (state.torneo.trained || state.torneo.match || !currentGame(state)) return state;
  const s = copy(state);
  const before = overall(s.player);
  const r = train(s.player, key, randOf(s, 'train', s.torneo.n, weekKey(s.torneo)));
  s.player = r.player;
  s.torneo.trained = { key, gain: r.gain, attr: r.attr, tired: r.tired, ov: [before, overall(s.player)] };
  return s;
}

/**
 * El evento de la semana (fuera de la cancha): { event, choice } o null. `choice` es la opción elegida o null si
 * todavía no se eligió. Sale de la semilla y la semana: siempre el mismo para la misma semana.
 */
export function weekEvent(state) {
  const t = state.torneo;
  if (!currentGame(state) || t.phase === 'fin') return null;
  if (t.event) return { event: EVENTS.find((e) => e.id === t.event.id), choice: t.event.choice };
  if (t.match || t.last) return null;
  const event = pickEvent(randOf(state, 'evento', t.n, weekKey(t)), t.n === 1 && t.week === 0, state.player);
  return event ? { event, choice: null } : null;
}

/** Elige una opción del evento de la semana y aplica sus efectos (una sola vez). */
export function chooseEvent(state, i) {
  const ev = weekEvent(state);
  if (!ev || ev.choice != null || !ev.event.options[i]) return state;
  const s = copy(state);
  const before = overall(s.player);
  s.player = applyFx(s.player, ev.event.options[i].fx);
  s.torneo.event = { id: ev.event.id, choice: i, ov: [before, overall(s.player)] };
  // Rechazar la oferta del exterior para quedarse en Vélez es un logro.
  if (ev.event.id === 'oferta' && i === 0 && !s.logros?.leal) s.logros = { ...(s.logros ?? {}), leal: s.torneo.n };
  return s;
}

/** Arma el partido de la semana: rol, fuerzas, goles del resto del equipo (con su minuto) y las jugadas. */
export function startMatch(state) {
  const game = currentGame(state);
  if (!game || game.kind === 'libre' || state.torneo.match) return state;
  const s = copy(state);
  const t = s.torneo;
  const r = randOf(s, 'match', t.n, weekKey(t));
  const role = roleOf(s.player);
  const side = role === 'reserva' ? 'reserva' : 'primera';
  const ov = overall(s.player);
  const velez = teamOf(t, s.velez);
  // Lo que el jugador le suma al equipo: con tope, para que un crack no haga campeón a Vélez solo.
  const lift = clamp((ov - 55) / 6, -3, 4);
  const vStr = side === 'reserva' ? velez.str - 6 + lift : velez.str + (role === 'titular' ? lift : lift / 2);
  const rStr = side === 'reserva' ? game.rival.str - 6 : game.rival.str;
  const [lh, la] = game.home ? expectedGoals(vStr, rStr) : expectedGoals(rStr, vStr);
  const [lv, lr] = game.home ? [lh, la] : [la, lh];
  const { mix, key: spot } = spotOf(s.player);
  // Las chances que pasan por el jugador: las de gol de Vélez (según cuánto ataca su lugar) y, para arqueros y
  // defensores, también las del rival (esas las juega él: si falla, es gol de ellos).
  const defending = (mix.quite ?? 0) + (mix.atajada ?? 0);
  const share = (role === 'suplente' ? 0.12 : 0.3) * (1 - defending);
  const guard = (role === 'suplente' ? 0.4 : 1) * 0.4 * defending;
  const mates = s.mates;
  const events = [];
  for (let i = poisson(r, lv * (1 - share)); i > 0; i--) events.push({ min: 1 + Math.floor(r() * 90), team: 'v', who: mates[Math.floor(r() * mates.length)] });
  for (let i = poisson(r, lr * (1 - guard)); i > 0; i--) events.push({ min: 1 + Math.floor(r() * 90), team: 'r' });
  events.sort((a, b) => a.min - b.min);
  const moments = makeMoments(r, {
    count: role === 'suplente' ? 2 : 3, from: role === 'suplente' ? 62 : 6, to: 88,
    mix, headers: spot === 'dci' || spot === 'dcd', player: s.player, rivalStr: rStr,
  });
  t.match = { kind: game.kind, label: game.label, side, role, home: game.home, big: isBigMatch(game.rival), rival: { ...game.rival, str: Math.round(rStr) }, moments, answers: [], events };
  return s;
}

/**
 * Goles hasta la jugada `i` (lo que pasó antes de su minuto), por minuto. Sin `i`, todos. Con `through`, también
 * los de esa jugada y su minuto (para mostrar el marcador justo después de jugarla).
 */
export function eventsAt(match, i = Infinity, through = false) {
  const min = match.moments[i]?.min ?? Infinity;
  const keep = (e) => (e.mi != null ? (through ? e.mi <= i : e.mi < i) : through ? e.min <= min : e.min < min);
  return match.events.filter(keep).sort((a, b) => a.min - b.min);
}

/** Marcador de la jugada `i`: [Vélez, rival]. Sin `i`, el final. */
export function scoreAt(match, i = Infinity) {
  const before = eventsAt(match, i);
  return [before.filter((e) => e.team === 'v').length, before.filter((e) => e.team === 'r').length];
}

/**
 * Juega la jugada que sigue. `choice` = adónde patea (remate y penal) o qué pase da; `x` = dónde frenó la barra
 * (0–1). Con `x` null (reducir movimiento) la ejecución sale del azar.
 */
export function answerMoment(state, { choice, x }) {
  const m0 = state.torneo.match;
  if (!m0 || m0.answers.length >= m0.moments.length) return state;
  const s = copy(state);
  const t = s.torneo;
  const m = t.match;
  const i = m.answers.length;
  const mo = m.moments[i];
  const r = randOf(s, 'moment', t.n, weekKey(t), i);
  const q = x == null ? 0.35 + r() * 0.45 : quality(clamp(x, 0, 1), mo.center, mo.width);
  const rq = Math.round(q * 100) / 100;
  if (mo.type === 'pase') {
    const mate = s.mates[Math.floor(r() * s.mates.length)];
    const res = resolvePass(r, { q, option: choice, attr: s.player.attrs.pase, rivalStr: m.rival.str, mate });
    m.answers.push({ q: rq, choice, ok: res.ok, assist: res.assist, kind: res.kind, mate, text: res.text });
    if (res.assist) m.events.push({ min: mo.min, mi: i, team: 'v', who: mate, assist: true });
  } else if (mo.type === 'gambeta') {
    const res = resolveDribble(r, { q, option: choice, attr: s.player.attrs.velocidad, rivalStr: m.rival.str });
    m.answers.push({ q: rq, choice, ok: res.ok, kind: res.kind, text: res.text });
    // Si la pasó, la jugada sigue: queda de frente al arco en el mismo minuto.
    if (res.ok) m.moments.splice(i + 1, 0, { ...momentShape(r, { min: mo.min, type: 'remate', kind: res.next, player: s.player, rivalStr: m.rival.str }), from: 'gambeta' });
  } else if (mo.type === 'quite') {
    const mate = s.mates[Math.floor(r() * s.mates.length)];
    const res = resolveTackle(r, { q, option: choice, attr: s.player.attrs.fisico, rivalStr: m.rival.str, mate });
    m.answers.push({ q: rq, choice, ok: res.ok, kind: res.kind, mate: res.counter ? mate : undefined, text: res.text });
    if (res.counter) m.events.push({ min: mo.min, mi: i, team: 'v', who: mate, counter: true });
    if (res.kind === 'golrival') m.events.push({ min: mo.min, mi: i, team: 'r' });
  } else if (mo.type === 'atajada') {
    const res = resolveSave(r, { q, dive: choice, kind: mo.kind, tell: mo.tell, attr: s.player.attrs.remate, rivalStr: m.rival.str });
    m.answers.push({ q: rq, choice, saved: res.saved, shot: res.shot, kind: res.kind, text: res.text });
    if (res.kind === 'golrival' && mo.kind !== 'penal') m.events.push({ min: mo.min, mi: i, team: 'r' });
  } else {
    const res = resolveShot(r, { q, aim: choice, kind: mo.type === 'penal' ? 'penal' : mo.kind, attr: s.player.attrs.remate, rivalStr: m.rival.str, bonus: hasPerk(s.player, 'botines') ? 0.01 : 0 });
    m.answers.push({ q: rq, choice, goal: res.goal, keeper: res.keeper, kind: res.kind, text: res.text });
    if (res.goal && mo.type !== 'penal') m.events.push({ min: mo.min, mi: i, team: 'v', who: s.player.name, mine: true });
  }
  // En playoffs, empate al final y el jugador en cancha: patea en la definición por penales.
  // El arquero, en cambio, ataja uno.
  if (m.answers.length === m.moments.length && m.kind === 'playoff' && m.side === 'primera' && !m.moments.some(isPenalty)) {
    const [v, rv] = scoreAt(m);
    const keeper = s.player.pos === 'arq';
    if (v === rv) m.moments.push(momentShape(r, { min: 120, type: keeper ? 'atajada' : 'penal', kind: 'penal', player: s.player, rivalStr: m.rival.str }));
  }
  return s;
}

const velezScore = (v, r, home) => (home ? [v, r] : [r, v]);

/** Simula los demás partidos de la fecha (o de la ronda de playoffs) con el resultado de Vélez ya puesto. */
function fillRound(s, velezResult) {
  const t = s.torneo;
  const r = randOf(s, 'fecha', t.n, weekKey(t));
  const str = (id) => teamOf(t, id).str;
  if (t.phase === 'liga') {
    t.results[t.week] = t.fixtures[t.week].map(([h, a]) => (h === s.velez || a === s.velez ? velezResult.score : simMatch(r, str(h), str(a))));
    return;
  }
  const round = t.bracket.rounds.at(-1);
  for (const tie of round) {
    if (tie.h === s.velez || tie.a === s.velez) Object.assign(tie, velezResult);
    else {
      tie.score = simMatch(r, str(tie.h), str(tie.a));
      tie.pens = tie.score[0] === tie.score[1] ? shootout(r, str(tie.h), str(tie.a)) : null;
    }
    tie.winner = tie.score[0] > tie.score[1] || (tie.score[0] === tie.score[1] && tie.pens) ? tie.h : tie.a;
  }
}

/** Simula las rondas de playoffs que falten (Vélez afuera o sin clasificar) y cierra el torneo. */
function simRest(s) {
  const t = s.torneo;
  const r = randOf(s, 'resto', t.n, t.bracket.rounds.length);
  const str = (id) => teamOf(t, id).str;
  for (;;) {
    const round = t.bracket.rounds.at(-1);
    for (const tie of round) {
      if (!tie.score) {
        tie.score = simMatch(r, str(tie.h), str(tie.a));
        tie.pens = tie.score[0] === tie.score[1] ? shootout(r, str(tie.h), str(tie.a)) : null;
        tie.winner = tie.score[0] > tie.score[1] || (tie.score[0] === tie.score[1] && tie.pens) ? tie.h : tie.a;
      }
    }
    if (round.length === 1) break;
    t.bracket.rounds.push(nextPairs(round.map((x) => x.winner)).map(([h, a]) => ({ h, a, score: null, pens: null, winner: null })));
  }
  closeTorneo(s);
}

export function zoneTables(t) {
  return [...new Set(t.teams.map((x) => x.zone))].sort().map((z) => table(t.teams, t.fixtures, t.results, z));
}

function closeTorneo(s) {
  const t = s.torneo;
  const zone = teamOf(t, s.velez).zone;
  const pos = zoneTables(t)[zone]?.find((r) => r.id === s.velez)?.rank ?? null;
  const final = t.bracket?.rounds.at(-1)?.[0];
  const champion = final?.winner ? teamOf(t, final.winner) : null;
  let result = 'Fase regular';
  if (champion?.id === s.velez) result = 'Campeón';
  else if (t.bracket) {
    const reached = t.bracket.rounds.findLastIndex((round) => round.some((x) => x.h === s.velez || x.a === s.velez));
    if (reached >= 0) {
      const name = roundName(t.bracket.rounds[reached].length);
      result = name === 'Final' ? 'Subcampeón' : name;
    }
  }
  const st = t.stats;
  const avg = st.ratings.length ? Math.round((st.ratings.reduce((a, b) => a + b, 0) / st.ratings.length) * 10) / 10 : null;
  t.phase = 'fin';
  // Metas: cada una cumplida suma hinchas al cierre.
  const goals = goalProgress(t);
  const done = goals.filter((g) => g.done).length;
  s.player.fans = clamp(s.player.fans + done * GOAL_REWARD, 0, 100);
  t.summary = {
    n: t.n, label: t.label, pos, result, champion: champion?.name ?? null, pj: st.pj, tit: st.tit, g: st.g, a: st.a, at: st.at ?? 0, qt: st.qt ?? 0, vi: st.vi ?? 0, avg, res: st.res,
    age: s.player.age, ov: overall(s.player), goals: { done, total: goals.length },
  };
  const logros = torneoLogros(s.logros ?? {}, t, { result, goalsDone: done, goalsTotal: goals.length });
  s.logros = { ...(s.logros ?? {}), ...Object.fromEntries(logros.map((id) => [id, t.n])) };
  t.summary.logros = logros;
  if (result === 'Campeón') pushNews(s, `¡Vélez campeón del ${t.label}!`);
  else if (champion) pushNews(s, `${champion.name} se quedó con el ${t.label}.`);
}

/** Pasa a la semana siguiente: la próxima fecha, los playoffs o el cierre del torneo. */
function advance(s) {
  const t = s.torneo;
  s.player.energy = clamp(s.player.energy + WEEK_REST + (hasPerk(s.player, 'preparador') ? 6 : 0), 0, 100);
  t.trained = null;
  t.match = null;
  t.event = null;
  if (t.phase === 'liga') {
    t.week += 1;
    if (t.week < t.fixtures.length) return;
    const pairs = playoffPairs(zoneTables(t));
    t.bracket = { rounds: [pairs.map(([h, a]) => ({ h, a, score: null, pens: null, winner: null }))] };
    if (pairs.some((p) => p.includes(s.velez))) {
      t.phase = 'playoffs';
      pushNews(s, `Vélez se metió en los playoffs del ${t.label}.`);
    } else simRest(s);
    return;
  }
  const round = t.bracket.rounds.at(-1);
  const alive = round.some((x) => x.winner === s.velez);
  if (round.length === 1 || !alive) return round.length === 1 ? closeTorneo(s) : simRest(s);
  t.bracket.rounds.push(nextPairs(round.map((x) => x.winner)).map(([h, a]) => ({ h, a, score: null, pens: null, winner: null })));
}

/** ¿Están jugadas todas las jugadas del partido? */
export const matchDone = (match) => !!match && match.answers.length >= match.moments.length;

/** Cierra el partido: resultado, puntaje, confianza del DT, hinchas, estadísticas, novedades y la fecha completa. */
export function finishMatch(state) {
  const m0 = state.torneo.match;
  if (!matchDone(m0)) return state;
  const s = copy(state);
  const t = s.torneo;
  const m = t.match;
  const p = s.player;
  const r = randOf(s, 'fin', t.n, weekKey(t));
  const [v, rv] = scoreAt(m);
  const ko = m.kind === 'playoff';
  const shots = m.answers.filter((a, i) => m.moments[i].type === 'remate');
  const passes = m.answers.filter((a, i) => m.moments[i].type === 'pase');
  const goals = shots.filter((a) => a.goal).length;
  const assists = passes.filter((a) => a.assist).length;
  const dribbles = m.answers.filter((a, i) => m.moments[i].type === 'gambeta');
  const good = passes.filter((a) => a.ok && !a.assist).length + shots.filter((a) => !a.goal && a.q >= 0.5).length + dribbles.filter((a) => a.ok).length;
  const bad = passes.filter((a) => !a.ok).length + shots.filter((a) => a.q < 0.15).length + dribbles.filter((a) => !a.ok).length;
  // Lo del arquero y los defensores (sin el penal de la definición).
  const kindsOf = (type) => m.answers.filter((a, i) => m.moments[i].type === type && !isPenalty(m.moments[i])).map((a) => a.kind);
  const saves = kindsOf('atajada');
  const tackles = kindsOf('quite');
  const nSaves = saves.filter((k) => k === 'tapada').length;
  const nTackles = tackles.filter((k) => k === 'quite' || k === 'contra').length;
  const penIdx = m.moments.findIndex(isPenalty);
  // En la definición: el penal propio entró, o el arquero atajó el del rival.
  const penGoal = penIdx >= 0 ? (m.moments[penIdx].type === 'penal' ? m.answers[penIdx]?.goal : m.answers[penIdx]?.saved) : null;

  // El partido de Primera (el del torneo). Si el jugador estuvo en la Reserva, se simula aparte.
  const velez = teamOf(t, s.velez);
  let first;
  if (m.side === 'primera') {
    const pens = ko && v === rv ? (penGoal != null ? r() < (penGoal ? 0.62 : 0.38) : shootout(r, velez.str, m.rival.str)) : null;
    first = { v, r: rv, pens };
  } else {
    const [gh, ga] = m.home ? simMatch(r, velez.str, m.rival.str) : simMatch(r, m.rival.str, velez.str);
    const [fv, fr] = m.home ? [gh, ga] : [ga, gh];
    first = { v: fv, r: fr, pens: ko && fv === fr ? shootout(r, velez.str, m.rival.str) : null };
  }
  const velezWon = first.v > first.r || (first.v === first.r && first.pens === true);
  const score = velezScore(first.v, first.r, m.home);
  // En playoffs `pens` es «ganó el local por penales».
  fillRound(s, { score, pens: first.pens == null ? null : m.home ? first.pens : !first.pens });

  const own = m.side === 'primera' ? first : { v, r: rv };
  const keeper = p.pos === 'arq';
  const clean = (keeper || p.pos === 'def') && own.r === 0; // valla invicta: solo cuenta para arqueros y defensores
  const penSaved = penIdx >= 0 && m.moments[penIdx].type === 'atajada' && m.answers[penIdx]?.saved;
  const extra = nSaves * 0.6 + (penSaved ? 1 : 0) - saves.filter((k) => k === 'golrival').length * 0.3 - saves.filter((k) => k === 'desviado').length * 0.1
    + nTackles * 0.35 + tackles.filter((k) => k === 'contra').length * 0.5 - tackles.filter((k) => k === 'golrival').length * 0.5 - tackles.filter((k) => k === 'salvada').length * 0.15
    + (clean ? (keeper ? 0.5 : 0.3) : 0);
  const rating = matchRating({ goals, assists, good, bad, extra, result: Math.sign(own.v - own.r) || (own.pens == null ? 0 : own.pens ? 1 : -1), noise: r() });
  const dtBefore = p.dt;
  const debut = m.side === 'primera' && t.stats.pj === 0 && !s.history.some((h) => h.pj > 0);
  const firstGoal = m.side === 'primera' && goals > 0 && t.stats.g === 0 && !s.history.some((h) => h.g > 0);
  const rawDt = m.side === 'primera' ? (rating - 6.2) * 6 : (rating - 6.2) * 5 + 2;
  const dtDelta = Math.round(rawDt < 0 && hasPerk(p, 'psicologo') ? rawDt * 0.6 : rawDt); // mejora: psicólogo
  p.dt = clamp(p.dt + dtDelta, 0, 100);
  // En un partido grande cada gol vale el doble para la tribuna.
  const bigBonus = m.big && m.side === 'primera' ? goals * 3 + (velezWon ? 2 : 0) : 0;
  const defFans = nSaves + (penSaved ? 3 : 0) + tackles.filter((k) => k === 'contra').length * 2 + (clean ? 1 : 0);
  p.fans = clamp(p.fans + bigBonus + (m.side === 'primera' ? goals * 3 + assists * 2 + defFans + (rating >= 8 ? 2 : 0) + (velezWon ? 1 : 0) : goals + (rating >= 8 ? 1 : 0)), 0, 100);
  p.energy = clamp(p.energy - matchCost(p, m.role), 0, 100);
  const doneBefore = new Set(goalProgress(t).filter((g) => g.done).map((g) => g.key));
  if (m.side === 'primera') {
    t.stats.pj += 1;
    if (m.role === 'titular') t.stats.tit += 1;
    t.stats.g += goals;
    t.stats.a += assists;
    t.stats.at = (t.stats.at ?? 0) + nSaves;
    t.stats.qt = (t.stats.qt ?? 0) + nTackles;
    t.stats.vi = (t.stats.vi ?? 0) + (clean ? 1 : 0);
    t.stats.ratings.push(rating);
  } else {
    t.stats.res.pj += 1;
    t.stats.res.g += goals;
    t.stats.res.a += assists;
    t.stats.res.at = (t.stats.res.at ?? 0) + nSaves;
    t.stats.res.qt = (t.stats.res.qt ?? 0) + nTackles;
  }
  const newsTop = s.news[0] ?? null;
  p.form = [...(p.form ?? []), { r: rating, side: m.side, res: Math.sign(own.v - own.r) || (own.pens == null ? 0 : own.pens ? 1 : -1) }].slice(-5);
  if (debut) pushNews(s, `Debutaste en la Primera de Vélez contra ${m.rival.name}.`);
  if (firstGoal) pushNews(s, `¡Tu primer gol en Primera! Fue contra ${m.rival.name}.`);
  if (dtBefore < 50 && p.dt >= 50) pushNews(s, 'El DT te subió a entrenar con la Primera: vas al banco.');
  if (dtBefore < 70 && p.dt >= 70) pushNews(s, 'Te ganaste la titularidad.');
  if (dtBefore >= 70 && p.dt < 70) pushNews(s, 'Perdiste el puesto: volvés al banco.');
  if (dtBefore >= 50 && p.dt < 50) pushNews(s, 'El DT te mandó a jugar a la Reserva.');
  for (const g of goalProgress(t)) if (g.done && !doneBefore.has(g.key)) pushNews(s, `Meta cumplida: ${g.text.charAt(0).toLowerCase()}${g.text.slice(1)}.`);

  // Logros del partido: se guardan para siempre con el número de torneo.
  const kinds = m.answers.map((a, i) => ({ type: m.moments[i].type, sub: m.moments[i].kind, choice: a.choice, kind: outcomeKind(m.moments[i].type, a) }));
  const logros = matchLogros(s.logros ?? {}, { side: m.side, goals, assists, rating, big: !!m.big, kinds, fans: p.fans, saves: nSaves, clean });
  s.logros = { ...(s.logros ?? {}), ...Object.fromEntries(logros.map((id) => [id, t.n])) };

  // Cobro de la semana: sueldo más premios por gol, por valla invicta y por triunfo (solo en Primera).
  const prize = m.side === 'primera' ? goals * GOAL_PRIZE + (clean ? CLEAN_PRIZE : 0) + (velezWon ? WIN_PRIZE : 0) : 0;
  const earned = salaryOf(p) + prize;
  p.money = (p.money ?? 0) + earned;

  t.last = {
    label: m.label, kind: m.kind, side: m.side, role: m.role, home: m.home, rival: { id: m.rival.id, name: m.rival.name, logo: m.rival.logo },
    own: { v: own.v, r: own.r }, first, rating, goals, assists, saves: nSaves, tackles: nTackles, clean, penSaved, dtDelta, energy: p.energy, big: !!m.big, figura: rating >= 8, logros, earned, prize,
    // Conferencia de prensa (a veces, solo en Primera): se contesta en el resultado.
    press: pickPress(randOf(s, 'prensa', t.n, weekKey(t)), { side: m.side, goals, result: Math.sign(own.v - own.r) || (own.pens == null ? 0 : own.pens ? 1 : -1) }),
    pressChoice: null,
  };
  advance(s);
  // Los hitos de este partido (debut, primer gol, titularidad, playoffs, título): se festejan en el resultado.
  const until = newsTop ? s.news.indexOf(newsTop) : -1;
  t.last.news = s.news.slice(0, until < 0 ? s.news.length : until).map((x) => x.text);
  return s;
}

/** Fecha libre: se simula el resto y se pasa a la semana siguiente. */
export function skipWeek(state) {
  if (currentGame(state)?.kind !== 'libre') return state;
  const s = copy(state);
  fillRound(s, { score: null });
  const earned = salaryOf(s.player);
  s.player.money = (s.player.money ?? 0) + earned;
  s.torneo.last = { label: currentGame(state).label, libre: true, earned };
  advance(s);
  return s;
}

/** Compra una mejora (una vez, si alcanza la plata). Algunas tienen un efecto al comprarlas. */
export function buyPerk(state, id) {
  const perk = perkOf(id);
  if (!perk || hasPerk(state.player, id) || (state.player.money ?? 0) < perk.cost) return state;
  const s = copy(state);
  s.player.money -= perk.cost;
  s.player.perks = [...(s.player.perks ?? []), id];
  if (perk.fx) s.player = applyFx(s.player, perk.fx);
  pushNews(s, `Invertiste en: ${perk.title.toLowerCase()}.`);
  return s;
}

const ROUND_SHORT = { 'Octavos de final': '8vos', 'Cuartos de final': '4tos', Semifinal: 'Semi', Final: 'Final' };

/**
 * El calendario de Vélez en el torneo: una fila por fecha (y por ronda de playoffs) con el rival, la localía, el
 * resultado desde el lado de Vélez ([a favor, en contra]) y cuál es la de esta semana.
 */
export function velezCalendar(state) {
  const t = state.torneo;
  const out = t.fixtures.map((fecha, f) => {
    const now = t.phase === 'liga' && f === t.week;
    const i = fecha.findIndex((p) => p.includes(state.velez));
    if (i < 0) return { key: `L${f}`, label: `F${f + 1}`, libre: true, now, played: f < t.week || t.phase !== 'liga' };
    const [h, a] = fecha[i];
    const home = h === state.velez;
    const sc = t.results[f]?.[i];
    return { key: `L${f}`, label: `F${f + 1}`, rival: teamOf(t, home ? a : h), home, score: sc ? (home ? sc : [sc[1], sc[0]]) : null, now, played: !!sc };
  });
  for (const [k, round] of (t.bracket?.rounds ?? []).entries()) {
    const tie = round.find((x) => x.h === state.velez || x.a === state.velez);
    if (!tie) continue;
    const home = tie.h === state.velez;
    out.push({
      key: `P${k}`, label: ROUND_SHORT[roundName(round.length)] ?? 'PO', rival: teamOf(t, home ? tie.a : tie.h), home,
      score: tie.score ? (home ? tie.score : [tie.score[1], tie.score[0]]) : null, won: tie.winner ? tie.winner === state.velez : null,
      now: t.phase === 'playoffs' && !tie.score, played: !!tie.score,
    });
  }
  return out;
}

/** Ya se vio el resultado: se saca la tarjeta del último partido. */
export function dismissLast(state) {
  if (!state.torneo.last) return state;
  const s = copy(state);
  s.torneo.last = null;
  return s;
}

/** Contesta la pregunta de la conferencia de prensa del último partido (una vez) y aplica sus efectos. */
export function answerPress(state, i) {
  const l = state.torneo.last;
  const a = l?.press && l.pressChoice == null ? PRESS[l.press]?.answers[i] : null;
  if (!a) return state;
  const s = copy(state);
  s.player = applyFx(s.player, a.fx);
  s.torneo.last.pressChoice = i;
  return s;
}

/** ¿Se puede retirar (o tiene que)? { can, must }. */
export function retireState(state) {
  const fin = state.torneo.phase === 'fin' && !state.retired;
  return { can: fin && state.player.age >= RETIRE_FROM, must: fin && state.player.age >= RETIRE_AT };
}

/** Cuelga los botines al final de un torneo: la carrera queda cerrada (se ve la despedida). */
export function retire(state) {
  if (!retireState(state).can) return state;
  const s = copy(state);
  const t = s.torneo;
  if (!s.history.some((h) => h.n === t.summary.n)) s.history = [...s.history, t.summary];
  s.retired = { n: t.n, age: s.player.age };
  pushNews(s, `Te retiraste a los ${Math.floor(s.player.age)} años, después de ${s.history.length} torneos en Vélez.`);
  return s;
}

/** Torneo siguiente: medio año más (desde los 31 el cuerpo empieza a pesar), energía llena y las fuerzas cambian. */
export function nextTorneo(state) {
  if (state.torneo.phase !== 'fin' || retireState(state).must || state.retired) return state;
  const s = copy(state);
  const t = s.torneo;
  const r = randOf(s, 'drift', t.n);
  s.history = [...s.history, t.summary];
  s.player.age += 0.5;
  s.player.attrs = ageAttrs(s.player.attrs, s.player.age);
  s.player.energy = 100;
  // Vuelven un poco hacia la media y se mueven al azar: ningún equipo queda arriba para siempre.
  const teams = t.teams.map((x) => ({ ...x, str: Math.round(clamp(x.str * 0.85 + 61 * 0.15 + (r() - 0.5) * 6, 50, 72)) }));
  s.torneo = newTorneo(s, t.n + 1, teams);
  return s;
}

/** Lo que clasifica a playoffs por zona (para la tabla). */
export const SPOTS = PLAYOFF_SPOTS;

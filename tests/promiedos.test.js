import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeGame, normalizeLeagueTables, normalizeTeam } from '../js/promiedos.js';

const team = (id, name) => ({ id, name, short_name: name });

test('normalizeLeagueTables: nombres de tablas, columnas, colores de zona y años de promedios', () => {
  const row = (num, id, color, values) => ({ num, entity: { object: team(id, `T${id}`) }, values: Object.entries(values).map(([key, value]) => ({ key, value })), ...(color ? { destination_color: color } : {}) });
  const t = normalizeLeagueTables({
    tables_groups: [
      { name: 'Clausura', tables: [{ name: 'Grupo A', table: { columns: [{ key: 'Points', title: 'PTS', is_bold: true }, { key: '{trend}', title: 'Últimas' }], destinations: [{ color: '#03A9F4', name: 'Octavos de Final' }], rows: [row(1, 'ihc', '#03A9F4', { Points: '21' })] } }] },
      { name: '', tables: [{ name: 'Promedios - Relegation', table: { columns: [{ key: 'Pct', title: 'Prom' }, { key: 'GamesWon', title: '24' }], rows: [row(30, 'x', '#E61034', { Pct: '0.9' })] } }] },
      { name: '', tables: [{ name: 'Tabla Anual - Tabla Anual', table: { columns: [], rows: [] } }] },
    ],
  });
  assert.deepEqual(t.map((x) => x.name), ['Zona A · Clausura', 'Promedios', 'Tabla anual']);
  assert.deepEqual(t[0].columns, [{ key: 'Points', title: 'PTS', bold: true }]);
  assert.deepEqual([t[0].rows[0].id, t[0].rows[0].color, t[0].rows[0].values.Points], ['ihc', '#03A9F4', '21']);
  assert.deepEqual(t[1].columns.map((c) => c.title), ['Prom', '2024']);
});

test('normalizeTeam separa cuerpo técnico del plantel y toma el próximo partido', () => {
  const person = (name, position, role, extra = {}) => ({ entity: { object: { name, num: extra.num ?? '', position, formation_position: role, age: '30', country_id: 'ba', ...extra } } });
  const t = normalizeTeam({
    squad: { groups: [
      { name: 'Dirección', rows: [person('Guillermo Barros Schelotto', 'Dirección', 'Entrenador'), person('Gustavo Barros Schelotto', 'Dirección', 'Asistente tecnico')] },
      { name: 'Arqueros', rows: [person('Tomás Marchiori', 'Arqueros', 'Arquero', { num: '1' })] },
    ] },
    games: { next: { rows: [{ game: { id: 'egddcfb' } }] } },
  });
  assert.equal(t.coach, 'Guillermo Barros Schelotto');
  assert.deepEqual(t.squad.map((p) => [p.name, p.jersey, p.group]), [['Tomás Marchiori', '1', 'Arqueros']]);
  assert.equal(t.nextGameId, 'egddcfb');
});

test('normalizeGame toma las bajas del lado de Vélez aunque sea visitante', () => {
  const miss = (name, status, reason = 'Lesionado') => ({ name, jersey_num: 1, missing_details: { reason, will_play_status: status, will_play: status === 2 ? 'No jugarán' : 'Duda' } });
  const g = normalizeGame({
    game: {
      id: 'g1', start_time: '17-10-2026 20:00', stage_round_name: 'Clausura, Fecha 13',
      teams: [team('bbjbf', 'Gimnasia de Mendoza'), team('ihc', 'Vélez Sarsfield')],
      players: { missing_players: [[miss('Rival lesionado', 2)], [miss('Manuel Lanzini', 2), miss('Otro', 1, 'Suspendido')]] },
      game_info: [{ name: 'Árbitro', value: 'Darío Herrera' }],
    },
  });
  assert.equal(g.date, '2026-10-17');
  assert.equal(g.opponent, 'Gimnasia de Mendoza');
  assert.equal(g.info['Árbitro'], 'Darío Herrera');
  assert.deepEqual(g.missing.map((m) => [m.name, m.out, m.reason]), [['Manuel Lanzini', true, 'Lesionado'], ['Otro', false, 'Suspendido']]);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { linkTeams, nameVariants, normName, relinkMatch } from '../src/lib/crests.js';

test('nameVariants: sin tildes, con las siglas completas y sin perder lo que va entre paréntesis', () => {
  assert.equal(normName('Huracán (Ing. White)'), 'huracan (ing white)');
  assert.deepEqual(nameVariants('Ferro Carril Oeste'), ['ferro carril oeste']);
  assert.ok(nameVariants('Talleres (RdE)').includes('talleres de remedios de escalada'));
  assert.ok(nameVariants('Racing (Córdoba)').includes('racing de cordoba'));
  assert.ok(!nameVariants('San Lorenzo (MdP)').includes('san lorenzo'));
});

test('linkTeams: une por nombre, no adivina con nombres repetidos y lista los que faltan', () => {
  const espn = [
    { id: '5', names: ['Ferro Carril Oeste', 'Ferro'] }, { id: '9', names: ['Racing de Córdoba'] },
    { id: '18', names: ['San Lorenzo'] }, { id: '30', names: ['Atlanta'] }, { id: '31', names: ['Atlanta'] },
  ];
  const historic = [{ id: 'k40', name: 'Ferro Carril Oeste' }, { id: 'k72', name: 'Racing (Córdoba)' }, { id: 'k78', name: 'San Lorenzo (MdP)' }, { id: 'k13', name: 'Atlanta' }];
  assert.deepEqual(linkTeams(historic, espn), { ids: { k40: '5', k72: '9' }, missing: ['San Lorenzo (MdP)', 'Atlanta'] });
});

test('relinkMatch: cambia solo los ids unidos', () => {
  const m = { id: 'h1', home: { id: '21', name: 'Vélez' }, away: { id: 'k40', name: 'Ferro Carril Oeste' } };
  assert.deepEqual(relinkMatch(m, { k40: '5' }).away, { id: '5', name: 'Ferro Carril Oeste' });
  assert.equal(relinkMatch(m, undefined), m);
});

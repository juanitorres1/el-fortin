import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { nearestAngle, rotatePoint, sectorCapacity, sideInFront, totalCapacity, viewFrom } from '../src/lib/stadium.js';

test('viewFrom y sideInFront: el lado elegido queda adelante', () => {
  assert.equal(viewFrom('sur'), 0);
  assert.equal(viewFrom('norte'), 180);
  for (const lado of ['norte', 'sur', 'este', 'oeste']) assert.equal(sideInFront(viewFrom(lado)), lado);
  assert.equal(sideInFront(-90 + 10), sideInFront(270)); // ángulos negativos y redondeo al lado más cercano
});

test('viewFrom: después de girar, la tribuna elegida queda abajo en la pantalla (cerca de quien mira)', () => {
  const pos = { norte: [0, -1], sur: [0, 1], este: [1, 0], oeste: [-1, 0] };
  for (const [lado, p] of Object.entries(pos)) assert.deepEqual(rotatePoint(p, viewFrom(lado)), [0, 1], lado);
});

test('nearestAngle: gira por el camino corto', () => {
  assert.equal(nearestAngle(350, 0), 360);
  assert.equal(nearestAngle(10, 270), -90);
  assert.equal(nearestAngle(0, 180), -180);
});

test('club.json: los sectores del estadio suman la capacidad publicada', () => {
  const club = JSON.parse(readFileSync(new URL('../public/data/club.json', import.meta.url), 'utf8'));
  const t = club.estadio.tribunas;
  assert.deepEqual(t.sectores.map((s) => s.lado).sort(), ['este', 'norte', 'oeste', 'sur']);
  assert.equal(sectorCapacity(t.sectores[0]), 8751);
  const declared = Number(club.estadio.datos.find((d) => /Capacidad/.test(d.etiqueta)).valor.replace('.', ''));
  assert.equal(totalCapacity(t.sectores), declared);
});

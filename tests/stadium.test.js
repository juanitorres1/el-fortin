import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LAYOUT, OUT, cameraFor, depthOf, sectorCapacity, sideNearest, stepProfile, totalCapacity } from '../src/lib/stadium.js';

test('stepProfile: arranca en el pie del frente, sube en escalones y cierra contra el piso', () => {
  const p = stepProfile(6, 1, 4, 2);
  assert.deepEqual(p[0], [0, 0]);
  assert.deepEqual(p[1], [0, 1]);
  assert.deepEqual(p.at(-1), [6, 0]);
  assert.deepEqual(p.at(-2), [6, 4]);
  const heights = p.slice(1, -1).map(([, v]) => v);
  assert.ok(heights.every((v, i) => i === 0 || v >= heights[i - 1]), 'la altura nunca baja');
  assert.equal(p.length, 2 + 3 * 2 + 1); // 3 escalones de 2 m
});

test('LAYOUT: cada nivel de club.json tiene su bandeja en el 3D', () => {
  const club = JSON.parse(readFileSync(new URL('../public/data/club.json', import.meta.url), 'utf8'));
  for (const s of club.estadio.tribunas.sectores) {
    const levels = LAYOUT[s.lado].filter((p) => p.level != null).map((p) => p.level);
    assert.deepEqual(levels, s.niveles.map((_, i) => i), s.id);
  }
});

test('cameraFor: la cámara general y la de tribuna quedan del lado elegido; desde arriba, encima del centro', () => {
  for (const lado of Object.keys(OUT)) {
    const g = cameraFor(lado);
    const t = cameraFor(lado, 'tribuna');
    assert.equal(sideNearest(g.pos), lado, `general ${lado}`);
    assert.equal(sideNearest(t.pos), lado, `tribuna ${lado}`);
    const dist = Math.hypot(t.pos[0], t.pos[2]);
    assert.ok(dist > 34 && dist < 40 + depthOf(lado) + 60, `la de tribuna está en la tribuna (${dist})`);
  }
  assert.deepEqual(cameraFor('norte', 'arriba').target, [0, 0, 0]);
  assert.ok(cameraFor('norte', 'arriba').pos[1] > 200);
});

test('club.json: los sectores del estadio suman la capacidad publicada', () => {
  const club = JSON.parse(readFileSync(new URL('../public/data/club.json', import.meta.url), 'utf8'));
  const t = club.estadio.tribunas;
  assert.deepEqual(t.sectores.map((s) => s.lado).sort(), ['este', 'norte', 'oeste', 'sur']);
  assert.equal(sectorCapacity(t.sectores[0]), 8751);
  const declared = Number(club.estadio.datos.find((d) => /Capacidad/.test(d.etiqueta)).valor.replace('.', ''));
  assert.equal(totalCapacity(t.sectores), declared);
});

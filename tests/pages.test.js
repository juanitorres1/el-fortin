// Las 5 páginas comparten encabezado, menú y pie escritos en cada HTML (sin paso de build). Este test evita que se
// desincronicen y que queden links rotos entre páginas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const PAGES = { 'index.html': 'Inicio', 'partidos.html': 'Partidos', 'plantel.html': 'Plantel', 'historial.html': 'Historial', 'club.html': 'Club' };
const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const exists = (f) => existsSync(new URL(`../${f}`, import.meta.url));
const block = (html, re) => html.match(re)?.[0] ?? '';
const navOf = (html) => block(html, /<nav class="tabbar"[\s\S]*?<\/nav>/);
const footerOf = (html) => block(html, /<footer[\s\S]*?<\/footer>/);
// El <head> sin título ni descripción, que cambian por página, ni el módulo propio de cada una.
const headOf = (html) =>
  block(html, /<head>[\s\S]*?<\/head>/)
    .replace(/<title>.*<\/title>/, '')
    .replace(/<meta name="description"[^>]*>/, '')
    .replace(/js\/pages\/[a-z]+\.js/, '');

test('las 5 páginas existen y cargan su módulo', () => {
  for (const file of Object.keys(PAGES)) {
    const key = file === 'index.html' ? 'inicio' : file.replace('.html', '');
    assert.ok(read(file).includes(`src="js/pages/${key}.js"`), `${file} no carga js/pages/${key}.js`);
    assert.ok(exists(`js/pages/${key}.js`), `falta js/pages/${key}.js`);
  }
});

test('menú (sin la marca de página actual), head y pie son idénticos en todas las páginas', () => {
  const ref = read('index.html');
  for (const file of Object.keys(PAGES)) {
    const html = read(file);
    assert.equal(navOf(html).replace(' aria-current="page"', ''), navOf(ref).replace(' aria-current="page"', ''), `el menú de ${file} difiere`);
    assert.equal(footerOf(html), footerOf(ref), `el pie de ${file} difiere`);
    assert.equal(headOf(html), headOf(ref), `el <head> de ${file} difiere`);
  }
});

test('cada página marca una sola sección en el menú: la suya', () => {
  for (const [file, label] of Object.entries(PAGES)) {
    const current = [...navOf(read(file)).matchAll(/aria-current="page"[^>]*>[\s\S]*?<span>([^<]+)<\/span>/g)].map((m) => m[1]);
    assert.deepEqual(current, [label], `${file} debería marcar solo «${label}»`);
  }
});

test('los links internos y sus #anclas existen', () => {
  for (const file of Object.keys(PAGES)) {
    for (const [, href, id] of read(file).matchAll(/href="([a-z-]+\.html)?(?:#([\w-]+))?"/g)) {
      if (href) assert.ok(exists(href), `${file} linkea a ${href}, que no existe`);
      if (id && id !== 'contenido') assert.ok(read(href ?? file).includes(`id="${id}"`), `${file} linkea a ${href ?? file}#${id}, que no existe`);
    }
  }
});

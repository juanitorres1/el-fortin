// Las páginas salen de src/site.js: este test revisa que cada una tenga su HTML y su módulo, que el <head> para
// compartir sea el correcto y que los links internos (con #ancla) apunten a algo que existe.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { PAGES, SITE, headTags } from '../src/site.js';

const root = new URL('../', import.meta.url);
const read = (f) => readFileSync(new URL(f, root), 'utf8');
const exists = (f) => existsSync(new URL(f, root));
const srcFiles = (dir = 'src/') =>
  readdirSync(new URL(dir, root), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? srcFiles(`${dir}${e.name}/`) : /\.jsx?$/.test(e.name) ? [`${dir}${e.name}`] : []));

test('cada página de src/site.js tiene su HTML, que carga su módulo y marca dónde va el <head>', () => {
  assert.equal(new Set(PAGES.map((p) => p.file)).size, PAGES.length, 'archivos repetidos');
  for (const p of PAGES) {
    const html = read(p.file);
    assert.ok(html.includes('<!--head-->'), `${p.file} no tiene <!--head-->`);
    assert.ok(html.includes(`src="/src/pages/${p.key}.jsx"`), `${p.file} no carga src/pages/${p.key}.jsx`);
    assert.ok(exists(`src/pages/${p.key}.jsx`), `falta src/pages/${p.key}.jsx`);
    assert.ok(read(`src/pages/${p.key}.jsx`).includes(`page="${p.key}"`), `src/pages/${p.key}.jsx no marca su sección en el menú`);
  }
});

test('el <head> de cada página tiene la vista previa para compartir con su título, descripción y URL', () => {
  assert.ok(exists(`public/${SITE.ogImage}`), `falta public/${SITE.ogImage}`);
  for (const p of PAGES) {
    const head = headTags(p);
    const url = SITE.url + (p.file === 'index.html' ? '' : p.file);
    assert.ok(head.includes(`<title>${p.title}</title>`));
    assert.ok(head.includes(`<meta property="og:title" content="${p.title}">`));
    assert.ok(head.includes(`<meta property="og:description" content="${p.description}">`));
    assert.ok(head.includes(`<meta property="og:url" content="${url}">`), `${p.file}: og:url`);
    assert.ok(head.includes(`<link rel="canonical" href="${url}">`), `${p.file}: canonical`);
    assert.ok(head.includes(`content="${SITE.url}${SITE.ogImage}"`), `${p.file}: og:image`);
  }
});

test('los links internos con #ancla apuntan a una página y a un id que existen', () => {
  const all = srcFiles().map((f) => read(f)).join('\n');
  const links = new Set([...all.matchAll(/(?:href=|['"`])([a-z]+\.html)(?:\?[^#'"`]*)?#([\w-]+)/g)].map((m) => `${m[1]}#${m[2]}`));
  assert.ok(links.size >= 5, 'no encontré links internos para revisar');
  for (const link of links) {
    const [file, id] = link.split('#');
    assert.ok(PAGES.some((p) => p.file === file), `${link}: ${file} no es una página`);
    assert.ok(new RegExp(`id="${id}"|\\['${id}',|id=\\{?['"\`]${id}`).test(all), `${link}: no hay ningún elemento con id «${id}»`);
  }
});

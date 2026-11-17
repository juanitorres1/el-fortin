// Lo que ven los buscadores: sitemap.xml y robots.txt (los escribe scripts/prerender.mjs) y la página 404 estática.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { precacheLists, robotsTxt, sitemapUrls, sitemapXml } from '../scripts/prerender.mjs';
import { PAGES, SITE } from '../src/site.js';

test('sitemapUrls: las páginas sin query y una ficha por jugador; jugador.html solo no va', () => {
  const urls = sitemapUrls(PAGES, { players: [{ id: '216697' }, { id: 'a&b' }, { name: 'sin id' }] });
  assert.equal(urls[0], SITE.url);
  assert.ok(urls.includes(`${SITE.url}partidos.html`));
  assert.ok(urls.includes(`${SITE.url}vivo.html`));
  assert.ok(!urls.includes(`${SITE.url}jugador.html`));
  assert.ok(urls.includes(`${SITE.url}jugador.html?id=216697`));
  assert.ok(urls.includes(`${SITE.url}jugador.html?id=a%26b`));
  assert.equal(urls.length, PAGES.filter((p) => !p.query).length + 2);
  assert.ok(urls.every((u) => u.startsWith(SITE.url)));
  assert.deepEqual(sitemapUrls(PAGES, undefined), PAGES.filter((p) => !p.query).map((p) => p.url)); // sin plantel
});

test('sitemapXml: XML válido con «&» escapado', () => {
  const out = sitemapXml([SITE.url, `${SITE.url}x.html?a=1&b=2`]);
  assert.match(out, /^<\?xml version="1.0" encoding="UTF-8"\?>\n<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  assert.ok(out.includes(`<loc>${SITE.url}x.html?a=1&amp;b=2</loc>`));
  assert.equal(out.match(/<url>/g).length, 2);
});

test('robotsTxt apunta al sitemap', () => {
  assert.match(robotsTxt(SITE.url), new RegExp(`^Sitemap: ${SITE.url}sitemap\\.xml$`, 'm'));
});

test('404.html: rutas desde la raíz del sitio, links a las secciones del menú y fuera de la precarga', () => {
  const html = readFileSync(new URL('../public/404.html', import.meta.url), 'utf8');
  assert.ok(html.includes(`<base href="${new URL(SITE.url).pathname}">`), 'el <base> tiene que ser la ruta del sitio');
  assert.ok(html.includes('<meta name="robots" content="noindex">'));
  for (const p of PAGES.filter((x) => x.nav)) assert.ok(html.includes(`href="${p.href}"`), `falta el link a ${p.href}`);
  const { precache, onDemand } = precacheLists(PAGES, ['assets/x.js']);
  assert.ok(![...precache, ...onDemand].some((f) => f.includes('404')));
});

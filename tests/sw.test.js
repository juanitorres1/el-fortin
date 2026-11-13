// El service worker (public/sw.js) corrido en un contexto aparte, con el caché, la red y el reloj simulados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { injectPrecache } from '../scripts/prerender.mjs';

const SOURCE = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
const SITE = 'https://hinchas.test/el-fortin/';
const abs = (path) => new URL(path, SITE).href;
// Como lo deja el build: con el JS/CSS de este deploy en la lista y el 3D del estadio a pedido.
const PRECACHE = ['./', 'partidos.html', 'jugador.html', 'vivo.html', 'manifest.webmanifest', 'assets/ui-NEW.js', 'assets/ui-NEW.css', 'assets/icons/icon-192.png'];
const BUILT = injectPrecache(SOURCE, { precache: PRECACHE, onDemand: ['assets/estadio-scene-NEW.js'] });

const flush = () => new Promise((resolve) => setImmediate(resolve)); // deja correr todo lo que ya estaba resuelto
const ok = (body, status = 200) => new Response(body, { status });
const offline = () => Promise.reject(new TypeError('Failed to fetch'));
/** Una respuesta de la red que llega cuando el test quiere. */
function hanging() {
  let arrive;
  const promise = new Promise((resolve) => (arrive = resolve));
  return { route: () => promise, arrive };
}

class FakeCache {
  entries = new Map(); // URL absoluta → Response, en el orden en que entraron
  url = (key) => (typeof key === 'string' ? abs(key) : key.url);
  async match(key) {
    return this.entries.get(this.url(key))?.clone();
  }
  async put(key, res) {
    this.entries.delete(this.url(key));
    this.entries.set(this.url(key), res);
  }
  async delete(key) {
    return this.entries.delete(this.url(key));
  }
  async keys() {
    return [...this.entries.keys()].map((url) => ({ url }));
  }
  text = async (path) => (await this.match(path))?.text();
  paths = () => [...this.entries.keys()].map((url) => url.replace(SITE, ''));
}

/** Arranca el service worker. `routes`: URL absoluta → función que devuelve la respuesta de la red (si falta: sin conexión). */
function boot({ source = SOURCE, routes = {} } = {}) {
  const listeners = {};
  const stores = new Map();
  const timers = [];
  const fetched = [];
  const store = (name) => stores.get(name) ?? stores.set(name, new FakeCache()).get(name);
  const context = vm.createContext({
    self: { location: new URL('sw.js', SITE), addEventListener: (type, fn) => (listeners[type] = fn), skipWaiting: () => {}, clients: { claim: async () => {} } },
    caches: { open: async (name) => store(name), keys: async () => [...stores.keys()], delete: async (name) => stores.delete(name) },
    fetch: (input, init) => {
      const url = typeof input === 'string' ? abs(input) : input.url;
      fetched.push({ url, init });
      return Promise.resolve().then(() => (routes[url] ?? offline)(url));
    },
    setTimeout: (fn, ms) => timers.push({ fn, ms }),
    Response,
    URL,
  });
  vm.runInContext(source, context);

  /** Manda un evento; `done()` espera todo lo que el service worker dejó en waitUntil. */
  function dispatch(type, props = {}) {
    const waiting = [];
    const event = { ...props, waitUntil: (p) => waiting.push(p), respondWith: (p) => (event.response = Promise.resolve(p)) };
    listeners[type](event);
    event.done = async () => {
      for (let i = 0; i < waiting.length; i++) await waiting[i]; // waitUntil puede sumar más mientras tanto
    };
    return event;
  }
  const get = (path, mode = 'cors') => dispatch('fetch', { request: { url: new URL(path, SITE).href, method: 'GET', mode } });
  return {
    routes,
    fetched,
    timers,
    stores,
    cache: store('fortin-v3'),
    dispatch,
    get,
    visit: (path) => get(path, 'navigate'),
    /** Pasa el tiempo: corre los límites que estaban esperando. */
    async timeout() {
      for (const t of timers.splice(0)) t.fn();
      await flush();
    },
  };
}

/** ¿La respuesta ya está? (sin esperarla) */
async function settled(promise) {
  let state = false;
  promise.then(
    () => (state = true),
    () => (state = true),
  );
  await flush();
  return state;
}

test('red rápida: responde la red y queda guardada', async () => {
  const sw = boot({ routes: { [abs('partidos.html')]: () => ok('partidos de la red'), [abs('data/generated/facts.json')]: () => ok('{"n":1}') } });
  const page = sw.visit('partidos.html');
  assert.equal(await (await page.response).text(), 'partidos de la red');
  await page.done();
  assert.equal(await sw.cache.text('partidos.html'), 'partidos de la red');
  assert.equal(sw.fetched[0].init.cache, 'no-cache'); // sin la copia de 10 minutos del navegador

  const data = sw.get('data/generated/facts.json');
  assert.equal(await (await data.response).text(), '{"n":1}');
  await data.done();
  assert.equal(await sw.cache.text('data/generated/facts.json'), '{"n":1}');
  assert.equal(sw.timers[0].ms, 3000);
});

test('red colgada con copia: a los 3 s responde la copia y la red la actualiza de fondo', async () => {
  const net = hanging();
  const sw = boot({ routes: { [abs('vivo.html')]: net.route } });
  await sw.cache.put('vivo.html', ok('copia guardada'));
  const page = sw.visit('vivo.html');
  assert.equal(await settled(page.response), false, 'antes del límite espera a la red');
  await sw.timeout();
  assert.equal(await (await page.response).text(), 'copia guardada');

  net.arrive(ok('versión nueva'));
  await page.done(); // el service worker sigue vivo hasta que llega la red y se guarda
  assert.equal(await sw.cache.text('vivo.html'), 'versión nueva');
});

test('red colgada sin copia: se espera a la red (una página no cae en el Inicio por lenta)', async () => {
  const net = hanging();
  const sw = boot({ routes: { [abs('club.html')]: net.route } });
  await sw.cache.put('./', ok('inicio guardado'));
  const page = sw.visit('club.html');
  await sw.timeout();
  assert.equal(await settled(page.response), false);
  net.arrive(ok('club de la red'));
  assert.equal(await (await page.response).text(), 'club de la red');
});

test('la red llega antes del límite: el límite después no cambia nada', async () => {
  const sw = boot({ routes: { [abs('vivo.html')]: () => ok('de la red') } });
  await sw.cache.put('vivo.html', ok('copia vieja'));
  const page = sw.visit('vivo.html');
  assert.equal(await (await page.response).text(), 'de la red');
  await sw.timeout();
  await page.done();
  assert.equal(await sw.cache.text('vivo.html'), 'de la red');
});

test('sin conexión: la copia; una página sin copia cae en el Inicio; un dato sin copia falla', async () => {
  const sw = boot();
  await sw.cache.put('./', ok('inicio guardado'));
  await sw.cache.put('plantel.html', ok('plantel guardado'));
  await sw.cache.put('data/club.json', ok('{"club":1}'));
  assert.equal(await (await sw.visit('plantel.html').response).text(), 'plantel guardado');
  assert.equal(await (await sw.get('data/club.json').response).text(), '{"club":1}');
  assert.equal(await (await sw.visit('historial.html').response).text(), 'inicio guardado');
  assert.equal((await sw.get('data/generated/news.json').response).type, 'error');
  assert.equal((await boot().visit('club.html').response).type, 'error'); // sin nada guardado, ni el Inicio
});

test('las páginas se guardan sin query: jugador.html?id=1 y ?id=2 son una sola copia', async () => {
  const sw = boot({ routes: { [abs('jugador.html?id=1')]: () => ok('jugador'), [abs('historial.html?rival=River')]: () => ok('historial') } });
  const first = sw.visit('jugador.html?id=1');
  await first.response;
  await first.done();
  const rival = sw.visit('historial.html?rival=River');
  await rival.response;
  await rival.done();
  assert.deepEqual(sw.cache.paths(), ['jugador.html', 'historial.html']);
  // Otro jugador, ya sin conexión: sirve la misma copia (el jugador lo elige la página con ?id=).
  assert.equal(await (await sw.visit('jugador.html?id=2').response).text(), 'jugador');
});

test('el Inicio es una sola entrada: la raíz, ?app=1 (la app instalada), index.html y «./»', async () => {
  const sw = boot({ routes: { [abs('?app=1')]: () => ok('inicio') } });
  const app = sw.visit('?app=1');
  await app.response;
  await app.done();
  assert.deepEqual(sw.cache.paths(), ['']); // la raíz del sitio = «./»
  assert.equal(await sw.cache.text('./'), 'inicio');
  for (const path of ['', 'index.html', '?app=1', 'index.html?x=1']) assert.equal(await (await sw.visit(path).response).text(), 'inicio', path);
});

test('una respuesta con error no pisa la copia: el 404 se devuelve, con un 5xx se usa la copia', async () => {
  const sw = boot({ routes: { [abs('club.html')]: () => ok('no existe', 404), [abs('partidos.html')]: () => ok('GitHub caído', 503), [abs('juegos.html')]: () => ok('GitHub caído', 503) } });
  await sw.cache.put('club.html', ok('club guardado'));
  await sw.cache.put('partidos.html', ok('partidos guardado'));
  const missing = sw.visit('club.html');
  assert.equal((await missing.response).status, 404);
  await missing.done();
  assert.equal(await sw.cache.text('club.html'), 'club guardado');
  const down = sw.visit('partidos.html');
  assert.equal(await (await down.response).text(), 'partidos guardado');
  await down.done();
  assert.equal(await sw.cache.text('partidos.html'), 'partidos guardado');
  assert.equal((await sw.visit('juegos.html').response).status, 503); // sin copia: lo que haya dicho el servidor
});

test('ESPN y los demás sitios no se interceptan; las tipografías de Google sí; solo GET', async () => {
  const sw = boot({ routes: { 'https://fonts.gstatic.com/s/barlow.woff2': () => ok('woff2') } });
  const request = (url, method = 'GET') => sw.dispatch('fetch', { request: { url, method, mode: 'cors' } });
  assert.equal(request('https://site.api.espn.com/apis/site/v2/sports/soccer/arg.1/scoreboard').response, undefined);
  assert.equal(request('https://api.open-meteo.com/v1/forecast').response, undefined);
  assert.equal(request(abs('data/club.json'), 'POST').response, undefined);
  assert.deepEqual(sw.fetched, []);
  const font = request('https://fonts.gstatic.com/s/barlow.woff2');
  assert.equal(await (await font.response).text(), 'woff2');
  await font.done();
  assert.equal(await sw.cache.text('https://fonts.gstatic.com/s/barlow.woff2'), 'woff2');
});

test('JS, CSS e íconos: lo guardado, sin volver a la red', async () => {
  const sw = boot({ routes: { [abs('assets/estadio-scene-NEW.js')]: () => ok('three') } });
  const first = sw.get('assets/estadio-scene-NEW.js');
  assert.equal(await (await first.response).text(), 'three');
  await first.done();
  delete sw.routes[abs('assets/estadio-scene-NEW.js')]; // se cortó la conexión
  assert.equal(await (await sw.get('assets/estadio-scene-NEW.js').response).text(), 'three');
  assert.equal(sw.fetched.length, 1);
  assert.deepEqual(sw.timers, []); // sin límite de tiempo: no pasa por la red
});

/** La red con todo lo de la lista de precarga. */
const deployed = () => Object.fromEntries(PRECACHE.map((path) => [abs(path), () => ok(`nuevo ${path}`)]));

test('install guarda la lista del build; lo de assets/ que ya estaba no se vuelve a bajar y las páginas sí', async () => {
  const sw = boot({ source: BUILT, routes: deployed() });
  await sw.cache.put('assets/icons/icon-192.png', ok('ícono de antes'));
  await sw.cache.put('vivo.html', ok('viejo vivo.html'));
  await sw.dispatch('install').done();
  assert.deepEqual(sw.cache.paths().sort(), PRECACHE.map((p) => (p === './' ? '' : p)).sort());
  assert.equal(await sw.cache.text('vivo.html'), 'nuevo vivo.html');
  assert.equal(await sw.cache.text('assets/icons/icon-192.png'), 'ícono de antes');
  assert.ok(!sw.fetched.some((f) => f.url.endsWith('icon-192.png')));
  assert.ok(!sw.fetched.some((f) => f.url.includes('estadio-scene')), 'el 3D del estadio no se precarga');
});

test('activate borra los cachés de versiones anteriores y el JS/CSS viejo; deja lo vigente, el estadio y los datos', async () => {
  const sw = boot({ source: BUILT, routes: deployed() });
  sw.stores.set('fortin-v2', new FakeCache());
  sw.stores.set('otro-sitio', new FakeCache());
  const before = ['assets/ui-OLD.js', 'assets/ui-OLD.css', 'assets/estadio-scene-OLD.js', 'assets/estadio-scene-NEW.js', 'assets/ui-NEW.js', 'data/generated/snapshot.json', 'club.html', 'https://fonts.gstatic.com/s/assets/barlow.woff2'];
  for (const path of before) await sw.cache.put(path, ok(`guardado ${path}`));
  await sw.dispatch('install').done();
  await sw.dispatch('activate').done();
  assert.deepEqual([...sw.stores.keys()].sort(), ['fortin-v3', 'otro-sitio']);
  const left = sw.cache.paths();
  for (const gone of ['assets/ui-OLD.js', 'assets/ui-OLD.css', 'assets/estadio-scene-OLD.js']) assert.ok(!left.includes(gone), `${gone} se tenía que borrar`);
  for (const kept of ['assets/estadio-scene-NEW.js', 'assets/ui-NEW.js', 'assets/ui-NEW.css', 'data/generated/snapshot.json', 'club.html', 'https://fonts.gstatic.com/s/assets/barlow.woff2']) assert.ok(left.includes(kept), `${kept} se tenía que quedar`);
  assert.equal(sw.fetched.filter((f) => f.url === abs('partidos.html')).length, 1, 'activate no vuelve a bajar lo que bajó install');
});

test('activate no borra el JS viejo si la precarga quedó incompleta (la página vieja todavía lo usa)', async () => {
  const routes = deployed();
  delete routes[abs('partidos.html')]; // no llegó
  const sw = boot({ source: BUILT, routes });
  await sw.cache.put('partidos.html', ok('partidos viejo'));
  await sw.cache.put('assets/ui-OLD.js', ok('js viejo'));
  await sw.dispatch('install').done(); // no falla: se guarda lo que llegó
  await sw.dispatch('activate').done();
  assert.equal(await sw.cache.text('partidos.html'), 'partidos viejo');
  assert.equal(await sw.cache.text('assets/ui-OLD.js'), 'js viejo');
  assert.equal(await sw.cache.text('assets/ui-NEW.js'), 'nuevo assets/ui-NEW.js');
});

test('sw.js sin procesar (sin la lista del build): se instala con la lista mínima y no borra nada de assets/', async () => {
  const sw = boot({ routes: { [abs('./')]: () => ok('inicio'), [abs('vivo.html')]: () => ok('vivo') } });
  await sw.cache.put('assets/ui-ABC.js', ok('js'));
  await sw.dispatch('install').done();
  await sw.dispatch('activate').done();
  assert.equal(await sw.cache.text('./'), 'inicio');
  assert.equal(await sw.cache.text('vivo.html'), 'vivo');
  assert.equal(await sw.cache.text('assets/ui-ABC.js'), 'js');
});

test('miniaturas de noticias: se sirven de lo guardado y quedan las últimas 40', async () => {
  const thumb = (n) => `data/generated/img/news/nota-${n}-t.jpg`;
  const sw = boot({ routes: { [abs(thumb(41))]: () => ok('foto 41'), [abs(thumb(42))]: () => ok('foto 42') } });
  await sw.cache.put('data/generated/news.json', ok('{}'));
  for (let n = 1; n <= 40; n++) await sw.cache.put(thumb(n), ok(`foto ${n}`));
  for (const n of [41, 42]) {
    const img = sw.get(thumb(n));
    assert.equal(await (await img.response).text(), `foto ${n}`);
    await img.done();
  }
  const left = sw.cache.paths().filter((p) => p.includes('img/news/'));
  assert.equal(left.length, 40);
  assert.deepEqual([left[0], left.at(-1)], [thumb(3), thumb(42)]);
  assert.equal(await sw.cache.text('data/generated/news.json'), '{}');
  assert.equal(await (await sw.get(thumb(42)).response).text(), 'foto 42');
  assert.equal(sw.fetched.length, 2); // la segunda vez no fue a la red
});

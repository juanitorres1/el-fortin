# El Fortín · Vélez Sarsfield

Sitio de hinchas (no oficial) de Vélez: https://juanitorres1.github.io/el-fortin/

**React 19 + Vite 6**, multipágina, publicado en GitHub Pages. Los datos salen de ESPN (en vivo desde el navegador) y
de archivos que genera el deploy cada hora. No hay servidor propio ni API keys. Cada página se **prerenderiza** en el
deploy: el HTML ya trae el contenido y React lo actualiza en vivo.

## Uso

Node 20 o más.

```bash
npm install
npm run data    # baja los datos a public/data/generated/ (~70 pedidos a ESPN y ~20 a velez.com.ar)
npm run dev     # http://localhost:5173
npm test        # tests de la lógica (node:test)
npm run build   # arma dist/ y prerenderiza las páginas con los datos de public/data/generated/ (como el deploy)
npm run preview # sirve dist/ en http://localhost:5173
npm run check   # revisa los datos generados (lo corre el deploy)
```

## Estructura

```
index.html, partidos.html, plantel.html, historial.html, club.html   entradas de Vite (el <head> lo arma vite.config.js)
src/
  site.js        las 5 páginas: título, descripción, ícono del menú; arma el <head> con la vista previa para compartir
  main.jsx       monta una página (hidrata si viene prerenderizada)
  initial.js     datos con los que se prerenderizó la página (los lee del <script id="initial-data">)
  prerender.jsx  entrada del build para Node: dibuja cada página a HTML
  pages/         una por página (inicio, partidos, plantel, historial, club)
  sections/      bloques grandes: Juega, Previa, Noticias, Tablas, Goleadores, Playoffs
  components/    Layout (menú, banda, pie), MatchRow/MatchList, Crest, ResultBadge, Segmented, Skeletons…
  hooks/         useLiveData, useJson, useCached, useNow, useLiveTitle, useScrollToHash, useCurrentSection
  lib/           lógica pura, sin React (la usan también los scripts): espn, facts, playoffs, weather, news, rules, core
  styles.css     sistema de diseño (tokens claro y noche)
public/
  assets/        escudo y imagen para compartir (og.png)
  data/          club.json (a mano), historico.json (1931–2000), generated/ (lo genera el deploy, no va al repo)
scripts/         update-data, news, ics, check-data, prerender, import-historico (Node)
tests/           lógica de src/lib y scripts, y consistencia de las páginas
```

**Sumar una página:** agregarla en `src/site.js`, copiar un HTML de la raíz cambiando el script y crear
`src/pages/<clave>.jsx` con `<Layout page="<clave>">`. El test de páginas avisa si falta algo.

## Cómo se dibuja (prerender)

`npm run build` hace tres cosas: `vite build` (el sitio), `vite build --ssr src/prerender.jsx` (las mismas páginas
para Node) y `scripts/prerender.mjs`, que escribe en cada `dist/<página>.html` el contenido ya dibujado con los datos
del deploy y esos datos en `<script id="initial-data">`. En el navegador, React **hidrata** ese HTML con los mismos
datos (no lo redibuja) y enseguida pide lo nuevo a ESPN.

- El HTML puede tener hasta 1 h (lo que tarda el próximo deploy): lo en vivo se corrige solo al abrir.
- Historial no lleva datos embebidos (sus partidos pesan 570 KB): su HTML trae la estructura y carga lo demás.
- Goleadores, camino a los playoffs, pronóstico y minuto a minuto se piden en el navegador, como antes.
- **Regla para los componentes:** nada que dependa de la hora o de la URL al dibujar. La hora sale de `useNow()`
  (en la hidratación usa la del deploy) y `location` se lee en un `useEffect`. Si no, el HTML y React no coinciden.

## Qué muestra y de dónde sale

| Sección | Fuente | Actualización |
| --- | --- | --- |
| Próximo partido, fixture, resultados, tablas, plantel | ESPN (API no oficial, sin key) | En cada visita; cada 1 min si Vélez juega |
| Minuto a minuto y alerta de gol en la pestaña | ESPN, detalle del partido | Cada 1 min mientras se juega |
| Goleadores del torneo (top 10) y camino a los playoffs | ESPN | Cada 15 min |
| Promedios | `promedios.json` (temporadas cerradas) + la fase en curso en vivo | Cada 1 h / en cada visita |
| Estadísticas del plantel y sanciones estimadas | `players.json`, sumando el detalle de cada partido | Cada 1 h |
| La previa: rachas, historial con el rival, un día como hoy | `facts.json` + resultados en vivo | Cada 1 h |
| Historial por rival | `historico.json` (1931–2000, dominio público) + `matches.json` (ESPN, desde 2001) | Cada 1 h |
| Noticias | velez.com.ar (no tiene RSS: se leen las secciones) | Cada 1 h |
| Resumen de la semana con IA | Qwen3-8B con llama.cpp en GitHub Actions | Lunes 9:00 |
| Calendario para suscribirse | `velez.ics` | Cada 1 h |
| Pronóstico a la hora del partido | Open-Meteo (sin key) | Si el partido es dentro de 7 días |
| Historia, estadio, cómo llegar, palmarés, ídolos, récords | `public/data/club.json` (a mano; récords de Wikipedia) | Cuando se edita |

Si ESPN no responde, la página usa el último `snapshot.json` y lo indica.

## Reglas y cálculos

- **Promedios:** puntos ÷ partidos de las últimas 3 temporadas, sin playoffs; los ascendidos dividen solo por lo que
  jugaron en Primera. Validado contra Promiedos en oct-2026 (30 de 30 equipos iguales); Promiedos no se usa en el sitio.
- **Descenso (2026):** el último de los promedios y el último de la anual (si coinciden, el anteúltimo de la anual).
- **Playoffs:** cuántos pasan sale de ESPN (16 equipos ÷ 2 zonas = 8). El cálculo es conservador: «Clasificado» y
  «Eliminado» son seguros, aunque a veces se confirman una fecha después que con un cálculo exacto.
- **Sanciones:** 5 amarillas en un torneo o roja en el último partido. Es una estimación; la oficial es del Tribunal.
- **Cancha neutral:** ESPN no la marca bien; se deduce por competencia (Copa Argentina, supercopas y finales).
- Lo que no sale de ESPN está en `src/lib/rules.js`, revisado para `RULES_YEAR`.

## Deploy y mantenimiento

- `deploy.yml`: en cada push a `main`, cada 1 h y a mano. Corre `npm ci`, tests, `npm run data`, el chequeo de datos,
  `npm run build` (con prerender) y publica `dist/`. Las miniaturas de noticias se cachean entre corridas (ImageMagick).
- `news-weekly.yml`: los lunes genera el resumen con IA y lanza el deploy.
- `keepalive.yml`: si pasan 45 días sin commits, sube uno mínimo para que GitHub no apague los workflows programados.
- **Chequeo de datos** (`scripts/check-data.mjs`): si algo queda vacío o viejo, abre el issue «Revisar datos del
  sitio» (llega por mail) y lo cierra solo cuando se arregla. También avisa cuando empieza una temporada nueva y hay
  que revisar `src/lib/rules.js` (mientras tanto no se marca quién desciende).
- **A mano:** títulos nuevos, ídolos y récords en `public/data/club.json`.
- GitHub Pages cachea 10 minutos: después de un deploy puede verse la versión anterior un rato.

## Límites conocidos

- No muestra lesionados ni DT: ESPN no los informa bien y las alternativas (Promiedos, API-Football) no sirven o no
  son públicas.
- No muestra el árbitro: ESPN lo publica recién cuando empieza el partido.
- El historial no tiene la era amateur (1919–1930) ni copas anteriores a 2001.
- La API de ESPN no es oficial: si cambia el formato, se arregla en `src/lib/espn.js` (el chequeo de datos avisa).

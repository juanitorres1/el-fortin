# El Fortín · contexto del proyecto

Sitio de hinchas (no oficial) de Vélez Sarsfield. Publicado en **https://juanitorres1.github.io/el-fortin/**
(repo `juanitorres1/el-fortin`, rama `main`, GitHub Pages con deploy por Actions). El detalle de fuentes de datos,
diseño y decisiones está en `README.md`: leerlo antes de cambiar algo grande.

## Stack y estructura

**React 19 + Vite 6, multipágina, con prerender en el deploy** (lo pidió el usuario en oct-2026; se descartó pasar a
un servidor en Render/Railway/Vercel). Node ≥ 20. Detalle en `README.md`.

- **5 páginas** con su propio HTML en la raíz (`index.html`, `partidos.html`, `plantel.html`, `historial.html`,
  `club.html`): las URLs y los links compartidos no cambian. Cada HTML solo tiene `<!--head-->` y el script de
  `src/pages/<clave>.jsx` (el Inicio es `inicio`).
- `src/site.js`: **fuente única** de las páginas (título, descripción, ícono, URL) y del `<head>` (vista previa para
  compartir); lo usan `vite.config.js`, el menú y los tests. Menú y pie ya no se copian: están en
  `src/components/Layout.jsx`.
- `src/lib/`: **lógica pura sin React**, compartida con los scripts de Node: `espn.js` (cliente ESPN), `facts.js`
  (rachas, rival, un día como hoy, cancha neutral), `playoffs.js`, `weather.js`, `news.js`, `rules.js` (reglamento,
  `RULES_YEAR`), `core.js` (formato, carga con respaldo, marcador en vivo). Testear acá, no en los componentes.
- `src/hooks/`: `useLiveData` (ESPN con refresco 5 min / 1 min en vivo), `useJson` (JSON compartido entre
  componentes), `useCached` (promesa con vencimiento), `useNow`, `useLiveTitle`, `useScrollToHash`,
  `useCurrentSection`. Convención: `undefined` = cargando, `null` = falló o no hay.
- `src/components/`: `Layout`/`PageBand`, `MatchRow`/`MatchList`, `Crest`, `ResultBadge`, `Segmented`,
  `Skeletons`, `Lines`, `Empty`, `ExtLink`. `src/sections/`: bloques grandes (Juega, Previa, Noticias, Tablas,
  Goleadores, Playoffs).
- Prerender: `npm run build` = `vite build` + `vite build --ssr src/prerender.jsx` + `scripts/prerender.mjs`, que mete
  en cada `dist/*.html` el contenido dibujado y los datos (`<script id="initial-data">`, leído por `src/initial.js`).
  `src/main.jsx` hidrata si la página viene prerenderizada. Qué datos lleva cada página: `PAGE_DATA` en el script.
- `src/styles.css`: sistema de diseño (tokens claro y noche). Se siguen usando las mismas clases CSS de antes.
- `public/`: `assets/` (escudo, `og.png`), `data/club.json` (a mano), `data/historico.json`, `data/generated/`
  (lo genera el deploy; no va al repo).
- `scripts/` (Node): `update-data.mjs` (genera `public/data/generated/`), `news.mjs` (titulares y resumen IA),
  `ics.mjs`, `check-data.mjs` (issue «Revisar datos del sitio»), `import-historico.mjs` (uso único, ya corrido).
- Workflows: `deploy.yml` (push a `main`, cada 1 h y manual: `npm ci`, tests, datos, chequeo, `vite build`, publica
  `dist/`), `news-weekly.yml` (lunes 9:00 AR: resumen con Qwen3-8B como artifact) y `keepalive.yml` (commit mínimo si
  hace 45 días que no hay commits).

Comandos (en Git Bash):
```bash
npm install
npm run data   # baja datos a public/data/generated/ (~70 pedidos a ESPN y ~20 a velez.com.ar)
npm run dev    # Vite en http://localhost:5173 (también está en .claude/launch.json como "fortin")
npm test       # tests de src/lib, scripts y consistencia de páginas
npm run build  # dist/ con prerender, como el deploy (necesita los datos de `npm run data`)
npm run preview # sirve dist/
```

## Fuentes de datos (resumen)

- **ESPN** (API no oficial, sin key, con CORS): fixture, resultados, tablas, plantel y estadísticas. Vélez = id `21`,
  liga `arg.1`. Si falla en el navegador se usa `public/data/generated/snapshot.json`.
- **velez.com.ar**: titulares de la semana. No tiene RSS: se leen las páginas de sección. Manda **ISO-8859-1** en la
  cabecera aunque el HTML diga UTF-8. Las fotos originales pesan más de 2 MB: el deploy genera miniaturas con
  ImageMagick (`public/data/generated/img/news/`, cacheadas entre corridas).
- **Resumen semanal con IA:** Qwen3-8B con llama.cpp en la CPU del runner (gratis, sin keys). Se descartan los puntos
  con números o fechas que no estén en su nota; aviso visible de que lo escribe una IA; se oculta a los 10 días.
- **Historial:** 1931–2000 del dataset de Kaggle (dominio público) y desde 2001 de ESPN.
- **Récords:** Wikipedia (CC BY-SA).
- **Promedios:** calculados con ESPN (últimas 3 temporadas, sin playoffs). Validados una vez contra Promiedos (oct-2026,
  coinciden los 30 equipos); Promiedos no se usa en el sitio.
- **Pronóstico:** Open-Meteo (sin key, CC BY 4.0), con la ciudad de la sede de ESPN.
- **Imagen para compartir:** `public/assets/og.png` (1200×630), hecha a mano con Pillow; si se cambia el diseño, regenerarla.

## Decisiones tomadas (no reabrir sin que lo pida el usuario)

- **Solo ESPN** para lo deportivo. **Promiedos** se probó y se sacó (API no pública, datos licenciados de Opta;
  quedó en el commit `24cfe32`). **API-Football gratis** no sirve (no da la temporada actual ni lesiones de Argentina).
  Por eso la página **no muestra lesionados ni DT**.
- **Dominio propio: descartado.** El sitio queda en `juanitorres1.github.io/el-fortin`.
- **Diseño:** azul del club (`#0061A8`), barra azul, bandas grises y azules, pie azul oscuro, modo noche automático
  (sin botón, como recomiendan las guías de Apple). **Identidad propia, no copiar la web oficial** (el usuario lo pidió
  explícitamente): nada de portada partida foto + columna, cortes diagonales, tarjetas azules alternadas, fechas en
  cajas azules con cursiva ni esquinas rectas. Firma propia: la V de la camiseta (banda «Juega Vélez» arriba de todo y
  muesca en V en las bandas de título). Barlow Condensed en títulos y números, Montserrat en el texto.
- **Accesibilidad como piso:** contraste ≥ 4,5:1 (medirlo con números, no a ojo), letra mínima 12 px, controles de
  44 px, tamaños en `rem`, «reducir movimiento» respetado.
- **React + Vite** (oct-2026, pedido del usuario; antes se había sugerido Astro). Multipágina, sin router ni librerías
  de estado: React y Vite son las únicas dependencias. React suma ~66 KB gzip compartidos entre páginas.
- Se sacó a Fabián Cubero de la sección Ídolos (sigue en Récords porque son datos).

## Cómo trabaja el usuario

- Responder en **español**, directo. Revisar el código antes de afirmar; medir antes de opinar.
- **Commits:** Conventional Commits, **un solo `-m`** con el cuerpo adentro y al final
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. En este repo se trabaja **directo sobre `main`** (Pages
  publica desde ahí). El commit y el push se hacen **solo cuando el usuario lo pide** en ese momento.
- Antes de dar algo por terminado: `npm test`, `npm run build` y verificar en el navegador (celular 375 px y escritorio,
  claro y noche).
- No poner keys en el repo. Hay un `.env` local con una key de API-Football **que ya no se usa** (está en `.gitignore`).

## Trampas conocidas

- **Windows tiene un `convert.exe` del sistema** (convierte discos FAT a NTFS): nunca llamarlo. El código solo usa
  `magick` en Windows; en Linux (GitHub) usa `magick` o `convert`. En esta máquina no hay ImageMagick: localmente las
  noticias usan la foto «md» de velez.com.ar como respaldo.
- **Editar archivos con heredocs de Python en Git Bash rompe los `\n` y las comillas.** Usar la herramienta de edición o
  escribir el script en un archivo aparte.
- En tablas, `img { max-width: 100% }` hace que el escudo no cuente para el ancho de la columna: los escudos de tabla
  llevan `max-width: none`.
- El salto a una `#sección` espera a que carguen las tipografías (`useScrollToHash`): Montserrat es más ancha que la
  de respaldo y empuja el contenido.
- `useCurrentSection` (submenú del club) usa `requestAnimationFrame`: en el panel integrado oculto no corre; para
  verificarlo, sacar una captura (fuerza un cuadro) o probar en un navegador normal.
- **Hidratación:** al dibujar, nada de `new Date()`/`Date.now()` ni `location`: la hora sale de `useNow()` (en la
  hidratación es la del deploy) y la URL se lee en `useEffect`. Si no, el HTML del deploy y React no coinciden
  (en producción React tira el error #418 y redibuja todo). Revisar la consola después de tocar componentes.
- `vite.config.js` usa `base: './'`: rutas relativas para que funcione bajo `/el-fortin/` y en localhost. Los fetch
  van a `data/...` relativo a la página.
- GitHub Pages cachea los archivos 10 minutos: después de un deploy puede verse la versión anterior un rato.
- El panel del navegador integrado a veces queda oculto y no saca capturas: medir el DOM (por ejemplo, cargando cada
  página en un iframe) en vez de depender de capturas.

## Ideas no hechas (solo si el usuario las pide)

- Trivia de Vélez: pendiente, la vamos a iterar de a poco con el usuario.
- Historial de la era amateur (1919–1930) y copas anteriores a 2001 (fuente posible: RSSSF, formato irregular).
- Página por jugador o por rival: con `src/site.js` + un HTML + `src/pages/<clave>.jsx` (ver README).

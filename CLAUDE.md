# El Fortín · contexto del proyecto

Sitio de hinchas (no oficial) de Vélez Sarsfield. Publicado en **https://juanitorres1.github.io/el-fortin/**
(repo `juanitorres1/el-fortin`, rama `main`, GitHub Pages con deploy por Actions). El detalle de fuentes de datos,
diseño y decisiones está en `README.md`: leerlo antes de cambiar algo grande.

## Stack y estructura

**React 19 + Vite 6, multipágina, con prerender en el deploy** (lo pidió el usuario en oct-2026; se descartó pasar a
un servidor en Render/Railway/Vercel). Node ≥ 20. Detalle en `README.md`.

- **8 páginas** con su propio HTML en la raíz: 6 en el menú (`index.html`, `partidos.html`, `plantel.html`,
  `historial.html`, `juegos.html`, `club.html`) y 2 fuera (`jugador.html?id=`, `vivo.html` = modo cancha; en
  `site.js` llevan `nav: false` y `parent`). Las URLs y los links compartidos no cambian. Cada HTML solo tiene `<!--head-->` y el script de
  `src/pages/<clave>.jsx` (el Inicio es `inicio`).
- `src/site.js`: **fuente única** de las páginas (título, descripción, ícono, URL) y del `<head>` (vista previa para
  compartir); lo usan `vite.config.js`, el menú y los tests. Menú y pie ya no se copian: están en
  `src/components/Layout.jsx`.
- `src/lib/`: **lógica pura sin React**, compartida con los scripts de Node: `espn.js` (cliente ESPN; `teamStats` y `matchFigure` para el resumen, `lineupFromSummary` para las formaciones, `goalEvents` para games.json, `fetchScorers`/`phaseGoals` = goleadores contados desde el scoreboard y `summaryAssists` = asistidores, porque la tabla de goleadores de ESPN llega tarde y no suma los goles con el club anterior), `facts.js`
  (rachas, rival, `teamForm` del rival, un día como hoy, cancha neutral, `seasonNumbers` = Vélez en cifras, `rivalRanking`), `playoffs.js`, `weather.js`, `news.js`, `rules.js` (reglamento,
  `RULES_YEAR`), `core.js` (formato, carga con respaldo, marcador y tabla en vivo), `card.js` (textos de las imágenes
  para compartir), `trivia.js` (trivia diaria desde `club.json`, sin repetir hasta agotar el pozo: `triviaCycle`), `games.js` (prode y once), `daily.js` (lo común de los juegos del día: semilla por juego, `dailyPick` sin repetidos, buscador de jugadores, racha), `duel.js` (Mano a Mano), `players.js` (El Tapado, Trayectoria V, Grilla del Fortín y El Once de Liniers), `barrio.js` (casas y árboles genéricos sobre las calles reales de `entorno.json`, para el 3D), `crests.js` (une por nombre los equipos del historial 1919–2000 con su id de ESPN → `escudos.json`), `storage.js`
  (`localStorage` con prefijo `fortin:`). Testear acá, no en los componentes.
- `src/hooks/`: `useLiveData` (ESPN con refresco 5 min / 1 min en vivo; mientras se juega, el refresco de cada minuto es solo el scoreboard —`fetchLiveFast`— y el completo va cada 5 min; con la página oculta no pide y al volver refresca; la copia del deploy nunca pisa datos más nuevos —`keepNewest`—; próximo partido = `nextMatch`, que saltea postergados; lo último recibido en vivo queda en `localStorage` —`fortin:live`— y se muestra al abrir si es más nuevo que lo que trae la página), `useJson` (JSON compartido entre
  componentes), `useCached` (promesa con vencimiento), `useRoster`, `useNow`, `useLiveTitle`, `useScrollToHash`,
  `useCurrentSection`. Convención: `undefined` = cargando, `null` = falló o no hay.
- `src/components/`: `Layout`/`PageBand`, `MatchRow`/`MatchList`, `Crest`, `ResultBadge`, `Segmented`,
  `Skeletons`, `Lines`, `Empty` (`Crest` sin escudo de ESPN = escudo gris con «?»), `ExtLink`, `ShareCard` (imagen 1080×1350 con `<canvas>`), `InstallApp`.
  `src/sections/`: bloques grandes (Juega, Previa, Formaciones (probables onces, dentro de la previa), Resumen = «Así terminó», Cifras = Vélez en cifras, Noticias, Tablas, Goleadores, Playoffs, Simulador, Records,
  Estadio3D). El estadio 3D usa **Three.js** en `sections/estadio-scene.js`, que se carga con import dinámico solo
  en Club › Estadio; medidas y cámaras en `lib/stadium.js`; datos en `club.json › estadio.tribunas`.
- Prerender: `npm run build` = `vite build` + `vite build --ssr src/prerender.jsx` + `scripts/prerender.mjs`, que mete
  en cada `dist/*.html` el contenido dibujado y los datos (`<script id="initial-data">`, leído por `src/initial.js`).
  `src/main.jsx` hidrata si la página viene prerenderizada. Qué datos lleva cada página: `PAGE_DATA` en el script.
- `src/styles.css`: sistema de diseño (tokens claro y noche). Se siguen usando las mismas clases CSS de antes.
- **App instalable (PWA):** `public/manifest.webmanifest` («El Fortín», ícono fortín blanco con la V sobre la V de la
  camiseta: `public/assets/icons/`) y `public/sw.js` (red primero para páginas y datos con límite de 3 s y después lo guardado; guardado
  para JS/CSS/íconos/miniaturas; la lista de precarga la escribe `scripts/prerender.mjs` en `dist/sw.js` entre los
  marcadores `/*precarga:*/`; las páginas se guardan sin query; ESPN no pasa por él; tests en `tests/sw.test.js`). Se registra en `src/main.jsx` solo en producción. Cambiar `VERSION` para borrar lo guardado.
- **Visitas:** GoatCounter (sin cookies, cifras agregadas), cargado desde `src/main.jsx` solo en `*.github.io`. Panel:
  `juanignaciotorres.goatcounter.com` (cuenta del usuario).
- `public/`: `assets/` (escudo, `og.png`, `icons/`), `data/club.json` (a mano), `data/historico.json`, `data/generated/`
  (lo genera el deploy; no va al repo).
- `scripts/` (Node): `update-data.mjs` (genera `public/data/generated/`), `news.mjs` (titulares y resumen IA),
  `ics.mjs`, `check-data.mjs` (issue «Revisar datos del sitio»), `import-historico.mjs` (uso único, ya corrido), `import-jugadores.mjs` (Wikidata → `public/data/jugadores.json`; correcciones en `scripts/jugadores-fixes.json`), `import-onces.mjs` (ESPN + `scripts/onces-a-mano.json` → `public/data/onces.json`), `import-entorno.mjs` (OpenStreetMap → `public/data/entorno.json`, barrio del 3D), `import-copas.mjs` (`copas-historicas.txt` → `public/data/copas-historicas.json`, y con `--amateur` `amateur-historico.txt` → `amateur-historico.json`; correrlo si se corrige el .txt: un test avisa si quedaron distintos).
- Workflows: `deploy.yml` (push a `main`, cada 15 min —GitHub lo demora: con «cada 1 h» corría cada 3 a 5 h— y manual: `npm ci`, tests, datos, chequeo, `vite build`, publica
  `dist/`), `news-summary.yml` (todos los días 20:30 AR, solo si hay notas nuevas: resumen de 7 días con Qwen3-8B
  como artifact; el deploy baja el artifact más nuevo) y `keepalive.yml` (commit mínimo si
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
- **Resumen con IA (diario, si hay notas nuevas):** Qwen3-8B con llama.cpp en la CPU del runner (gratis, sin keys). Se descartan los puntos
  con números o fechas que no estén en su nota; aviso visible de que lo escribe una IA; se oculta a los 10 días.
- **Historial:** 1919–1930 de RSSSF (era amateur, con fechas), 1931–2000 del dataset de Kaggle (dominio público, solo Primera y sin fechas), copas 1970–2000 de RSSSF
  (transcriptas a mano, con crédito en el pie; cancha explícita: `neutral` y `venueUnknown`) y desde 2001 de ESPN.
- **Récords:** Wikipedia (CC BY-SA).
- **Jugadores históricos (juegos):** Wikidata (CC0), 426 jugadores con trayectoria; tiene errores y omisiones, por eso
  los juegos no usan sus partidos ni goles. **Fotos:** Wikimedia Commons (146 jugadores), cada una con autor y
  licencia guardados en `jugadores.json` (`img`) y mostrados junto a la foto grande (`PlayerReveal`): no mostrar una
  foto de Commons sin su crédito. El plantel actual casi no tiene foto (ESPN da 2 de 30): va el dorsal. **Escudos de
  los clubes de cada trayectoria:** ESPN (buscados por nombre dentro de las ligas del país) y, si no, el logo de Commons. Formaciones de El Once de Liniers: ESPN y, las de 1994, Wikipedia.
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
  de estado. React suma ~66 KB gzip compartidos entre páginas. **Three.js** (oct-2026, pedido del usuario para el
  estadio 3D) es la única otra dependencia: solo `three`, sin `@react-three/fiber` ni `drei`, en un archivo aparte
  (~150 KB gzip) que baja únicamente Club › Estadio.
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

- **Tribunas (oct-2026):** nombres, sectores, puertas y accesos los confirmó el usuario; capacidades de Wikipedia
  (suman 49.540). El 3D sale de dos fotos aéreas actuales que pasó el usuario (la referencia que manda): todo azul,
  **«VELEZ» en la Norte Alta**, **V blanca en la Sur Baja** (vértice hacia la cancha), populares curvas detrás de los
  arcos, Norte con 3 bandejas, palcos y visera, Sur con 2 bandejas y descubierta, 4 torres LED, pantalla detrás de
  la Popular Este. Las alturas son estimadas. No se usó el modelo de SketchUp (el dominio está bloqueado acá). 
  Alrededores (confirmado por el usuario): Av. Juan B. Justo por el norte (rampas, estacionamiento, sede) y la
  Autopista Perito Moreno (AU6), elevada, pegada a la Sur (es la vía ancha de la foto).
- **Barrio real del 3D (nov-2026, pedido del usuario: «que los alrededores sean los verdaderos»):** en «hoy», el entorno
  sale de **OpenStreetMap** (ODbL, crédito debajo del 3D y en `site.js`): `scripts/import-entorno.mjs` (a mano, con
  reintentos porque Overpass suele estar lleno) → `public/data/entorno.json` (~90 KB, 900 m de radio, coordenadas en
  metros desde el centro de la cancha, giradas 8,4° con la cancha de OSM, que mide 105 × 68 como la de la escena).
  Lo dibuja `sections/estadio-entorno.js`: calles con su ancho, AU6 en puente a 9 m con bajadas interpoladas y pilas,
  **vías del Sarmiento al sur de la autopista** (OSM lo resolvió), parques, canchas, playas con autos, ~300 edificios con
  altura de OSM. OSM casi no tiene casas: `lib/barrio.js` completa las manzanas con casas genéricas en lotes de
  8,66 m sobre las calles reales y árboles de vereda, de patio y de parque (inferencia, determinista). Las canchas
  de piso azul van como `FIXES` en el importador (OSM no dice la superficie). Se descartaron Google Maps (3D Tiles
  exige key y sus términos no dejan usarlo así) y recrearlo con IA (inventa). Si `entorno.json` no baja, queda el
  entorno aproximado de antes (`liniers` en `estadio-scene.js`). Las épocas viejas siguen con su barrio genérico.
  Costo: «hoy» pasó a ~159.000 triángulos (tope 165.000 en `tests/stadium.test.js`).
- **Línea de tiempo del estadio 3D (oct-2026):** 1924 (Villa Luro: Basualdo, Pizarro, Guardia Nacional, Schmidl),
  1951, años 70, 1978 y hoy, a partir de fotos de época que pasó el usuario. Formas en `lib/stadium.js › ERAS`,
  textos en `club.json › estadio.epocas`. Son aproximadas; solo en «hoy» se eligen tribunas.
- **Realismo del estadio 3D (nov-2026):** filas de butacas, escalones y público son **texturas de canvas** que se
  repiten (`seatTile`, `terraceTile`, `crowdTile` en `estadio-scene.js`), no geometría; la tribuna elegida se
  ilumina con `emissive`. Botón «Con público». Son **genéricos, sin confirmar con fotos**: escaleras cada 10 m,
  fachadas (pilastras, ventanas, portones), visera en voladizo, barrio, autos y estacionamiento. Del resumen de TV
  de Vélez 2-2 San Lorenzo (nov-2026) sí sale: carteles LED en todo el lateral de enfrente de la cámara y detrás de
  los arcos, carteles chicos en el piso al lado de cada arco, bancos del lado de la cámara y telones a rayas en la
  popular. La cámara de TV y los bancos están del lado de la Norte y los LED del lateral, en la Sur (confirmado por el usuario).
  De cuatro fotos que pasó el usuario (nov-2026) sale: exterior todo azul (plateas con losas y columnas a la vista,
  cinco cuerpos de rampas en la espalda de la Sur), torres blancas más altas que las tribunas con un anillo rojo
  (sin marca) y panel más alto que ancho, visera corta con reflectores en el borde, franja iluminada entre bandejas,
  autopista separada de la Sur (cancha de tenis y árboles en el medio), barrio muy arbolado, playa del lado Este.
  La foto donde la Norte Alta se ve blanca es vieja: hoy es azul con «VELEZ» (confirmado por el usuario).
  La autopista va como curva (`au6` en `estadio-scene.js`): se abre hacia el oeste y dobla al norte; el trazado es
  a ojo desde la foto, no medido.
  Revisión con 5 agentes (nov-2026, dos rondas contra las mismas fotos): Sur Alta en trapecio y en voladizo sobre la
  baja (`over` y `flare` en `stadium.js`), anillo cerrado en las esquinas, visera corta pegada a la última fila con
  fila de focos, torres con el cilindro rojo bajo un panel alto, rampas abiertas y bocas de acceso; sol desde el
  noreste (la Sur al sol, la Norte en sombra); playa del Este, tenis, galpón sin marca y parque reubicados midiendo
  la foto; avenida a 62 m de la Norte en «hoy» (entre las dos hay arboleda, no estacionamiento). Rendimiento: las
  sombras se dibujan una sola vez y **la escena solo se redibuja cuando algo cambia** (`invalidate()`; todo cambio
  nuevo de escena o cámara tiene que llamarlo). Medido en Node, no en un celular: 145 mallas, 77 materiales.
  Sin verificar: fps y memoria en un teléfono, gesto táctil, restauración del contexto WebGL.
  Ronda 3 (nov-2026), con una foto aérea de febrero de 2026 tomada desde el norte (la mejor referencia de «hoy»):
  detrás de la Norte hay un **edificio** con azotea (`back` en la pieza `visera`, 28 m estimados), parasoles blancos y
  el cartel con el nombre del club; la «visera» es una **cercha blanca con reflectores** y una cabina, no un techo; la
  V es ancha y, como «VELEZ», está hecha de butacas sueltas; el cilindro rojo va solo en las torres del sur. Textos
  permitidos en el 3D: el nombre del club y del estadio y «PLATEA CARLOS BIANCHI»; nada de sponsors ni escudo.
  Técnicas: mapa de entorno generado (PMREM, sin archivo), `roughnessMap` en butacas y césped, suciedad y sombra de
  contacto horneadas en las texturas, haces falsos en las torres. Descartado a propósito: SSS, relieve en escalones,
  bloom, profundidad de campo, briznas 3D y butacas instanciadas (no entran en celular).
  `tests/stadium.test.js` fija un **tope de costo por época** (`BUDGET`; `STADIUM_COST=1 node --test
  tests/stadium.test.js` imprime los números). «Hoy» está al límite en texturas (20 de 20).
- **Épocas viejas del 3D (nov-2026, decisiones del usuario; no hay fotos de época a mano):** 1924 = tribuna
  principal de tablones sobre Basualdo (lado `sur`) con módulo central techado a dos aguas, sin luz artificial (es de
  dic-1928), calles de tierra; 1951 = lo que dice `club.json` (asimétrico, sin segundas bandejas, Norte de madera
  techada, sin torres); años 70 = Norte en dos bandejas de curva a curva, Sur de una bandeja, 4 torres; 1978 = Sur
  Alta de hormigón. **La Sur no se techa en ninguna época**, las rampas exteriores de la Sur no se dibujan antes de
  «hoy» y la autopista solo aparece en «hoy». Cada época tiene su entorno en la tabla `ENTORNO` de
  `estadio-scene.js` y su césped en `style.pitch`. Medidas, densidades, autos y arbolado de época son inferencia.
  Las torres de los años 70 y 1978 son mástiles lisos, sin reticulado (confirmado por el usuario).
- **Hinchada con público (nov-2026, pedido del usuario):** `cheer()` en `estadio-scene.js`, solo «hoy» y solo con
  «Con público». Lo documentado (El Destape, Vélez-River 2022; Vermouth Deportivo, final ante Huracán 2024;
  velez.com.ar, «Recibimiento tricolor» 2017): banderas largas, banderitas rojas, blancas y verdes en la Oeste (el
  tricolor del origen italiano), globos azules y blancos en la Este y banderas y globos en las plateas. Inferencia:
  cantidades, tamaños, posiciones y los trapos lisos de la reja. Sin textos ni nombres de barras. Nada cerca de donde
  se sienta la cámara «desde la tribuna». El mosaico «Vélez» (azul sobre blanco, zona media y baja de la Sur, Vélez-River 2022) es un botón aparte, solo
  en «hoy»: esconde la V, reusa la textura de las letras de la Norte y prende el público (sacar el público lo apaga).
  Con él, «hoy sin entorno» queda justo en el tope de 80 materiales.
- **Vista por bandeja: probada y descartada por el usuario (nov-2026).** «Desde la tribuna» sienta siempre en la
  bandeja más alta; no volver a proponer un selector Baja / Media / Alta.

- **Página Juegos (nov-2026):** un juego por vez, con pestañas y `#hash` (`trivia`, `duelo`, `tapado`, `trayectoria`,
  `grilla`, `liniers`, `prode`, `once`); cada juego está en `src/sections/juegos/`. Los datos de los juegos nuevos se
  piden al abrir su pestaña (no van en el prerender). Efectos (fichas que se dan vuelta, números que suben, papelitos,
  sacudida, vibración) en `sections/juegos/shared.jsx` y al final de `styles.css`; todos se apagan con «reducir
  movimiento». En el panel integrado oculto las animaciones CSS quedan congeladas en el primer cuadro: medir el DOM. Los heredocs de Git Bash fallan con plantillas de JS adentro:
  escribir el script con la herramienta de archivos.

## Ideas no hechas (solo si el usuario las pide)

- Trivia: hecha la versión automática (oct-2026, desde `club.json`). Si el usuario quiere preguntas escritas a mano,
  sumarlas iterando con él.
- Push de gol con la app cerrada: necesita un servicio que mande las notificaciones (cambia la infraestructura).
- Votaciones o ranking entre hinchas (figura del partido, prode compartido): necesitan backend.
- Página por rival: el historial ya tiene `?rival=` para compartir; una página propia sería con `src/site.js` + un
  HTML + `src/pages/<clave>.jsx` (ver README).

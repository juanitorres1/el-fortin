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
  (rachas, rival, `teamForm` del rival, un día como hoy, cancha neutral, `seasonNumbers` = Vélez en cifras, `rivalRanking`), `playoffs.js`, `bracket.js` (cuadro de los playoffs: octavos por puesto según `PLAYOFF_SEEDS` de `rules.js`, sacado de los cruces del Apertura 2026; si ESPN no encaja, cuadro plano), `weather.js`, `news.js`, `rules.js` (reglamento,
  `RULES_YEAR`), `core.js` (formato, carga con respaldo, marcador y tabla en vivo), `card.js` (textos de las imágenes
  para compartir), `trivia.js` (trivia diaria desde `club.json`, sin repetir hasta agotar el pozo: `triviaCycle`), `games.js` (prode y once), `daily.js` (lo común de los juegos del día: semilla por juego, `dailyPick` sin repetidos, buscador de jugadores, racha), `duel.js` (Mano a Mano), `players.js` (El Tapado, Trayectoria V, Grilla del Fortín y El Once de Liniers), `barrio.js` (casas y árboles genéricos sobre las calles reales de `entorno.json`, para el 3D), `crests.js` (une por nombre los equipos del historial 1919–2000 con su id de ESPN → `escudos.json`), `storage.js`
  (`localStorage` con prefijo `fortin:`). Testear acá, no en los componentes.
- `src/hooks/`: `useLiveData` (ESPN con refresco 5 min / 1 min en vivo; mientras se juega, el refresco de cada minuto es solo el scoreboard —`fetchLiveFast`— y el completo va cada 5 min; con la página oculta no pide y al volver refresca; la copia del deploy nunca pisa datos más nuevos —`keepNewest`—; próximo partido = `nextMatch`, que saltea postergados; lo último recibido en vivo queda en `localStorage` —`fortin:live`— y se muestra al abrir si es más nuevo que lo que trae la página), `useJson` (JSON compartido entre
  componentes), `useCached` (promesa con vencimiento), `useRoster`, `useNow`, `useLiveTitle`, `useScrollToHash`,
  `useCurrentSection`. Convención: `undefined` = cargando, `null` = falló o no hay.
- `src/components/`: `Layout`/`PageBand`, `MatchRow`/`MatchList`, `Crest`, `ResultBadge`, `Segmented`,
  `Skeletons`, `Lines`, `Empty` (`Crest` sin escudo de ESPN = escudo gris con «?»), `ExtLink`, `ShareCard` (imagen 1080×1350 con `<canvas>`), `InstallApp`.
  `src/sections/`: bloques grandes (Juega, Previa, Formaciones (probables onces, dentro de la previa), Resumen = «Así terminó», Cifras = Vélez en cifras, Noticias, Tablas, Goleadores, Playoffs, Cuadro (el mapa del reducido: reemplaza a «Camino a los playoffs» y va arriba desde que empiezan; partidos de `playoffs.json` del deploy + `playoffNow` del scoreboard del día que trae `useLiveData`, que refresca cada minuto si se juega uno del cuadro), Simulador, Records,
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

- **Modo Carrera (nov-2026, etapa 1 de 3, pedido del usuario):** pestaña `#carrera` (no es del día: no cuenta para la racha). Un pibe de las inferiores arranca en la Reserva y sube según la confianza del DT (< 50 Reserva, ≥ 70 titular); cada semana entrena o descansa y en el partido juega 2 o 3 «momentos» (remate, pase o penal en playoffs) con una barra de timing; el resto se simula con goles de Poisson. Torneo = las dos zonas reales de ESPN todos contra todos + playoffs de 16. Lógica pura en `src/lib/carrera/` (`player`, `season`, `match`, `career`, `save`; todo el azar sale de la semilla + la semana), tests y balance en `tests/carrera.test.js`. UI en `src/sections/juegos/carrera/`, cargada con `lazy()` (~30 KB gzip). Guardado en `fortin:carrera` con `v` y migraciones; se exporta e importa con un código. Las fuerzas de los equipos son inferencia (puntos y diferencia por partido, comprimidas a 50–72). UI (nov-2026, inspirada en juegos de carrera): carta del jugador en vivo al crearlo, hub con objetivo (confianza del DT hacia el próximo rol), forma (últimos 5 puntajes), calendario deslizable y botón principal fijo abajo; jugadas en SVG (`Escena.jsx`: arco con arquero que se tira, cancha con pases), barra con veredicto y estrellas, festejo «¡GOOOL!», hitos (debut, titularidad, título) en el resultado. Partido (nov-2026): «Salen los equipos» antes de la primera jugada, línea de tiempo 0–90 con goles y jugadas, relato «mientras tanto» con los goles simulados entre jugadas, y una reacción por resultado (`kind` en cada jugada: gol, atajada, palo, afuera, mal, asistencia, ok, cortado; los guardados viejos se deducen con `outcomeKind`): tribuna que salta, estela, palo que titila, destello y sacudida. Las animaciones dejan el estado final como estilo y animan «desde» el inicio, así «reducir movimiento» solo las apaga. Nov-2026 también: **gambeta** (por afuera, enganche o caño; pesa la velocidad; si sale, la jugada sigue con un remate en el mismo minuto, `from: 'gambeta'`), **eventos de la semana** fuera de la cancha (`lib/carrera/extras.js › EVENTS`, 40 % de las semanas, efectos fijos a la vista, nunca en la primera semana) y **metas del torneo** (3 según el rol al arrancar; cada una cumplida suma 4 hinchas al cierre). También **logros** (`lib/carrera/logros.js`: 15, por partido o por torneo, guardados en `state.logros` con el torneo en que salieron; vitrina en la Ficha) y **partidos grandes** (River, Boca, San Lorenzo, Racing, Independiente y Huracán, por nombre de ESPN: cada gol vale doble en hinchas). Y (`lib/carrera/historia.js`): **lugar en la historia** (totales de la carrera contra `club.json › records` goleadores y presencias, sin Cubero como en la trivia), **conferencia de prensa** (45 % de los partidos de Primera, 3 respuestas con efectos fijos), **edad** (desde los 31 bajan velocidad y físico; desde los 34, todo) y **retiro** (desde los 33 se puede, a los 38 es obligatorio; pantalla de despedida). **Balance de carrera (nov-2026, pedido del usuario: que pasar a Bianchi cueste):** los atributos tienen techo (`ATTR_CAP` = 88), en la chance de gol pesa más el timing que el remate y el jugador le suma a Vélez como mucho +4 de fuerza. Medido simulando carreras de 18 a 33 años: perfecto ≈ 240 goles (pasa a Bianchi apenas), bueno ≈ 160, medio ≈ 130; 3 a 5 títulos. Lo fija un test de `tests/carrera.test.js`. **Plata (`lib/carrera/economia.js`):** sueldo semanal según rol, media, hinchas y aumentos; premios por gol y triunfo en Primera; 6 **mejoras** que se compran una vez (pestaña Mejoras; efectos chicos a propósito: con todas compradas el «bueno» sigue debajo de Bianchi); **oferta de Europa** como evento (solo titular con 40+ hinchas; irse no es opción: quedarse da el logro «Corazón de Vélez», pedir aumento sube el sueldo). Montos de ficción, sin apuestas. **Puestos (nov-2026, pedido del usuario):** el lugar se elige tocando una cancha con la formación 4-2-3-1 (`player.js › SPOTS`: 11 lugares con su `mix` de jugadas; arquero, 4 defensores, 3 volantes, 3 delanteros). Los guardados viejos sin `spot` juegan de 9 o de enganche, con las mismas jugadas que antes. **Defensor:** jugada «quite» (acompañar, barrida, anticipo; pesa el físico; si falla puede ser gol del rival, el anticipo que sale puede terminar en gol de contra). **Arquero:** jugada «atajada» (se toca el arco para tirarse; el que patea perfila un lado, `tell`, que acierta el 55 %; en playoffs ataja un penal) y ve sus atributos como Reflejos, Saque, Achique y Físico (mismas claves de siempre). Lo que juegan arqueros y defensores sale de los goles simulados del rival (`guard` en `startMatch`); valla invicta, atajadas y quites suman al puntaje, a las metas, a 4 logros nuevos y al premio. Medido: los tres estilos llegan a titular en tiempos parecidos a los del 9; el arquero que lee al que patea recibe ≈ 0,8 goles por partido y uno que se tira al azar ≈ 1,1. **Salida de equipos (nov-2026):** «Salen los equipos» muestra los once en el 4-2-3-1 con el plantel real de ESPN por puesto (`lib/carrera/lineup.js`; `state.squad` se guarda al crear; las carreras viejas sin plantel usan `mates` y dejan el arco sin nombre) y el jugador en su lugar (en el banco, lo ocupa otro). En la atajada se ve al que patea de espaldas (genérico, sin escudo ni número) y el arquero se inclina hacia el lado elegido mientras corre la barra. **Equipo ideal del torneo** (`IDEAL` en `career.js`: 8 partidos de Primera y promedio 7 o más; +5 hinchas y logro): sale casi siempre jugando perfecto y pocas veces jugando bien. **Iteración nov-2026:** **tiro libre** (si perdés una gambeta encarando bien, 35 % de falta, `FOUL_CHANCE`; la barrera tapa el palo izquierdo: por arriba solo entra frenando la barra en 0,6 o más, `FREE_KICK.over`; logro «Comba perfecta»); **lesiones** (`injuryChance`: 1,5 % base, mucho más si el partido termina con poca energía y desde los 31; 1 a 3 semanas; lesionado no entrena ni juega: `injuredWeek` simula el partido sin él, cobra el sueldo y baja 2 la confianza; la pretemporada cura; mejora «kinesiólogo»); **capitán** (`CAPTAIN`: 25 partidos de titular en la carrera, 50 hinchas y ser titular; la cinta suaviza las caídas de confianza y da un logro); **consejos del DT** (`TIPS` en `match.js`, uno por tipo de jugada, la primera vez: `state.tips`). Las faltas, lesiones y barrera usan sorteos aparte (`randOf` con su clave) para no cambiar lo que ya salía. Medido con lesiones: perfecto ≈ 242 goles, bueno ≈ 160, medio ≈ 146. En escritorio la escena de la jugada mide como mucho 36rem. Pendiente (solo si el usuario lo pide): copas.
- **Página Juegos (nov-2026):** un juego por vez, con pestañas y `#hash` (`trivia`, `duelo`, `tapado`, `trayectoria`,
  `grilla`, `liniers`, `prode`, `once`, `carrera`); cada juego está en `src/sections/juegos/`. Los datos de los juegos nuevos se
  piden al abrir su pestaña (no van en el prerender). Efectos (fichas que se dan vuelta, números que suben, papelitos,
  sacudida, vibración) en `sections/juegos/shared.jsx` y al final de `styles.css`; todos se apagan con «reducir
  movimiento». En el panel integrado oculto las animaciones CSS quedan congeladas en el primer cuadro: medir el DOM. Los heredocs de Git Bash fallan con plantillas de JS adentro:
  escribir el script con la herramienta de archivos.

- **Auditoría externa (nov-2026):** el Inicio ya no baja los scoreboards de meses cerrados ni el detalle completo de
  ESPN: el deploy escribe `goleadores.json` (goles de los meses cerrados; `fetchScorers` pide solo los meses que
  siguen) y `summaries.json` (`slimSummary`: último partido de Vélez y del próximo rival, ~20 KB contra ~400 KB; lo
  lee `loadSummary` en `hooks/data.js` y, si no está, pide a ESPN). Rondas de ESPN en castellano (`roundName`),
  tildes corregidas (`PERSON_NAMES`), un partido por penales cuenta como ganado o perdido en todo el sitio (también
  en Cifras, que separa la cancha neutral y no muestra puntos en copas), goleadores con «1 con Talleres» (`by`),
  `public/404.html`, `sitemap.xml` y `robots.txt` del build, canonical por ficha en el cliente, modo asistido en la
  Carrera (solo interfaz, ejecución fija 0,55). Descartado: CSP y SRI de GoatCounter (count.js no está versionado),
  partir el CSS y el historial, posponer la precarga del SW, JSON-LD y og:image por página.

## Ideas no hechas (solo si el usuario las pide)

- Trivia: hecha la versión automática (oct-2026, desde `club.json`). Si el usuario quiere preguntas escritas a mano,
  sumarlas iterando con él.
- Push de gol con la app cerrada: necesita un servicio que mande las notificaciones (cambia la infraestructura).
- Votaciones o ranking entre hinchas (figura del partido, prode compartido): necesitan backend.
- Página por rival: el historial ya tiene `?rival=` para compartir; una página propia sería con `src/site.js` + un
  HTML + `src/pages/<clave>.jsx` (ver README).

# El Fortín · contexto del proyecto

Sitio de hinchas (no oficial) de Vélez Sarsfield. Publicado en **https://juanitorres1.github.io/el-fortin/**
(repo `juanitorres1/el-fortin`, rama `main`, GitHub Pages con deploy por Actions). El detalle de fuentes de datos,
diseño y decisiones está en `README.md`: leerlo antes de cambiar algo grande.

## Stack y estructura

Sitio estático **sin build ni dependencias** (HTML + CSS + JS en módulos ES; no hay `npm install`). Node ≥ 20.

- **5 páginas:** `index.html` (Inicio), `partidos.html`, `plantel.html`, `historial.html`, `club.html`. Cada una
  carga su módulo `js/pages/<pagina>.js`. El Inicio se llama `inicio.js`.
- `js/core.js`: lo común (formato, `esc`, escudos achicados, `loadLive` de ESPN con respaldo, fila de partido,
  esqueletos, `scrollToHash`). `js/espn.js`: cliente y normalizador de ESPN. `js/news.js`: utilidades de noticias
  compartidas entre navegador y scripts.
- `js/rules.js`: reglas que no salen de ESPN (promedios, descenso), revisadas para `RULES_YEAR`. Cada temporada nueva
  el chequeo de datos abre un issue para revisarlas.
- `js/playoffs.js`: camino a los playoffs (cálculo conservador de clasificación).
- `js/facts.js`: rachas, historial con el próximo rival y «un día como hoy» (navegador y scripts). `js/weather.js`: pronóstico
  de Open-Meteo para la hora del partido.
- `css/styles.css`: sistema de diseño completo (tokens claro y noche, componentes).
- `scripts/update-data.mjs`: genera `data/generated/` (snapshot, historial, estadísticas, titulares y miniaturas).
  `scripts/news.mjs`: titulares y resumen con IA. `scripts/ics.mjs`: calendario `velez.ics`. `scripts/import-historico.mjs`: uso único, ya corrido.
  `scripts/serve.mjs`: servidor local. `scripts/check-data.mjs`: chequeo de datos del deploy (issue «Revisar datos del sitio»).
- `data/club.json`: contenido editorial a mano (historia, estadio, frases de Don Pepe, momentos, palmarés, ídolos,
  récords). `data/historico.json`: partidos 1931–2000 (dataset público, validado).
- Workflows: `deploy.yml` (cada push a `main`, cada 1 h y manual) y `news-weekly.yml` (lunes 9:00 AR: resumen con
  Qwen3-8B, guardado como artifact que el deploy baja) y `keepalive.yml` (lunes: si hace 45 días que no hay commits,
  sube uno mínimo para que GitHub no apague los workflows programados).
- **Encabezado, menú y pie están copiados en las 5 páginas** (sin build). Si se cambian, cambiarlos en todas:
  `tests/pages.test.js` falla si quedan distintos o si hay links internos rotos.

Comandos (en Git Bash):
```bash
npm run data   # baja datos a data/generated/ (~60 pedidos a ESPN y ~20 a velez.com.ar)
npm run dev    # http://localhost:5173 (también está en .claude/launch.json como "fortin")
npm test       # 68 tests: espn, news, pages, ics, weather, facts, playoffs, core, check-data
```

## Fuentes de datos (resumen)

- **ESPN** (API no oficial, sin key, con CORS): fixture, resultados, tablas, plantel y estadísticas. Vélez = id `21`,
  liga `arg.1`. Si falla en el navegador se usa `data/generated/snapshot.json`.
- **velez.com.ar**: titulares de la semana. No tiene RSS: se leen las páginas de sección. Manda **ISO-8859-1** en la
  cabecera aunque el HTML diga UTF-8. Las fotos originales pesan más de 2 MB: el deploy genera miniaturas con
  ImageMagick (`data/generated/img/news/`, cacheadas entre corridas).
- **Resumen semanal con IA:** Qwen3-8B con llama.cpp en la CPU del runner (gratis, sin keys). Se descartan los puntos
  con números o fechas que no estén en su nota; aviso visible de que lo escribe una IA; se oculta a los 10 días.
- **Historial:** 1931–2000 del dataset de Kaggle (dominio público) y desde 2001 de ESPN.
- **Récords:** Wikipedia (CC BY-SA).
- **Promedios:** calculados con ESPN (últimas 3 temporadas, sin playoffs). Validados una vez contra Promiedos (oct-2026,
  coinciden los 30 equipos); Promiedos no se usa en el sitio.
- **Pronóstico:** Open-Meteo (sin key, CC BY 4.0), con la ciudad de la sede de ESPN.
- **Imagen para compartir:** `assets/og.png` (1200×630), hecha a mano con Pillow; si se cambia el diseño, regenerarla.

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
- **React / Astro:** se evaluó para escalar a más páginas. Si hace falta, la recomendación es **Astro** (HTML estático,
  componentes, sin peso extra). Quedó pendiente, no se empezó.
- Se sacó a Fabián Cubero de la sección Ídolos (sigue en Récords porque son datos).

## Cómo trabaja el usuario

- Responder en **español**, directo. Revisar el código antes de afirmar; medir antes de opinar.
- **Commits:** Conventional Commits, **un solo `-m`** con el cuerpo adentro y al final
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. En este repo se trabaja **directo sobre `main`** (Pages
  publica desde ahí). El commit y el push se hacen **solo cuando el usuario lo pide** en ese momento.
- Antes de dar algo por terminado: `npm test` y verificar en el navegador (celular 375 px y escritorio, claro y noche).
- No poner keys en el repo. Hay un `.env` local con una key de API-Football **que ya no se usa** (está en `.gitignore`).

## Trampas conocidas

- **Windows tiene un `convert.exe` del sistema** (convierte discos FAT a NTFS): nunca llamarlo. El código solo usa
  `magick` en Windows; en Linux (GitHub) usa `magick` o `convert`. En esta máquina no hay ImageMagick: localmente las
  noticias usan la foto «md» de velez.com.ar como respaldo.
- **Editar archivos con heredocs de Python en Git Bash rompe los `\n` y las comillas.** Usar la herramienta de edición o
  escribir el script en un archivo aparte.
- En tablas, `img { max-width: 100% }` hace que el escudo no cuente para el ancho de la columna: los escudos de tabla
  llevan `max-width: none`.
- El salto a una `#sección` espera a que carguen las tipografías (`scrollToHash` en `core.js`): Montserrat es más
  ancha que la de respaldo y empuja el contenido.
- GitHub Pages cachea los archivos 10 minutos: después de un deploy puede verse la versión anterior un rato.
- El panel del navegador integrado a veces queda oculto y no saca capturas: medir el DOM (por ejemplo, cargando cada
  página en un iframe) en vez de depender de capturas.

## Ideas no hechas (solo si el usuario las pide)

- Trivia de Vélez: pendiente, la vamos a iterar de a poco con el usuario.
- Historial de la era amateur (1919–1930) y copas anteriores a 2001 (fuente posible: RSSSF, formato irregular).
- Migrar a Astro si se suman muchas páginas (por ejemplo, una página por rival o por jugador).

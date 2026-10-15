# El Fortín · Vélez Sarsfield

Sitio de hinchas (no oficial) de Vélez: próximo partido con cuenta regresiva, fixture, resultados, noticias del
club con un resumen semanal hecho por IA, tabla de la
Liga Profesional por zonas y anual, copas en curso, plantel con sanciones estimadas, estadísticas de jugadores
por torneo, historial contra cada rival desde 1931, historia, estadio, frases de José Amalfitani, momentos,
palmarés, ídolos y récords históricos.

Sitio estático sin build ni dependencias: HTML + CSS + JS (módulos ES). Se publica en GitHub Pages.

## Estructura

| Página | Qué tiene | Módulo |
| --- | --- | --- |
| `index.html` (Inicio) | «Juega Vélez» (próximo partido, cuenta regresiva, pronóstico, minuto a minuto en vivo, último resultado, posición), noticias y «La previa» (rachas, historial con el rival, un día como hoy) | `js/pages/inicio.js` |
| `partidos.html` | Lo que viene (con calendario para suscribirse), resultados, racha, tablas (zonas, anual y promedios) y copas | `js/pages/partidos.js` |
| `plantel.html` | Sanciones estimadas, jugadores y estadísticas por torneo | `js/pages/plantel.js` |
| `historial.html` | Historial contra cada rival desde 1931 | `js/pages/historial.js` |
| `club.html` | Historia, estadio (y cómo llegar), Don Pepe, momentos, palmarés, ídolos y récords | `js/pages/club.js` |

`js/core.js` tiene lo común (formato, escudos, carga de ESPN con respaldo, fila de partido). Cada página carga solo
sus datos. El encabezado, el menú y el pie están escritos en cada HTML (sin paso de build): si se cambian, hay que
cambiarlos en las 5 páginas; `tests/pages.test.js` falla si quedan distintos o si hay links internos rotos. Los links
viejos con `#ancla` (de cuando era una sola página) redirigen a la página nueva.

## Diseño

Revisado con las pautas de diseño de Apple (HIG) aplicadas a web: accesibilidad, color, tipografía, layout y modo
oscuro.

- **Paleta oficial de Vélez** y **modo noche automático** (sigue al sistema; sin selector propio, como recomiendan las
  HIG). Contraste mínimo 4,5:1 en todo el texto, medido: azul `#0061A8` 6,4:1 sobre blanco; en modo noche el azul se
  aclara a `#4EA3F0` (7,0:1) porque el oficial no se lee sobre fondo oscuro (2,95:1).
- **Tipografía:** Barlow Condensed para marcadores, números y títulos; Montserrat para el texto. Base 17 px, mínimo
  12 px, en `rem` (respeta el tamaño de letra del navegador).
- **Controles de 44 px como mínimo**; en celular, barra inferior con las 5 secciones.
- **Azul del club con identidad propia:** barra azul, bandas de color y pie azul oscuro, pero sin copiar los rasgos
  característicos de la web oficial (portada partida foto + columna, cortes diagonales, tarjetas azules alternadas,
  fechas en cajas azules con cursiva, esquinas rectas). En su lugar: **el partido primero** (banda «Juega Vélez» arriba
  de todo, con la V de la camiseta tono sobre tono), la **muesca en V** en el borde de las bandas, títulos en Barlow
  Condensed, esquinas suaves y botones tipo píldora.
- Esqueletos mientras cargan los datos; se respetan «reducir movimiento» y «aumentar contraste».

## Cómo funcionan los datos

| Qué | De dónde | Cuándo se actualiza |
| --- | --- | --- |
| Fixture, resultados, copas, tabla por zonas y plantel | API de **ESPN**, desde el navegador | En cada visita (Inicio y Partidos se refrescan cada 5 min; cada 1 min si hay partido en vivo) |
| Tabla anual | Calculada sumando las fases regulares de ESPN (Apertura + Clausura) | En cada visita |
| Respaldo de todo lo anterior | `data/generated/snapshot.json` | Cada 1 h, en GitHub Actions |
| Minuto a minuto (en vivo) | Detalle del partido de ESPN (`/summary`, `keyEvents`), desde el navegador | Cada 1 min mientras se juega |
| Promedios | `data/generated/promedios.json` (fases regulares de las últimas 3 temporadas) + la fase en curso en vivo | Cada 1 h / en cada visita |
| La previa (rachas, historial con el rival, un día como hoy) | `data/generated/facts.json`; las rachas se recalculan con los resultados en vivo | Cada 1 h, en GitHub Actions |
| Calendario para suscribirse | `data/generated/velez.ics` (partidos del año y los que vienen) | Cada 1 h, en GitHub Actions |
| Pronóstico a la hora del partido | **Open-Meteo** (gratis, sin key, CC BY 4.0), desde el navegador, con la ciudad de la sede que informa ESPN | Si el partido es dentro de 7 días |
| Estadísticas de jugadores por torneo, suspendidos y «al límite de amarillas» | `data/generated/players.json`, sumando el detalle (`/summary`) de ESPN de cada partido del año | Cada 1 h, en GitHub Actions |
| Titulares de la semana («Últimas del club») | `data/generated/news.json`, leyendo las páginas de sección de velez.com.ar (no tiene RSS) | Cada 1 h, en GitHub Actions |
| Resumen de la semana con IA | `resumen.json`, generado por `.github/workflows/news-weekly.yml` con **Qwen3-8B** y guardado como artifact; el deploy baja el último | Lunes 9:00 (hora argentina) |
| Historial vs. rivales desde 2001 (todas las competiciones) | `data/generated/matches.json`, armado desde ESPN | Cada 1 h, en GitHub Actions |
| Historial vs. rivales 1931–2000 (solo Primera División) | `data/historico.json`, generado una vez con `scripts/import-historico.mjs` | Nunca (el pasado no cambia) |
| Historia, estadio, frases, momentos, palmarés, ídolos, récords | `data/club.json` (a mano) | Cuando lo edites |

La API de ESPN **no es oficial**: no pide key y permite CORS, pero puede cambiar sin aviso. Si falla en el
navegador, la página usa el snapshot y lo indica con un punto amarillo («Datos guardados del…»). Toda la
lectura de ESPN está en `js/espn.js`, así que si cambia el formato se arregla en un solo lugar.

**Qué no muestra la página, a propósito:** lesionados y DT. ESPN no informa lesiones del fútbol argentino y su
DT de Vélez está desactualizado. Se evaluaron otras fuentes:

- **Promiedos** (datos Opta): tiene lesionados, DT y tablas oficiales (anual, promedios), pero su API no es
  pública y sus datos están licenciados. La integración quedó en el commit `24cfe32` por si se quiere volver.
- **API-Football (plan gratis)**: probado en oct-2026, no da acceso a la temporada actual («try from 2022 to
  2024») ni al parámetro `next`, y no cubre lesiones de la liga argentina ni en planes pagos (`injuries: false`).

**Tabla anual.** Suma las fases regulares de Apertura y Clausura (sin playoffs) y desempata por diferencia de gol
y goles a favor. El reglamento tiene más criterios que ESPN no expone.

**Promedios.** Puntos ÷ partidos jugados en las temporadas 2024, 2025 y 2026, sin playoffs (2024 incluye la fase de
grupos de la Copa de la Liga, `arg.copa_lpf` en ESPN). Los ascendidos dividen solo por los partidos que jugaron en
Primera; los descendidos no figuran. Se validó una vez contra Promiedos (oct-2026, fecha 12 del Clausura): coinciden
los 30 equipos en puntos, partidos y promedio. Promiedos **no** se usa en el sitio. Se marca «Hoy descendería» al
último de los promedios y al último de la anual (si es el mismo, al anteúltimo de la anual). Empates en zona de
descenso se definen con un partido que la página no puede anticipar. Cuando cambie el año, las temporadas que cuentan
se corren solas (`fetchAverageParts` en `js/espn.js`); si la LPF cambia el reglamento, revisar ahí.

**Calendario.** `velez.ics` usa el id de ESPN como UID: si cambia un horario, el evento se actualiza en vez de
duplicarse. Google Calendar refresca los calendarios suscriptos cada varias horas (no se puede forzar).

**Resumen semanal con IA.** Los lunes, `news-weekly.yml` corre **Qwen3-8B** (licencia Apache 2.0) con
llama.cpp en la CPU del runner de GitHub (gratis, sin API keys; ~5–8 min) sobre las notas oficiales de la semana:

- Las notas le llegan ordenadas por importancia (fútbol, palabra del DT, socios, club, después el resto).
- Cada punto cita su nota y la página la linkea. Solo se linkean URLs de `velez.com.ar/…/notas/…`.
- **Control automático:** si un punto tiene números, montos o fechas (también en palabras: «cuatro», «quinto»)
  que no aparecen en su nota, se descarta. Si quedan menos de 2 puntos, no se publica y la página muestra solo
  los titulares. Las opiniones o adjetivos que agregue el modelo no se pueden detectar así: por eso el aviso.
- La página lo muestra con el aviso «generado por IA, puede contener errores: verificá cada punto en su nota», y
  lo oculta si tiene más de 10 días (por si el workflow semanal falló).
- El último resultado y el próximo partido de la sección **no** son del modelo: salen de ESPN en vivo.
- Para regenerarlo a mano: Actions → «Resumen semanal de noticias (Qwen)» → Run workflow.

Se usan solo título, fecha, link y un resumen breve: nunca el texto completo de las notas.

**Historial.** ESPN no tiene partidos de Vélez anteriores a 2001. Para 1931–2000 se usa el dataset
[Liga Argentina 1931–2023](https://www.kaggle.com/datasets/ivanramosctes/liga-argentina-1931-2023) (licencia
ODC-PDDL, dominio público), que trae solo Primera División y **sin fecha por partido**, solo el torneo. Se
validó contra ESPN en 2003–2021: coinciden 638 de 641 partidos (rival, localía y resultado). Lo que falta:

- Era amateur 1919–1930 (el dataset arranca en 1931).
- Copas anteriores a 2001: Libertadores, Intercontinental, Supercopa, Copa Argentina, etc.
- 1941–1943 no aparece porque Vélez jugó en la B.

Los partidos definidos por penales cuentan como empate en el historial.

**Sanciones.** Se estiman con las tarjetas de cada partido según el reglamento de la LPF (cada 5 amarillas en un
mismo torneo = 1 fecha; se limpian antes de los playoffs; las amarillas de un partido con roja no suman) y con
las rojas del último partido. La sanción oficial la define el Tribunal de Disciplina.

**Récords** (goleadores, presencias, títulos, goleadores de torneo): Wikipedia, «Anexo:Futbolistas del Club
Atlético Vélez Sarsfield» (CC BY-SA 4.0). Esas tablas no tienen fecha de actualización.

Para regenerar el histórico (no hace falta salvo que cambie el mapeo de nombres): bajar `liga_2023.csv`
de Kaggle **fuera del repo** y correr `node scripts/import-historico.mjs ruta/a/liga_2023.csv` después de
`npm run data` (usa los nombres de ESPN para unificar rivales).

## Desarrollo local

```bash
npm run data   # baja snapshot, historial, estadísticas y titulares a data/generated/ (~60 requests a ESPN, ~20 a velez.com.ar)
npm run dev    # http://localhost:5173
npm test
```

Node 20 o superior. No hay `npm install`: no hay dependencias.

## Deploy en GitHub Pages

Los cron de GitHub Actions pueden atrasarse varios minutos en horas pico; para forzar una actualización:
Actions → Deploy → Run workflow.

1. Crear el repo en GitHub y pushear `main`.
2. En el repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. El workflow `.github/workflows/deploy.yml` corre los tests, baja los datos y publica. Corre en cada push a
   `main`, cada 1 hora y a mano (Actions → Deploy → Run workflow).

Ojo: GitHub desactiva los workflows programados de repos públicos sin actividad durante 60 días. Si pasa,
se reactivan desde la pestaña Actions.

¿Render o Railway? Funcionan (es un sitio estático: en Render, «Static Site» con publish dir `.` y build
command `npm run data`), pero no aportan nada sobre Pages y no tienen el refresco programado.

## Fuentes del contenido editorial

- Frases de Amalfitani y fechas del estadio: [velez.com.ar – Amalfitani eterno](https://velez.com.ar/club/notas/2019/05/13/142003_amalfitani-eterno),
  [Infobae (14/05/2023)](https://www.infobae.com/deportes/2023/05/14/jose-amalfitani-el-dirigente-que-cambio-la-historia-del-inolvidable-gesto-para-salvar-a-velez-al-premio-que-recibio-meses-antes-de-su-muerte/).
- Fundación, colores, apodo «Fortín» (Crítica, 1932), títulos, Cubero y Bianchi: [Wikipedia – Club Atlético Vélez Sarsfield](https://es.wikipedia.org/wiki/Club_Atl%C3%A9tico_V%C3%A9lez_Sarsfield).
- Biografía de Amalfitani: [Wikipedia – José Amalfitani](https://es.wikipedia.org/wiki/Jos%C3%A9_Amalfitani), [La Nación](https://www.lanacion.com.ar/deportes/futbol/el-recuerdo-jose-amalfitani-homenaje-50-anos-nid2248851/).
- Capacidad: [StadiumDB](https://stadiumdb.com/stadiums/arg/estadio_jose_amalfitani).
- Títulos 2024–2025: verificados con los resultados de ESPN.

Pendiente de verificar con fuente: gol de Chilavert a River (1996) y detalles de la final de la Libertadores 1994.

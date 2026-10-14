# El Fortín · Vélez Sarsfield

Sitio de hinchas (no oficial) de Vélez: próximo partido con cuenta regresiva, fixture, resultados, tabla de la
Liga Profesional por zonas y anual, copas en curso, plantel con lesionados y sanciones, estadísticas de jugadores
por torneo, historial contra cada rival desde 1931, historia, estadio, frases de José Amalfitani, momentos,
palmarés, ídolos y récords históricos.

Sitio estático sin build ni dependencias: HTML + CSS + JS (módulos ES). Se publica en GitHub Pages.

## Cómo funcionan los datos

| Qué | De dónde | Cuándo se actualiza |
| --- | --- | --- |
| Tablas oficiales (zonas, **anual**, **promedios**) con colores de clasificación | `data/generated/promiedos.json`, desde la API de **Promiedos** (datos Opta) | Cada 1 h, en GitHub Actions |
| Plantel, DT y **lesionados/suspendidos del próximo partido**; árbitro y TV | `data/generated/promiedos.json` | Cada 1 h, en GitHub Actions |
| Escudos y banderas de esas secciones | `data/generated/img/`, descargadas por el deploy (cacheadas entre deploys) | Solo las nuevas |
| Fixture, resultados y copas | API de **ESPN**, desde el navegador | En cada visita (cada 1 min si hay partido en vivo) |
| Respaldo de fixture, resultados y tabla de ESPN | `data/generated/snapshot.json` | Cada 1 h, en GitHub Actions |
| Estadísticas de jugadores por torneo y «al límite de amarillas» | `data/generated/players.json`, sumando el detalle (`/summary`) de ESPN de cada partido del año | Cada 1 h, en GitHub Actions |
| Historial vs. rivales desde 2001 (todas las competiciones) | `data/generated/matches.json`, armado desde ESPN | Cada 1 h, en GitHub Actions |
| Historial vs. rivales 1931–2000 (solo Primera División) | `data/historico.json`, generado una vez con `scripts/import-historico.mjs` | Nunca (el pasado no cambia) |
| Historia, estadio, frases, momentos, palmarés, ídolos, récords | `data/club.json` (a mano) | Cuando lo edites |

**Ninguna de las dos APIs es oficial.** Las dos permiten CORS y no piden key, pero pueden cambiar sin aviso:

- **Promiedos** (`js/promiedos.js`): no está documentada y exige el header `X-VER` con la versión de su web
  (sin él responde `{}`). Si deja de andar, lo primero es actualizar ese valor mirando las requests de
  promiedos.com.ar. Sus datos son de Opta, que los licencia: republicarlos en un sitio público es zona gris.
  Si lo bloquean o reclaman, sacar `fetchPromiedos` y la página vuelve sola a ESPN.
- **ESPN** (`js/espn.js`): no informa lesiones del fútbol argentino y tiene el DT desactualizado; por eso
  esos datos salen de Promiedos.

**Promiedos solo lo consulta el deploy** (3 pedidos por hora), nunca el navegador del visitante: así el tráfico
del sitio no le llega a su API. Como sus datos pueden tener hasta 1 h de atraso, la página se cuida sola:

- Si hay un partido de liga en juego, o el último terminó después del último deploy, muestra la tabla de ESPN
  (en vivo) hasta que llegue la de Promiedos, y lo aclara.
- Si las bajas guardadas son de un partido que ya se jugó, no las muestra como del próximo.
- Si el deploy no pudo leer Promiedos, no hay `promiedos.json` y todo sale de ESPN (tabla anual calculada con
  desempate aproximado; suspensiones estimadas por tarjetas; sin lesiones).

**Historial.** ESPN no tiene partidos de Vélez anteriores a 2001. Para 1931–2000 se usa el dataset
[Liga Argentina 1931–2023](https://www.kaggle.com/datasets/ivanramosctes/liga-argentina-1931-2023) (licencia
ODC-PDDL, dominio público), que trae solo Primera División y **sin fecha por partido**, solo el torneo. Se
validó contra ESPN en 2003–2021: coinciden 638 de 641 partidos (rival, localía y resultado). Lo que falta:

- Era amateur 1919–1930 (el dataset arranca en 1931).
- Copas anteriores a 2001: Libertadores, Intercontinental, Supercopa, Copa Argentina, etc.
- 1941–1943 no aparece porque Vélez jugó en la B.

Los partidos definidos por penales cuentan como empate en el historial.

**Bajas.** Lesionados y suspendidos del próximo partido salen de la previa de Promiedos. Aparte, «al límite de
amarillas» se estima con el reglamento de la LPF (cada 5 amarillas en un mismo torneo = 1 fecha; se limpian antes
de los playoffs) sobre las tarjetas de ESPN. Plantel (Promiedos) y estadísticas (ESPN) se cruzan por nombre
sin tildes y, si no coincide, por inicial + apellido.

**Récords** (goleadores, presencias, títulos, goleadores de torneo): Wikipedia, «Anexo:Futbolistas del Club
Atlético Vélez Sarsfield» (CC BY-SA 4.0). Esas tablas no tienen fecha de actualización.

Para regenerar el histórico (no hace falta salvo que cambie el mapeo de nombres): bajar `liga_2023.csv`
de Kaggle **fuera del repo** y correr `node scripts/import-historico.mjs ruta/a/liga_2023.csv` después de
`npm run data` (usa los nombres de ESPN para unificar rivales).

## Desarrollo local

```bash
npm run data   # baja todo a data/generated/ (~60 requests a ESPN, 3 a Promiedos + escudos que falten)
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
   `main`, cada 6 horas y a mano (Actions → Deploy → Run workflow).

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

// Las páginas del sitio en un solo lugar: título, descripción, ícono del menú y archivo. Lo usan vite.config.js (arma
// el <head> de cada HTML, con la vista previa para compartir), el menú (components/Layout.jsx) y los tests.
// Para sumar una página: agregarla acá, crear su HTML (copia de otro, cambiando el script) y src/pages/<key>.jsx.
// Con `nav: false` no va en el menú (jugador, modo cancha).

export const SITE = {
  name: 'El Fortín',
  url: 'https://juanitorres1.github.io/el-fortin/',
  ogImage: 'assets/og.png',
  ogImageAlt: 'El Fortín, sitio de hinchas de Vélez Sarsfield',
  sources:
    'Partidos, tablas, plantel y estadísticas: ESPN. Noticias: velez.com.ar. Pronóstico: Open-Meteo (CC BY 4.0). Historial 1931–2000: dataset «Liga Argentina 1931–2023» (dominio público); copas 1970–2000: RSSSF (rsssf.org, J. P. Andrés, P. Ciullini, K. Stokkermans y otros). Récords: Wikipedia (CC BY-SA).',
};

// Íconos del menú inferior en celular (trazos SVG de 24×24).
const ICONS = {
  inicio: ['M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z'],
  partidos: ['M3 10h18M8 3v4M16 3v4', { rect: [3, 5, 18, 16, 2] }],
  plantel: ['M8 3 3 6l2 5 2-1v11h10V10l2 1 2-5-5-3a4 4 0 0 1-8 0z'],
  historial: ['M12 7v5l3 2', { circle: [12, 12, 9] }],
  juegos: ['M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z', 'M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4'],
  club: ['M12 3 4 6v6c0 4.5 3.4 8.2 8 9 4.6-.8 8-4.5 8-9V6z', 'm9 9 3 6 3-6'],
};

export const PAGES = [
  { key: 'inicio', file: 'index.html', href: './', label: 'Inicio', title: 'El Fortín · Vélez Sarsfield', description: 'Noticias, próximo partido y resultados de Vélez Sarsfield. Sitio de hinchas.' },
  { key: 'partidos', file: 'partidos.html', href: 'partidos.html', label: 'Partidos', title: 'Partidos · El Fortín', description: 'Fixture, resultados, tablas y copas de Vélez Sarsfield.' },
  { key: 'plantel', file: 'plantel.html', href: 'plantel.html', label: 'Plantel', title: 'Plantel · El Fortín', description: 'Plantel de Vélez Sarsfield, sanciones y estadísticas por torneo.' },
  { key: 'historial', file: 'historial.html', href: 'historial.html', label: 'Historial', title: 'Historial · El Fortín', description: 'Historial de Vélez Sarsfield contra cada rival desde 1931.' },
  { key: 'juegos', file: 'juegos.html', href: 'juegos.html', label: 'Juegos', title: 'Juegos · El Fortín', description: 'Trivia diaria de Vélez, prode del próximo partido y adiviná el once titular.' },
  { key: 'club', file: 'club.html', href: 'club.html', label: 'Club', title: 'El club · El Fortín', description: 'Historia, estadio, Don Pepe Amalfitani, momentos, palmarés, ídolos y récords de Vélez Sarsfield.' },
  // Páginas fuera del menú (`parent` = la sección que queda marcada).
  { key: 'jugador', file: 'jugador.html', href: 'jugador.html', label: 'Jugador', parent: 'plantel', nav: false, title: 'Jugador · El Fortín', description: 'Partido por partido de cada jugador del plantel de Vélez Sarsfield.' },
  { key: 'vivo', file: 'vivo.html', href: 'vivo.html', label: 'En la cancha', parent: 'partidos', nav: false, title: 'En la cancha · El Fortín', description: 'Modo cancha: el partido de Vélez, los otros resultados de la fecha y la tabla en vivo.' },
].map((p) => ({ nav: true, ...p, icon: ICONS[p.key], url: SITE.url + (p.file === 'index.html' ? '' : p.file) }));

const attr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** Las etiquetas del <head> de una página (las inserta vite.config.js donde el HTML dice <!--head-->). */
export function headTags(page) {
  return [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
    `<title>${attr(page.title)}</title>`,
    `<meta name="description" content="${attr(page.description)}">`,
    `<link rel="canonical" href="${page.url}">`,
    `<meta property="og:title" content="${attr(page.title)}">`,
    `<meta property="og:description" content="${attr(page.description)}">`,
    `<meta property="og:url" content="${page.url}">`,
    '<meta property="og:type" content="website">',
    `<meta property="og:site_name" content="${SITE.name}">`,
    '<meta property="og:locale" content="es_AR">',
    `<meta property="og:image" content="${SITE.url}${SITE.ogImage}">`,
    '<meta property="og:image:width" content="1200">',
    '<meta property="og:image:height" content="630">',
    `<meta property="og:image:alt" content="${attr(SITE.ogImageAlt)}">`,
    '<meta name="twitter:card" content="summary_large_image">',
    '<meta name="color-scheme" content="light dark">',
    '<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)">',
    '<meta name="theme-color" content="#0f1115" media="(prefers-color-scheme: dark)">',
    '<link rel="icon" href="assets/icons/icon.svg" type="image/svg+xml">',
    '<link rel="icon" href="assets/icons/favicon-32.png" sizes="32x32" type="image/png">',
    // App instalable (PWA): nombre, ícono y pantalla completa al abrirla desde el inicio del celular.
    '<link rel="manifest" href="manifest.webmanifest">',
    '<link rel="apple-touch-icon" href="assets/icons/apple-touch-icon.png">',
    `<meta name="apple-mobile-web-app-title" content="${SITE.name}">`,
    '<meta name="apple-mobile-web-app-capable" content="yes">',
    '<meta name="mobile-web-app-capable" content="yes">',
    '<meta name="apple-mobile-web-app-status-bar-style" content="default">',
    '<link rel="preconnect" href="https://fonts.googleapis.com">',
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
    '<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=Montserrat:wght@400;500;600;700&display=swap" rel="stylesheet">',
  ].join('\n    ');
}

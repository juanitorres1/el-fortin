// Resumen semanal de noticias de la web oficial de Vélez con un LLM open source (Qwen) corriendo local
// (llama.cpp en GitHub Actions). PRUEBA: todavía no se publica en el sitio.
//
// 1. Junta las notas de los últimos 7 días de velez.com.ar (no tiene RSS: se leen las páginas de sección).
// 2. Le pasa al modelo el texto de cada nota y le pide 4-6 puntos, cada uno citando su nota.
// 3. Control automático: un punto con números o fechas que no aparecen literalmente en su nota se descarta.
//
// Uso: LLM_URL=http://127.0.0.1:8080 MODEL_NAME=Qwen3-8B node scripts/news.mjs
import { mkdir, writeFile, appendFile } from 'node:fs/promises';
import { fetchSchedule, velezView } from '../js/espn.js';

const SITE = 'https://velez.com.ar';
const SECTION_PAGES = ['/', '/noticias', '/futbol', '/club', '/socios', '/futbol/notas', '/club/notas', '/socios/notas'];
const DAYS = 7;
const MAX_NOTES = 14;
const MAX_CHARS_PER_NOTE = 1400; // para que el prompt entre en el contexto y el CPU no tarde de más
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (El Fortin; sitio de hinchas)' };

// ---------- Lectura de la web oficial (funciones puras, con tests) ----------

const ENTITIES = {
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ', uuml: 'ü',
  Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', Ntilde: 'Ñ',
  quot: '"', amp: '&', nbsp: ' ', laquo: '«', raquo: '»', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’',
  iquest: '¿', iexcl: '¡', ordm: 'º', ordf: 'ª', deg: '°', ndash: '–', mdash: '—', hellip: '…', lt: '<', gt: '>',
};
export const decodeEntities = (s) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&([a-z]+);/gi, (m, e) => ENTITIES[e] ?? m);

const stripTags = (s) => decodeEntities(s.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

/** Links a notas (/seccion/notas/AAAA/MM/DD/slug) con su fecha. */
export function noteLinks(html) {
  const out = new Map();
  for (const m of html.matchAll(/href="(?:https:\/\/velez\.com\.ar)?(\/([a-z-]+)\/notas\/(\d{4})\/(\d{2})\/(\d{2})\/[^"#?]+)"/g)) {
    out.set(m[1], { url: `${SITE}${m[1]}`, section: m[2], date: `${m[3]}-${m[4]}-${m[5]}` });
  }
  return [...out.values()];
}

/** Título, bajada y párrafos del cuerpo de una nota. */
export function parseNote(html) {
  const meta = (p) => decodeEntities(html.match(new RegExp(`<meta property="${p}" content="([^"]*)"`))?.[1] ?? '').trim();
  const title = meta('og:title').replace(/\s*\/\s*Vélez Sarsfield\s*$/, '').trim();
  const lead = meta('og:description');
  // El cuerpo está en el bloque .nxl-cuerpo; si cambia el diseño, se usan todos los párrafos largos.
  const start = html.search(/class="[^"]*nxl-cuerpo/);
  const scope = start >= 0 ? html.slice(start) : html;
  const paragraphs = [...scope.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map((m) => stripTags(m[1])).filter((p) => p.length > 40 && !p.includes('-->'));
  return { title, lead, body: paragraphs.join('\n') };
}

/** Decodifica según la cabecera HTTP (la web dice UTF-8 en el HTML pero manda ISO-8859-1). */
export function decodeBody(buffer, contentType = '') {
  const charset = contentType.match(/charset=([\w-]+)/i)?.[1]?.toLowerCase() ?? 'utf-8';
  return new TextDecoder(/8859|latin/.test(charset) ? 'latin1' : 'utf-8').decode(buffer);
}

// ---------- Control de datos (función pura, con tests) ----------

const normalizeNum = (s) => s.replace(/[.\s]/g, '').replace(',', '.');

/** Números, horas, fechas y montos que aparecen en un texto («$15.000», «20:30», «31/12», «2027», «3-1»). */
export function factsIn(text) {
  return [...text.matchAll(/(?:\$\s?)?\d+(?:[.,:/-]\d+)*/g)].map((m) => m[0].replace(/^\$\s?/, ''));
}

// Números en palabras que se controlan. «un/uno/una» y «primer/primero» quedan afuera: son demasiado comunes
// como artículo o adjetivo («un gol», «primer tiempo») y darían falsos descartes.
const NUMBER_WORDS = {
  dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12,
  trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20,
  treinta: 30, cuarenta: 40, cincuenta: 50, cien: 100,
  segundo: 2, segunda: 2, tercero: 3, tercer: 3, tercera: 3, cuarto: 4, cuarta: 4, quinto: 5, quinta: 5,
  sexto: 6, sexta: 6, septimo: 7, septima: 7, octavo: 8, octava: 8, noveno: 9, novena: 9, decimo: 10, decima: 10,
};
const plain = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const wordsOf = (s) => plain(s).match(/[a-zñ]+/g) ?? [];

/** Números escritos con letras («cuatro partidos», «quinto puesto»), normalizados sin tildes. */
export function numberWordsIn(text) {
  return wordsOf(text).filter((w) => w in NUMBER_WORDS);
}

/**
 * Un punto pasa si cada dato numérico que menciona aparece en la nota citada, con cifras o en palabras
 * («4» en el punto vale si la nota dice «cuatro», y al revés). Devuelve los datos que no se encontraron.
 */
export function unsupportedFacts(pointText, sourceText) {
  const src = normalizeNum(sourceText);
  const srcWords = new Set(wordsOf(sourceText));
  const srcNumbers = new Set([...(sourceText.match(/\d+/g) ?? []), ...[...srcWords].filter((w) => w in NUMBER_WORDS).map((w) => String(NUMBER_WORDS[w]))]);
  const digits = factsIn(pointText).filter((f) => {
    if (src.includes(normalizeNum(f))) return false;
    // «3-1» puede venir como «3 a 1» en la nota.
    const score = f.match(/^(\d+)-(\d+)$/);
    if (score && new RegExp(`\\b${score[1]}\\s*(?:a|-)\\s*${score[2]}\\b`).test(sourceText)) return false;
    // Un número suelto (sin puntos ni barras) puede estar en palabras en la nota.
    return !(/^\d+$/.test(f) && srcNumbers.has(String(Number(f))));
  });
  const words = numberWordsIn(pointText).filter((w) => !srcWords.has(w) && !srcNumbers.has(String(NUMBER_WORDS[w])));
  return [...digits, ...words];
}

// ---------- Orden por importancia (función pura, con tests) ----------

// Lo que más le importa a un hincha o socio va primero; el modelo ve las notas en este orden.
const SECTION_PRIORITY = ['futbol', 'columnadt', 'socios', 'club', 'institucional', 'elecciones', 'abonos', 'hincha', 'entrenamiento', 'reserva'];
const priorityOf = (section) => {
  const i = SECTION_PRIORITY.indexOf(section);
  return i < 0 ? SECTION_PRIORITY.length : i;
};

/** Ordena por sección (importancia) y, dentro de cada una, de la más nueva a la más vieja. */
export function rankNotes(notes) {
  return [...notes].sort((a, b) => priorityOf(a.section) - priorityOf(b.section) || b.date.localeCompare(a.date));
}

// ---------- Datos fijos del primer equipo (ESPN, sin IA) ----------

const TZ = 'America/Argentina/Buenos_Aires';
const dayParts = new Intl.DateTimeFormat('es-AR', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'numeric' });
// «sábado 17/10» (Intl da «17-10» en es-AR).
const dayFmt = { format: (d) => { const p = Object.fromEntries(dayParts.formatToParts(d).map((x) => [x.type, x.value])); return `${p.weekday} ${p.day}/${p.month}`; } };
const timeFmt = new Intl.DateTimeFormat('es-AR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });

/** Último resultado (si fue en la semana) y próximo partido, armados con datos de ESPN. */
export function matchFacts(fixture, results, now = new Date()) {
  const facts = [];
  const last = results.filter((m) => m.completed && Date.parse(m.date) >= now - DAYS * 864e5).at(-1);
  if (last) {
    const { velez, rival, result } = velezView(last);
    const verb = { G: 'le ganó', E: 'empató', P: 'perdió' }[result] ?? 'jugó';
    // Como se dice en Argentina: el resultado del ganador primero («perdió 2-0 con Lanús»).
    const score = `${Math.max(velez.score, rival.score)}-${Math.min(velez.score, rival.score)}`;
    const vs = result === 'G' ? `a ${rival.name}` : `con ${rival.name}`;
    facts.push({ tipo: 'resultado', texto: `Último resultado: Vélez ${verb} ${score} ${vs} (${last.comp}, ${dayFmt.format(new Date(last.date))}).` });
  }
  const next = fixture.find((m) => !m.completed);
  if (next) {
    const { velezHome, rival } = velezView(next);
    const when = `${dayFmt.format(new Date(next.date))}${next.timeValid ? ` a las ${timeFmt.format(new Date(next.date))}` : ''}`;
    facts.push({ tipo: 'proximo', texto: `Próximo partido: ${velezHome ? 'Vélez vs.' : 'visita a'} ${rival.name}, ${when}${next.venue ? `, en ${next.venue}` : ''} (${next.comp}).` });
  }
  return facts;
}

// ---------- Ejecución ----------

async function fetchText(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return decodeBody(Buffer.from(await res.arrayBuffer()), res.headers.get('content-type') ?? '');
}

export async function collectNotes(now = new Date()) {
  const since = new Date(now.getTime() - DAYS * 864e5).toISOString().slice(0, 10);
  const links = new Map();
  for (const page of SECTION_PAGES) {
    try {
      for (const l of noteLinks(await fetchText(`${SITE}${page}`))) links.set(l.url, l);
    } catch (err) {
      console.warn(`No se pudo leer ${page}: ${err.message}`);
    }
  }
  const recent = rankNotes([...links.values()].filter((l) => l.date >= since));
  const notes = [];
  for (const l of recent) {
    if (notes.length >= MAX_NOTES) break;
    try {
      const note = { ...l, ...parseNote(await fetchText(l.url)) };
      // Notas sin texto (p. ej. «Convocados», que es una imagen) no le sirven al modelo.
      if (note.title && note.body.length + note.lead.length >= 80) notes.push(note);
    } catch (err) {
      console.warn(`No se pudo leer la nota ${l.url}: ${err.message}`);
    }
  }
  return notes;
}

const SYSTEM = `Sos redactor de un sitio de hinchas de Vélez Sarsfield. Escribís en español rioplatense, claro y neutral.
Reglas obligatorias:
- Usá SOLO la información de las notas que te paso. No agregues nada que no esté escrito ahí.
- Copiá números, montos, fechas, horarios y resultados EXACTAMENTE como aparecen en la nota.
- Si no estás seguro de un dato, no lo incluyas.
- Cada punto resume UNA nota y debe indicar el número de esa nota.
- Las notas vienen ordenadas por importancia: la NOTA 1 es la más importante. Seguí ese orden y dejá afuera las del final si no hay lugar.
- Si una nota pone condiciones o requisitos (qué cuota hay que tener paga, quién puede entrar, hasta cuándo, cómo anotarse), incluilos: son lo más útil para el socio.
- El resultado del último partido y el próximo partido del primer equipo ya se muestran aparte: no los repitas, salvo que la nota agregue algo nuevo (por ejemplo, lo que dijo el DT).`;

const SCHEMA = {
  type: 'object',
  properties: {
    puntos: {
      type: 'array',
      minItems: 3,
      maxItems: 6,
      items: { type: 'object', properties: { nota: { type: 'integer' }, texto: { type: 'string' } }, required: ['nota', 'texto'] },
    },
  },
  required: ['puntos'],
};

async function summarize(notes, llmUrl) {
  const corpus = notes
    .map((n, i) => `NOTA ${i + 1} (${n.date}, sección ${n.section})\nTítulo: ${n.title}\nBajada: ${n.lead}\nTexto: ${n.body.slice(0, MAX_CHARS_PER_NOTE)}`)
    .join('\n\n---\n\n');
  const res = await fetch(`${llmUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: `Notas de la semana:\n\n${corpus}\n\nArmá el resumen de la semana en 4 a 6 puntos de una o dos oraciones cada uno. /no_think` },
      ],
      temperature: 0.2,
      max_tokens: 900,
      response_format: { type: 'json_object', schema: SCHEMA },
      chat_template_kwargs: { enable_thinking: false },
      // En streaming la respuesta empieza a llegar enseguida: sin esto, fetch corta a los 5 min de espera
      // (headersTimeout de Node) y en CPU el modelo puede tardar más.
      stream: true,
      timings_per_token: false,
    }),
  });
  if (!res.ok) throw new Error(`LLM ${res.status}: ${await res.text()}`);
  let content = '';
  let usage = null;
  let timings = null;
  let buffer = '';
  const decoder = new TextDecoder();
  for await (const chunk of res.body) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
      const event = JSON.parse(line.slice(6));
      content += event.choices?.[0]?.delta?.content ?? '';
      usage = event.usage ?? usage;
      timings = event.timings ?? timings;
    }
  }
  return { raw: content, parsed: JSON.parse(content.replace(/<think>[\s\S]*?<\/think>/g, '').trim()), usage, timings };
}

async function main() {
  const llmUrl = process.env.LLM_URL ?? 'http://127.0.0.1:8080';
  const model = process.env.MODEL_NAME ?? 'desconocido';
  const t0 = Date.now();
  const [notes, fixture, results] = await Promise.all([collectNotes(), fetchSchedule({ fixture: true }), fetchSchedule({})]);
  const facts = matchFacts(fixture, results);
  const tNotes = Date.now();
  console.log(`Notas de los últimos ${DAYS} días: ${notes.length}`);
  notes.forEach((n, i) => console.log(`  ${i + 1}. ${n.date} [${n.section}] ${n.title} (${n.body.length} caracteres)`));
  if (!notes.length) throw new Error('No se encontraron notas: ¿cambió el HTML de velez.com.ar?');

  const { raw, parsed, usage, timings } = await summarize(notes, llmUrl);
  const tLlm = Date.now();

  const points = (parsed.puntos ?? []).map((p) => {
    const note = notes[p.nota - 1];
    if (!note) return { ...p, ok: false, motivo: `cita una nota que no existe (${p.nota})` };
    const missing = unsupportedFacts(p.texto, `${note.title}\n${note.lead}\n${note.body}`);
    return { ...p, url: note.url, titulo: note.title, ok: missing.length === 0, motivo: missing.length ? `datos que no están en la nota: ${missing.join(', ')}` : null };
  });

  const result = {
    model,
    generatedAt: new Date().toISOString(),
    seconds: { notas: Math.round((tNotes - t0) / 1000), modelo: Math.round((tLlm - tNotes) / 1000) },
    usage,
    timings,
    notes: notes.map(({ body, ...n }) => ({ ...n, chars: body.length })),
    facts,
    points,
    raw,
  };
  await mkdir(new URL('../data/generated/', import.meta.url), { recursive: true });
  await writeFile(new URL('../data/generated/resumen.json', import.meta.url), JSON.stringify(result, null, 2));

  const ok = points.filter((p) => p.ok);
  const lines = [
    `## Resumen semanal · ${model}`,
    `- Notas leídas: ${notes.length} (${result.seconds.notas} s) · Modelo: ${result.seconds.modelo} s` +
      (timings ? ` · prompt ${Math.round(timings.prompt_per_second)} tok/s, generación ${timings.predicted_per_second?.toFixed(1)} tok/s` : ''),
    `- Puntos: ${points.length} generados, ${ok.length} pasan el control, ${points.length - ok.length} descartados`,
    '',
    ...facts.map((f) => `📌 ${f.texto} _(ESPN, sin IA)_`),
    ...points.map((p) => `${p.ok ? '✅' : '❌'} ${p.texto}${p.url ? ` ([nota](${p.url}))` : ''}${p.motivo ? `  \n   _descartado: ${p.motivo}_` : ''}`),
    '',
    '<details><summary>Notas usadas</summary>',
    '',
    ...notes.map((n, i) => `${i + 1}. ${n.date} · [${n.title}](${n.url})`),
    '</details>',
  ];
  console.log(`\n${lines.join('\n')}`);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`);
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` || process.argv[1]?.endsWith('news.mjs')) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

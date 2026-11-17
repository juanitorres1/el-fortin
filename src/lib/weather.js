// Pronóstico del tiempo para la hora del partido, con Open-Meteo (gratis, sin key, con CORS; datos CC BY 4.0).
// Solo se muestra si el partido es dentro de los próximos días: más lejos, el pronóstico por hora no sirve.

export const FORECAST_MAX_DAYS = 7;
const GEO = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST = 'https://api.open-meteo.com/v1/forecast';

// Códigos WMO que usa Open-Meteo → texto corto.
const WMO = [
  [[0], 'Despejado'], [[1], 'Mayormente despejado'], [[2], 'Parcialmente nublado'], [[3], 'Nublado'],
  [[45, 48], 'Niebla'], [[51, 53, 55], 'Llovizna'], [[56, 57], 'Llovizna helada'], [[61], 'Lluvia débil'],
  [[63], 'Lluvia'], [[65], 'Lluvia fuerte'], [[66, 67], 'Lluvia helada'], [[71, 73, 75, 77], 'Nieve'],
  [[80, 81], 'Chaparrones'], [[82], 'Chaparrones fuertes'], [[85, 86], 'Nevadas'], [[95], 'Tormenta'], [[96, 99], 'Tormenta con granizo'],
];
export const weatherText = (code) => WMO.find(([codes]) => codes.includes(code))?.[1] ?? null;

const COUNTRY_CODES = { Argentina: 'AR', Brazil: 'BR', Brasil: 'BR', Chile: 'CL', Uruguay: 'UY', Paraguay: 'PY', Bolivia: 'BO', Peru: 'PE', Ecuador: 'EC', Colombia: 'CO', Venezuela: 'VE' };

/** ¿Vale la pena pedir el pronóstico? Partido con horario, sin empezar y dentro de FORECAST_MAX_DAYS. */
export function wantsForecast(m, now = Date.now()) {
  const diff = Date.parse(m?.date) - now;
  return Boolean(m?.city && m.timeValid && m.status === 'pre' && diff > -36e5 && diff < FORECAST_MAX_DAYS * 864e5);
}

// La hora del partido redondeada hacia abajo, en UTC y con el formato que pide Open-Meteo («2026-10-17T23:00»).
export const forecastHour = (iso) => new Date(iso).toISOString().slice(0, 13) + ':00';

/** { temp, rain, text } para la hora del partido, o null si no hay datos. */
export function parseForecast(json) {
  const h = json?.hourly;
  if (!h?.time?.length) return null;
  const temp = h.temperature_2m?.[0];
  if (temp == null) return null;
  const rain = h.precipitation_probability?.[0] ?? null;
  const code = h.weather_code?.[0];
  let text = weatherText(code);
  // El código del tiempo es de un solo modelo y la probabilidad, de varios: «Llovizna · 19 % de lluvia» se lee como
  // una contradicción. Con probabilidad baja, la lluvia va como posibilidad.
  if (text && code >= 51 && rain != null && rain < 40) text = `Posible ${text.toLowerCase()}`;
  return { temp: Math.round(temp), rain, text };
}

// Canchas con coordenadas propias: la ciudad de ESPN («Buenos Aires») da el centro, a 12 km del Amalfitani.
const VENUES = { 'José Amalfitani': { latitude: -34.6355, longitude: -58.5207 } };

export async function fetchForecast(m, fetchImpl = fetch) {
  let place = VENUES[m.venue];
  if (!place) {
    const geoQs = new URLSearchParams({ name: m.city, count: '1', language: 'es' });
    if (COUNTRY_CODES[m.country]) geoQs.set('countryCode', COUNTRY_CODES[m.country]);
    const geo = await (await fetchImpl(`${GEO}?${geoQs}`)).json();
    place = geo.results?.[0];
  }
  if (!place) return null;
  const hour = forecastHour(m.date);
  const qs = new URLSearchParams({
    latitude: place.latitude, longitude: place.longitude, hourly: 'temperature_2m,precipitation_probability,weather_code',
    timezone: 'GMT', start_hour: hour, end_hour: hour,
  });
  return parseForecast(await (await fetchImpl(`${FORECAST}?${qs}`)).json());
}

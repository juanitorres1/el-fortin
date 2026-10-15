import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchForecast, forecastHour, parseForecast, wantsForecast, weatherText } from '../src/lib/weather.js';

const NOW = Date.parse('2026-10-15T12:00:00Z');
const m = (over = {}) => ({ id: '1', date: '2026-10-17T23:30Z', timeValid: true, status: 'pre', city: 'Buenos Aires', country: 'Argentina', ...over });

test('wantsForecast: solo partidos con horario, sin empezar y dentro de 7 días', () => {
  assert.equal(wantsForecast(m(), NOW), true);
  assert.equal(wantsForecast(m({ date: '2026-10-30T23:00Z' }), NOW), false);
  assert.equal(wantsForecast(m({ timeValid: false }), NOW), false);
  assert.equal(wantsForecast(m({ city: null }), NOW), false);
  assert.equal(wantsForecast(m({ status: 'in' }), NOW), false);
  assert.equal(wantsForecast(null, NOW), false);
});

test('forecastHour redondea hacia abajo en UTC', () => {
  assert.equal(forecastHour('2026-10-17T23:30Z'), '2026-10-17T23:00');
});

test('weatherText traduce códigos WMO y devuelve null si no lo conoce', () => {
  assert.equal(weatherText(0), 'Despejado');
  assert.equal(weatherText(63), 'Lluvia');
  assert.equal(weatherText(1234), null);
});

test('parseForecast redondea y tolera respuestas vacías', () => {
  assert.deepEqual(parseForecast({ hourly: { time: ['x'], temperature_2m: [11.6], precipitation_probability: [40], weather_code: [61] } }), { temp: 12, rain: 40, text: 'Lluvia débil' });
  assert.equal(parseForecast({}), null);
  assert.equal(parseForecast({ hourly: { time: ['x'], temperature_2m: [null] } }), null);
});

test('fetchForecast: geocodifica la ciudad (con país) y pide la hora del partido', async () => {
  const urls = [];
  const fake = async (url) => {
    urls.push(url);
    const body = url.includes('geocoding')
      ? { results: [{ latitude: -34.6, longitude: -58.4 }] }
      : { hourly: { time: ['2026-10-17T23:00'], temperature_2m: [18], precipitation_probability: [10], weather_code: [2] } };
    return { json: async () => body };
  };
  assert.deepEqual(await fetchForecast(m(), fake), { temp: 18, rain: 10, text: 'Parcialmente nublado' });
  assert.match(urls[0], /name=Buenos\+Aires/);
  assert.match(urls[0], /countryCode=AR/);
  assert.match(urls[1], /start_hour=2026-10-17T23%3A00/);
});
